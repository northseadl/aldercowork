import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useSettingsStore, type WorkspacePersisted } from './settings'
import { useProfileStore } from './profile'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Workspace {
    id: string
    path: string
    label: string
    lastUsedAt: string
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = defineStore('workspace', () => {
    const settingsStore = useSettingsStore()
    const profileStore = useProfileStore()
    const activeWorkspace = ref<Workspace | null>(null)
    const recentWorkspaces = ref<Workspace[]>([])
    const loaded = ref(false)
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    // Reactive display label
    const activeLabel = computed(() => activeWorkspace.value?.label ?? 'Workspace')
    const activePath = computed(() => activeWorkspace.value?.path ?? null)

    // ── Persistence via Tauri IPC ──

    async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
        return tauriInvoke<T>(cmd, args)
    }

    function extractLabel(path: string): string {
        const parts = path.replace(/\/+$/, '').split('/')
        return parts[parts.length - 1] || 'Workspace'
    }

    function generateId(): string {
        return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }

    function asPersisted(workspaces: Workspace[]): WorkspacePersisted[] {
        return workspaces.map((w) => ({
            id: w.id,
            path: w.path,
            label: w.label,
            lastUsedAt: w.lastUsedAt,
        }))
    }

    function syncToSettings() {
        settingsStore.setWorkspaceState(
            asPersisted(recentWorkspaces.value),
            activeWorkspace.value?.id ?? null,
        )
    }

    async function waitForSettingsLoaded() {
        if (settingsStore.loaded) return
        await new Promise<void>((resolve) => {
            const stop = watch(
                () => settingsStore.loaded,
                (isLoaded) => {
                    if (!isLoaded) return
                    stop()
                    resolve()
                },
                { immediate: true },
            )
        })
    }

    async function loadFromSettings() {
        loaded.value = false
        if (saveTimer) {
            clearTimeout(saveTimer)
            saveTimer = null
        }
        recentWorkspaces.value = []
        activeWorkspace.value = null
        await waitForSettingsLoaded()

        try {
            const recent = settingsStore.recentWorkspaces.map((w) => ({ ...w }))
            const activeId = settingsStore.activeWorkspaceId

            recentWorkspaces.value = recent
            activeWorkspace.value = (activeId ? recent.find((w) => w.id === activeId) : recent[0]) ?? null

            if (profileStore.workspaceLocked) {
                recentWorkspaces.value = []
                activeWorkspace.value = null
            }

            if (!activeWorkspace.value) {
                await initDefault()
            }
        } catch {
            await initDefault()
        }

        loaded.value = true
        syncToSettings()
    }

    async function reloadForProfile() {
        if (saveTimer) {
            clearTimeout(saveTimer)
            saveTimer = null
        }
        await loadFromSettings()
    }

    async function initDefault() {
        try {
            const defaultPath = await invoke<string>('get_default_workspace')
            const ws: Workspace = {
                id: 'default',
                path: defaultPath,
                label: 'Workspace',
                lastUsedAt: new Date().toISOString(),
            }
            activeWorkspace.value = ws
            if (!recentWorkspaces.value.find((w) => w.id === 'default')) {
                recentWorkspaces.value = [ws, ...recentWorkspaces.value]
            }
        } catch (e) {
            console.error('[workspace] Failed to get default workspace path:', e)
        }
    }

    // ── Public actions ──

    function switchWorkspace(id: string) {
        const target = recentWorkspaces.value.find((w) => w.id === id)
        if (!target) return
        target.lastUsedAt = new Date().toISOString()
        activeWorkspace.value = target
        syncToSettings()
    }

    async function openProjectFolder(): Promise<string | null> {
        if (profileStore.workspaceLocked) {
            return null
        }

        try {
            const selected = await invoke<string | null>('select_workspace')
            if (!selected) return null

            // Check if already in recent list
            const existing = recentWorkspaces.value.find((w) => w.path === selected)
            if (existing) {
                switchWorkspace(existing.id)
                return existing.id
            }

            const ws: Workspace = {
                id: generateId(),
                path: selected,
                label: extractLabel(selected),
                lastUsedAt: new Date().toISOString(),
            }
            recentWorkspaces.value = [ws, ...recentWorkspaces.value].slice(0, 10) // Max 10 recent
            activeWorkspace.value = ws
            syncToSettings()
            return ws.id
        } catch (e) {
            console.error('[workspace] Failed to open folder:', e)
            return null
        }
    }

    function removeWorkspace(id: string) {
        if (profileStore.workspaceLocked) return
        if (id === 'default') return // Can't remove default
        recentWorkspaces.value = recentWorkspaces.value.filter((w) => w.id !== id)
        if (activeWorkspace.value?.id === id) {
            activeWorkspace.value = recentWorkspaces.value[0] ?? null
        }
        syncToSettings()
    }

    // Debounced auto-save
    watch([activeWorkspace, recentWorkspaces], () => {
        if (!loaded.value) return
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => syncToSettings(), 500)
    }, { deep: true })

    return {
        activeWorkspace,
        activeLabel,
        activePath,
        recentWorkspaces,
        loaded,
        loadFromSettings,
        reloadForProfile,
        switchWorkspace,
        openProjectFolder,
        removeWorkspace,
    }
})
