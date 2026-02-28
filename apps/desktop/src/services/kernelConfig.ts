/**
 * Kernel config service — manages OpenCode's config.json.
 *
 * Reads/writes to {kernel-state}/opencode/config.json via Tauri IPC.
 * This service is desktop-only: any I/O failure is surfaced to callers.
 *
 * This is a pure service (no Vue reactivity). Use directly from
 * stores, composables, or other services.
 */

// ---------------------------------------------------------------------------
// OpenCode config model — typed representation of config.json
// ---------------------------------------------------------------------------

interface ProviderOptions {
    apiKey?: string
    baseURL?: string
}

interface ProviderConfig {
    options?: ProviderOptions
}

interface AgentBuildConfig {
    description?: string
    prompt?: string
}

export interface OpenCodeConfig {
    $schema?: string
    /** Global default model in "providerID/modelID" format */
    model?: string
    /** Lightweight model for title/summary generation */
    small_model?: string
    /** Agent overrides */
    agent?: { build?: AgentBuildConfig;[key: string]: unknown }
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

async function readRaw(): Promise<string> {
    try {
        const invoke = await getTauriInvoke()
        return await invoke<string>('read_kernel_config')
    } catch (error: unknown) {
        throw new Error(
            `Failed to read kernel config: ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

async function writeRaw(content: string): Promise<void> {
    try {
        const invoke = await getTauriInvoke()
        await invoke('write_kernel_config', { content })
    } catch (error: unknown) {
        throw new Error(
            `Failed to write kernel config: ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

// ---------------------------------------------------------------------------
// Config operations
// ---------------------------------------------------------------------------

export async function loadConfig(): Promise<OpenCodeConfig> {
    const raw = await readRaw()
    if (!raw) return { $schema: 'https://opencode.ai/config.json' }

    try {
        return JSON.parse(raw) as OpenCodeConfig
    } catch {
        return { $schema: 'https://opencode.ai/config.json' }
    }
}

export async function saveConfig(config: OpenCodeConfig): Promise<void> {
    config.$schema = 'https://opencode.ai/config.json'
    await writeRaw(JSON.stringify(config, null, 2))
}

// ---------------------------------------------------------------------------
// Global model — Source of Truth for which model the kernel uses
// ---------------------------------------------------------------------------

/** Read the global model from config.json. Returns null if not set. */
export async function getGlobalModel(): Promise<{ providerID: string; modelID: string } | null> {
    const config = await loadConfig()
    if (typeof config.model !== 'string' || !config.model.includes('/')) return null
    const slashIdx = config.model.indexOf('/')
    return {
        providerID: config.model.slice(0, slashIdx),
        modelID: config.model.slice(slashIdx + 1),
    }
}

/** Write the global model to config.json. This is the only way to change model. */
export async function setGlobalModel(providerID: string, modelID: string): Promise<void> {
    const config = await loadConfig()
    config.model = `${providerID}/${modelID}`
    await saveConfig(config)
}

// ---------------------------------------------------------------------------
// Agent identity — AlderCowork overrides the built-in build agent's prompt
// ---------------------------------------------------------------------------

/** Ensure agent.build has AlderCowork's description and prompt in config.json. */
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

export async function getApiKey(providerId: string): Promise<string | null> {
    const config = await loadConfig()
    return config.provider?.[providerId]?.options?.apiKey ?? null
}

export async function setApiKey(providerId: string, apiKey: string): Promise<void> {
    const config = await loadConfig()

    if (!config.provider) config.provider = {}
    if (!config.provider[providerId]) config.provider[providerId] = {}
    if (!config.provider[providerId].options) config.provider[providerId].options = {}

    config.provider[providerId].options!.apiKey = apiKey
    await saveConfig(config)
}

export async function removeApiKey(providerId: string): Promise<void> {
    const config = await loadConfig()

    if (config.provider?.[providerId]?.options) {
        delete config.provider[providerId].options!.apiKey

        // Clean up empty objects
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

    if (!config.provider) config.provider = {}
    if (!config.provider[providerId]) config.provider[providerId] = {}
    if (!config.provider[providerId].options) config.provider[providerId].options = {}

    if (baseURL) {
        config.provider[providerId].options!.baseURL = baseURL
    } else {
        delete config.provider[providerId].options!.baseURL
    }

    await saveConfig(config)
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
        throw new Error(
            `Failed to read Hub token: ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

export async function setHubToken(token: string): Promise<void> {
    try {
        const invoke = await getTauriInvoke()
        await invoke('write_data_file', { relativePath: '.hub-token', content: token })
    } catch (error: unknown) {
        throw new Error(
            `Failed to write Hub token: ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

export async function removeHubToken(): Promise<void> {
    try {
        const invoke = await getTauriInvoke()
        await invoke('write_data_file', { relativePath: '.hub-token', content: '' })
    } catch (error: unknown) {
        throw new Error(
            `Failed to remove Hub token: ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}
