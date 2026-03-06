import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { APP_MODE, type AppMode } from '../config/build'
import { useDataPaths } from '../composables/useDataPaths'
import { useProfileStore } from './profile'

const SETTINGS_FILE = 'settings.json'
const LEGACY_STORAGE_KEY = 'aldercowork:settings'

// ---------------------------------------------------------------------------
// Provider registry — builtin providers supported by OpenCode
// ---------------------------------------------------------------------------

export interface ProviderDefinition {
    id: string
    label: string
    envVar: string
    /** Optional: env var for custom base URL */
    baseUrlEnvVar?: string
    /** Whether this provider accepts a custom base URL */
    supportsBaseUrl: boolean
    /** Region hint */
    region: 'global' | 'cn'
    /** Default base URL (if any) */
    defaultBaseUrl?: string
    /** Show in onboarding welcome screen */
    featured?: boolean
    /** Short description for the welcome screen */
    description?: string
}

/**
 * Provider registry — strictly aligned with OpenCode's models.dev/api.json.
 *
 * Every `id` and `envVar` here is a 1:1 match to the models.dev provider
 * database that the OpenCode kernel loads at runtime.
 * DO NOT add providers that don't exist in models.dev/api.json.
 *
 * Source of truth: https://models.dev/api.json
 * Verified: 2026-03-01
 */
