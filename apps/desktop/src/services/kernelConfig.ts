/**
 * Kernel config service — manages OpenCode's config.json.
 *
 * Reads/writes to {engine}/opencode/config.json via Tauri IPC.
 * This is a pure service (no Vue reactivity). Use directly from
 * stores, composables, or other services.
 */

const CONFIG_SCHEMA = 'https://opencode.ai/config.json'

// ---------------------------------------------------------------------------
// OpenCode config model — typed representation of config.json
// ---------------------------------------------------------------------------

export interface ProviderOptions {
    apiKey?: string
    baseURL?: string
}

/** Must match OpenCode's mimeToModality() tokens (transform.ts) */
export type Modality = 'text' | 'audio' | 'image' | 'video' | 'pdf'

export interface ModelModalities {
    input?: Modality[]
    output?: Modality[]
}

export interface ModelConfig {
    name?: string
    id?: string
    modalities?: ModelModalities
    limit?: { context?: number; output?: number }
    options?: Record<string, unknown>
}

export interface ProviderConfig {
    options?: ProviderOptions
    models?: Record<string, ModelConfig>
    npm?: string
    name?: string
}

export interface OpenCodeConfig {
    $schema?: string
    /** Global default model in "providerID/modelID" format */
    model?: string
    /** Lightweight model for title/summary generation */
    small_model?: string
    /** Agent overrides */
    agent?: { build?: { description?: string; prompt?: string } }
    provider?: Record<string, ProviderConfig>
    disabled_providers?: string[]
    [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Backend I/O
// ---------------------------------------------------------------------------

function isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function getTauriInvoke() {
    if (!isTauriRuntime()) {
        throw new Error('Kernel config I/O requires Tauri runtime')
    }
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke
}

function wrapIpcError(action: string, error: unknown): never {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to ${action}: ${detail}`)
}

async function readRaw(): Promise<string> {
    try {
        const invoke = await getTauriInvoke()
        return await invoke<string>('read_kernel_config')
    } catch (error: unknown) {
        wrapIpcError('read kernel config', error)
    }
}

async function writeRaw(content: string): Promise<void> {
    try {
        const invoke = await getTauriInvoke()
        await invoke('write_kernel_config', { content })
    } catch (error: unknown) {
        wrapIpcError('write kernel config', error)
    }
}

// ---------------------------------------------------------------------------
// Config operations
// ---------------------------------------------------------------------------

export async function loadConfig(): Promise<OpenCodeConfig> {
    const raw = await readRaw()
    if (!raw) return { $schema: CONFIG_SCHEMA }

    try {
        return JSON.parse(raw) as OpenCodeConfig
    } catch {
        return { $schema: CONFIG_SCHEMA }
    }
}

export async function saveConfig(config: OpenCodeConfig): Promise<void> {
    config.$schema = CONFIG_SCHEMA
    await writeRaw(JSON.stringify(config, null, 2))
}

// ---------------------------------------------------------------------------
// Global model — Source of Truth for which model the kernel uses
// ---------------------------------------------------------------------------

export async function getGlobalModel(): Promise<{ providerID: string; modelID: string } | null> {
    const config = await loadConfig()
    if (typeof config.model !== 'string' || !config.model.includes('/')) return null
    const slashIdx = config.model.indexOf('/')
    return {
        providerID: config.model.slice(0, slashIdx),
        modelID: config.model.slice(slashIdx + 1),
    }
}

export async function setGlobalModel(providerID: string, modelID: string): Promise<void> {
    const config = await loadConfig()
    config.model = `${providerID}/${modelID}`
    await saveConfig(config)
}

// ---------------------------------------------------------------------------
// Agent identity — AlderCowork overrides the built-in build agent's prompt
// ---------------------------------------------------------------------------

export async function ensureAgentIdentity(
    description: string,
    promptRef: string,
): Promise<void> {
    const config = await loadConfig()
    if (!config.agent) config.agent = {}
    if (!config.agent.build) config.agent.build = {}
    config.agent.build.description = description
    config.agent.build.prompt = promptRef
    await saveConfig(config)
}

// ---------------------------------------------------------------------------
// Provider key management
// ---------------------------------------------------------------------------

/** Ensure provider.options path exists, return the options object. */
function ensureProviderOptions(config: OpenCodeConfig, providerId: string): ProviderOptions {
    if (!config.provider) config.provider = {}
    if (!config.provider[providerId]) config.provider[providerId] = {}
    if (!config.provider[providerId].options) config.provider[providerId].options = {}
    return config.provider[providerId].options!
}

export async function getApiKey(providerId: string): Promise<string | null> {
    const config = await loadConfig()
    return config.provider?.[providerId]?.options?.apiKey ?? null
}

export async function setApiKey(providerId: string, apiKey: string): Promise<void> {
    const config = await loadConfig()
    ensureProviderOptions(config, providerId).apiKey = apiKey
    await saveConfig(config)
}

export async function removeApiKey(providerId: string): Promise<void> {
    const config = await loadConfig()

    if (config.provider?.[providerId]?.options) {
        delete config.provider[providerId].options!.apiKey

        if (Object.keys(config.provider[providerId].options!).length === 0) {
            delete config.provider[providerId].options
        }
        if (Object.keys(config.provider[providerId]).length === 0) {
            delete config.provider[providerId]
        }
        if (Object.keys(config.provider).length === 0) {
            delete config.provider
        }
    }

    await saveConfig(config)
}

export async function setBaseUrl(providerId: string, baseURL: string): Promise<void> {
    const config = await loadConfig()
    const opts = ensureProviderOptions(config, providerId)

    if (baseURL) {
        opts.baseURL = baseURL
    } else {
        delete opts.baseURL
    }

    await saveConfig(config)
}

// ---------------------------------------------------------------------------
// Runtime auth sync — hot-update credentials without kernel restart
// ---------------------------------------------------------------------------

/**
 * Sync an API key to the running kernel via SDK `auth.set()`.
 * config.json write (setApiKey) handles persistence; this handles runtime effect.
 */
export async function syncAuthToKernel(
    client: unknown,
    providerId: string,
    apiKey: string,
): Promise<void> {
    if (!client) return
    try {
        const c = client as { auth: { set: (p: { providerID: string; auth: { type: string; key: string } }) => Promise<unknown> } }
        await c.auth.set({ providerID: providerId, auth: { type: 'api', key: apiKey } })
    } catch (e) {
        console.warn(`[kernelConfig] runtime auth sync failed for ${providerId}:`, e)
    }
}

/**
 * Remove auth from the running kernel via SDK `auth.remove()`.
 */
export async function removeAuthFromKernel(
    client: unknown,
    providerId: string,
): Promise<void> {
    if (!client) return
    try {
        const c = client as { auth: { remove: (p: { providerID: string }) => Promise<unknown> } }
        await c.auth.remove({ providerID: providerId })
    } catch (e) {
        console.warn(`[kernelConfig] runtime auth remove failed for ${providerId}:`, e)
    }
}

// ---------------------------------------------------------------------------
// Hub token — stored outside OpenCode config
// ---------------------------------------------------------------------------

export async function getHubToken(): Promise<string | null> {
    try {
        const invoke = await getTauriInvoke()
        const raw = await invoke<string>('read_data_file', { relativePath: '.hub-token' })
        return raw || null
    } catch (error: unknown) {
        wrapIpcError('read Hub token', error)
    }
}

export async function setHubToken(token: string): Promise<void> {
    try {
        const invoke = await getTauriInvoke()
        await invoke('write_data_file', { relativePath: '.hub-token', content: token })
    } catch (error: unknown) {
        wrapIpcError('write Hub token', error)
    }
}

export async function removeHubToken(): Promise<void> {
    try {
        const invoke = await getTauriInvoke()
        await invoke('write_data_file', { relativePath: '.hub-token', content: '' })
    } catch (error: unknown) {
        wrapIpcError('remove Hub token', error)
    }
}
