import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

import type { Runbook } from '../components/runbooks/types'

const STORAGE_KEY = 'runbooks.json'

function generateId(): string {
    return `rb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nowISO(): string {
    return new Date().toISOString()
}

export const useRunbookStore = defineStore('runbook', () => {
    const runbooks = ref<Runbook[]>([])
    const selectedId = ref('')
    const loaded = ref(false)
    const saving = ref(false)

    const selectedRunbook = computed(() =>
        runbooks.value.find((r) => r.id === selectedId.value) ?? null,
    )

    // --- Persistence via existing IPC (zero Rust changes) ---

    async function loadRunbooks(): Promise<void> {
        try {
            const raw = await invoke<string>('read_data_file', { relativePath: STORAGE_KEY })
            if (raw) {
                const parsed = JSON.parse(raw) as Runbook[]
                runbooks.value = Array.isArray(parsed) ? parsed : []
            }
        } catch (e) {
            console.warn('[runbookStore] loadRunbooks failed:', e)
            runbooks.value = []
        } finally {
            loaded.value = true
        }
    }

    async function persist(): Promise<void> {
        saving.value = true
        try {
            const content = JSON.stringify(runbooks.value, null, 2)
            await invoke('write_data_file', { relativePath: STORAGE_KEY, content })
        } catch (e) {
            console.error('[runbookStore] persist failed:', e)
        } finally {
            saving.value = false
        }
    }

    // --- CRUD ---

    async function createRunbook(name: string): Promise<string> {
        const rb: Runbook = {
            id: generateId(),
            name,
            content: '',
            createdAt: nowISO(),
            updatedAt: nowISO(),
        }
        runbooks.value = [rb, ...runbooks.value]
        selectedId.value = rb.id
        await persist()
        return rb.id
    }

    async function updateRunbook(id: string, patch: Partial<Pick<Runbook, 'name' | 'content'>>): Promise<void> {
        const rb = runbooks.value.find((r) => r.id === id)
        if (!rb) return
        if (patch.name !== undefined) rb.name = patch.name
        if (patch.content !== undefined) rb.content = patch.content
        rb.updatedAt = nowISO()
        await persist()
    }

    async function deleteRunbook(id: string): Promise<void> {
        runbooks.value = runbooks.value.filter((r) => r.id !== id)
        if (selectedId.value === id) {
            selectedId.value = runbooks.value[0]?.id ?? ''
        }
        await persist()
    }

    function selectRunbook(id: string) {
        if (runbooks.value.some((r) => r.id === id)) {
            selectedId.value = id
        }
    }

    return {
        runbooks,
        selectedId,
        selectedRunbook,
        loaded,
        saving,
        loadRunbooks,
        createRunbook,
        updateRunbook,
        deleteRunbook,
        selectRunbook,
    }
})