export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
    // ── Global providers ─────────────────────────────────────────────
    { id: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', supportsBaseUrl: true, region: 'global', featured: true, description: 'Claude series' },
    { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY', supportsBaseUrl: true, region: 'global', featured: true, description: 'GPT series' },
    { id: 'google', label: 'Google', envVar: 'GOOGLE_GENERATIVE_AI_API_KEY', supportsBaseUrl: false, region: 'global', featured: true, description: 'Gemini series' },
    { id: 'xai', label: 'xAI', envVar: 'XAI_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'mistral', label: 'Mistral', envVar: 'MISTRAL_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'groq', label: 'Groq', envVar: 'GROQ_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'togetherai', label: 'Together AI', envVar: 'TOGETHER_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'fireworks-ai', label: 'Fireworks AI', envVar: 'FIREWORKS_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'openrouter', label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'amazon-bedrock', label: 'Amazon Bedrock', envVar: 'AWS_ACCESS_KEY_ID', supportsBaseUrl: true, region: 'global' },
    { id: 'azure', label: 'Azure', envVar: 'AZURE_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'perplexity', label: 'Perplexity', envVar: 'PERPLEXITY_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'cohere', label: 'Cohere', envVar: 'COHERE_API_KEY', supportsBaseUrl: true, region: 'global' },

    // ── Moonshot AI / Kimi ───────────────────────────────────────────
    { id: 'moonshotai', label: 'Moonshot AI', envVar: 'MOONSHOT_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'moonshotai-cn', label: 'Moonshot AI (China)', envVar: 'MOONSHOT_API_KEY', supportsBaseUrl: true, region: 'cn' },
    { id: 'kimi-for-coding', label: 'Kimi For Coding', envVar: 'KIMI_API_KEY', supportsBaseUrl: true, region: 'global', featured: true, description: 'Kimi K2.5' },

    // ── MiniMax ──────────────────────────────────────────────────────
    { id: 'minimax', label: 'MiniMax (minimax.io)', envVar: 'MINIMAX_API_KEY', supportsBaseUrl: true, region: 'global', featured: true, description: 'MiniMax M2.5' },
    { id: 'minimax-cn', label: 'MiniMax (minimaxi.com)', envVar: 'MINIMAX_API_KEY', supportsBaseUrl: true, region: 'cn' },
    { id: 'minimax-coding-plan', label: 'MiniMax Coding Plan (minimax.io)', envVar: 'MINIMAX_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'minimax-cn-coding-plan', label: 'MiniMax Coding Plan (minimaxi.com)', envVar: 'MINIMAX_API_KEY', supportsBaseUrl: true, region: 'cn' },

    // ── China mainland providers ─────────────────────────────────────
    { id: 'deepseek', label: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', supportsBaseUrl: true, region: 'cn', featured: true, description: 'DeepSeek V3 / R1' },
    { id: 'zhipuai', label: 'Zhipu AI', envVar: 'ZHIPU_API_KEY', supportsBaseUrl: true, region: 'cn' },
    { id: 'zhipuai-coding-plan', label: 'Zhipu AI Coding Plan', envVar: 'ZHIPU_API_KEY', supportsBaseUrl: true, region: 'cn' },
    { id: 'zai', label: 'Z.AI', envVar: 'ZHIPU_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'zai-coding-plan', label: 'Z.AI Coding Plan', envVar: 'ZHIPU_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'alibaba', label: 'Alibaba', envVar: 'DASHSCOPE_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'alibaba-cn', label: 'Alibaba (China)', envVar: 'DASHSCOPE_API_KEY', supportsBaseUrl: true, region: 'cn' },
    { id: 'siliconflow', label: 'SiliconFlow', envVar: 'SILICONFLOW_API_KEY', supportsBaseUrl: true, region: 'global' },
    { id: 'siliconflow-cn', label: 'SiliconFlow (China)', envVar: 'SILICONFLOW_CN_API_KEY', supportsBaseUrl: true, region: 'cn' },
    { id: 'stepfun', label: 'StepFun', envVar: 'STEPFUN_API_KEY', supportsBaseUrl: true, region: 'cn' },
]

/** Providers shown on the onboarding welcome screen — derived, not manually maintained */
export const FEATURED_PROVIDERS = BUILTIN_PROVIDERS.filter((p) => p.featured)

// ---------------------------------------------------------------------------
// Provider instance state — per-user configuration
// ---------------------------------------------------------------------------

export interface ProviderState {
    id: string
    enabled: boolean
    hasKey: boolean
    baseUrl: string
    /** Source of config — 'local' for standalone, 'hub' for enterprise */
    source: 'local' | 'hub'
}

// ---------------------------------------------------------------------------
// Persisted settings schema
// ---------------------------------------------------------------------------

export interface ModelSelection {
    providerID: string
    modelID: string
}

export interface WorkspacePersisted {
    id: string
    path: string
    label: string
    lastUsedAt: string
}

interface PersistedSettings {
    mode: AppMode
    configured: boolean
    defaultProvider: string

    providers: Record<string, Omit<ProviderState, 'id'>>
    recentWorkspaces: WorkspacePersisted[]
    activeWorkspaceId: string | null
}

const DEFAULTS: PersistedSettings = {
    mode: APP_MODE,
    configured: false,
    defaultProvider: 'anthropic',

    providers: {},
    recentWorkspaces: [],
    activeWorkspaceId: null,
}

function parseModelSelection(v: unknown): ModelSelection | null {
    if (typeof v !== 'object' || v === null) return null
    const rec = v as Record<string, unknown>
    const providerID = typeof rec.providerID === 'string' ? rec.providerID : ''
    const modelID = typeof rec.modelID === 'string' ? rec.modelID : ''
    return providerID && modelID ? { providerID, modelID } : null
}

function parseWorkspacePersisted(v: unknown): WorkspacePersisted | null {
    if (typeof v !== 'object' || v === null) return null
    const rec = v as Record<string, unknown>
    const id = typeof rec.id === 'string' ? rec.id : ''
    const path = typeof rec.path === 'string' ? rec.path : ''
    const label = typeof rec.label === 'string' ? rec.label : ''
    const lastUsedAt = typeof rec.lastUsedAt === 'string' ? rec.lastUsedAt : new Date().toISOString()

    if (!id || !path) return null

    return { id, path, label: label || 'Workspace', lastUsedAt }
}

function parseSettings(raw: string): PersistedSettings {
    try {
        if (!raw) return { ...DEFAULTS }

        const parsed = JSON.parse(raw) as Partial<PersistedSettings>
        return {
            mode: parsed.mode === 'enterprise' ? 'enterprise' : APP_MODE,
            configured: typeof parsed.configured === 'boolean' ? parsed.configured : false,
            defaultProvider: typeof parsed.defaultProvider === 'string' ? parsed.defaultProvider : 'anthropic',

            providers: typeof parsed.providers === 'object' && parsed.providers !== null
                ? parsed.providers as Record<string, Omit<ProviderState, 'id'>>
                : {},
            recentWorkspaces: Array.isArray(parsed.recentWorkspaces)
                ? parsed.recentWorkspaces
                    .map((w) => parseWorkspacePersisted(w))
                    .filter((w): w is WorkspacePersisted => Boolean(w))
                : [],
            activeWorkspaceId: typeof parsed.activeWorkspaceId === 'string'
                ? parsed.activeWorkspaceId
                : null,
        }
    } catch {
        return { ...DEFAULTS }
    }
}

function serializeSettings(settings: PersistedSettings): string {
    return JSON.stringify(settings, null, 2)
}

/**
 * Migrate from localStorage to file-based persistence (one-time).
 * Returns the migrated data if found, or null.
 */
function migrateFromLocalStorage(): PersistedSettings | null {
    try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
        if (!raw) return null

        const settings = parseSettings(raw)
        localStorage.removeItem(LEGACY_STORAGE_KEY)
        return settings
    } catch {
        return null
    }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSettingsStore = defineStore('settings', () => {
    const { readDataFile, writeDataFile } = useDataPaths()
    const profileStore = useProfileStore()

    const mode = ref<AppMode>(APP_MODE)
    const configured = ref(false)
    const defaultProvider = ref('anthropic')

    const providerStates = ref<Record<string, Omit<ProviderState, 'id'>>>({})
    const recentWorkspaces = ref<WorkspacePersisted[]>([])
    const activeWorkspaceId = ref<string | null>(null)
    const loaded = ref(false)

    // --- Init: load from file, with localStorage migration ---

    function applyManagedProfileOverlay() {
        const managed = profileStore.managedSettings
        if (!managed) return

        if (managed.defaultProvider) {
            defaultProvider.value = managed.defaultProvider
        }

        if (Object.keys(managed.providerOverrides).length > 0) {
            const nextStates = { ...providerStates.value }
            for (const [providerId, overrideState] of Object.entries(managed.providerOverrides)) {
                const current = nextStates[providerId] ?? {
                    enabled: false,
                    hasKey: false,
                    baseUrl: '',
                    source: 'local' as const,
                }
                nextStates[providerId] = {
                    enabled: overrideState.enabled ?? current.enabled,
                    hasKey: overrideState.hasKey ?? current.hasKey,
                    baseUrl: overrideState.baseUrl ?? current.baseUrl,
                    source: overrideState.source ?? 'hub',
                }
            }
            providerStates.value = nextStates
        }
    }

    async function init() {
        loaded.value = false
        applySettings({ ...DEFAULTS })

        // Try file-based settings first
        const fileContent = await readDataFile(SETTINGS_FILE)

        if (fileContent) {
            const settings = parseSettings(fileContent)
            applySettings(settings)
        } else {
            const migrated = migrateFromLocalStorage()
            if (migrated) {
                applySettings(migrated)
                // Persist migrated data to file
                await persist()
            }
        }

        applyManagedProfileOverlay()
        loaded.value = true
    }

    async function reload() {
        await init()
    }

    function applySettings(settings: PersistedSettings) {
        mode.value = profileStore.activeProfile?.kind === 'enterprise' || settings.mode === 'enterprise'
            ? 'enterprise'
            : 'standalone'
        configured.value = settings.configured
        defaultProvider.value = settings.defaultProvider

        providerStates.value = settings.providers
        recentWorkspaces.value = settings.recentWorkspaces
        activeWorkspaceId.value = settings.activeWorkspaceId
    }

    function currentSnapshot(): PersistedSettings {
        return {
            mode: profileStore.activeProfile?.kind === 'enterprise' ? 'enterprise' : 'standalone',
            configured: configured.value,
            defaultProvider: defaultProvider.value,

            providers: providerStates.value,
            recentWorkspaces: recentWorkspaces.value,
            activeWorkspaceId: activeWorkspaceId.value,
        }
    }

    async function persist() {
        const data = serializeSettings(currentSnapshot())
        await writeDataFile(SETTINGS_FILE, data)
    }

    // --- Computed ---

    /** All providers with their current state merged */
    const providers = computed<ProviderState[]>(() => {
        return BUILTIN_PROVIDERS.map((def) => {
            const state = providerStates.value[def.id]
            return {
                id: def.id,
                enabled: state?.enabled ?? false,
                hasKey: state?.hasKey ?? false,
                baseUrl: state?.baseUrl ?? def.defaultBaseUrl ?? '',
                source: state?.source ?? 'local',
            }
        })
    })

    /** Providers grouped by region */
    const globalProviders = computed(() =>
        providers.value.filter((p) => {
            const def = BUILTIN_PROVIDERS.find((d) => d.id === p.id)
            return def?.region === 'global'
        }),
    )

    const cnProviders = computed(() =>
        providers.value.filter((p) => {
            const def = BUILTIN_PROVIDERS.find((d) => d.id === p.id)
            return def?.region === 'cn'
        }),
    )

    /** Currently active (enabled + has key) providers */
    const activeProviders = computed(() =>
        providers.value.filter((p) => p.enabled && p.hasKey),
    )

    /** Provider definition lookup */
    const getProviderDef = (id: string): ProviderDefinition | undefined =>
        BUILTIN_PROVIDERS.find((d) => d.id === id)

    const defaultProviderDef = computed(() =>
        getProviderDef(defaultProvider.value) ?? BUILTIN_PROVIDERS[0],
    )
    const providersLocked = computed(() => profileStore.isSectionLocked('providers'))
    const workspaceLocked = computed(() => profileStore.isSectionLocked('workspace'))
    const modelLocked = computed(() => profileStore.isSectionLocked('model'))

    // --- Mutations ---

    function updateProviderState(id: string, patch: Partial<Omit<ProviderState, 'id'>>) {
        if (providersLocked.value) return
        const current = providerStates.value[id] ?? {
            enabled: false,
            hasKey: false,
            baseUrl: '',
            source: 'local' as const,
        }
        providerStates.value = {
            ...providerStates.value,
            [id]: { ...current, ...patch },
        }
    }

    function markProviderKey(id: string, hasKey: boolean) {
        if (providersLocked.value) return
        updateProviderState(id, { hasKey, enabled: hasKey })
    }

    function setProviderBaseUrl(id: string, baseUrl: string) {
        if (providersLocked.value) return
        updateProviderState(id, { baseUrl })
    }

    function setDefaultProvider(id: string) {
        if (providersLocked.value) return
        defaultProvider.value = id
    }

    function markConfigured() {
        configured.value = true
    }

    function setWorkspaceState(workspaces: WorkspacePersisted[], activeId: string | null) {
        if (workspaceLocked.value) return
        recentWorkspaces.value = workspaces
        activeWorkspaceId.value = activeId
    }

    // --- Persistence watcher — auto-save to file on any change ---

    watch(
        [mode, configured, defaultProvider, providerStates, recentWorkspaces, activeWorkspaceId],
        () => {
            if (loaded.value) {
                void persist()
            }
        },
        { deep: true },
    )

    // Kick off async init (non-blocking — store is usable with defaults immediately)
    void init()

    return {
        // State
        mode,
        configured,
        defaultProvider,
        providerStates,
        recentWorkspaces,
        activeWorkspaceId,
        loaded,

        // Computed
        providers,
        globalProviders,
        cnProviders,
        activeProviders,
        defaultProviderDef,
        providersLocked,
        workspaceLocked,
        modelLocked,

        // Actions
        init,
        reload,
        getProviderDef,
        updateProviderState,
        markProviderKey,
        setProviderBaseUrl,
        setDefaultProvider,

        markConfigured,
        setWorkspaceState,

    }
})
