import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/core'

import { migrateRunbook, createStepId } from '../components/runbooks/types'

import type { Runbook, RunbookStep } from '../components/runbooks/types'

const STORAGE_KEY = 'runbooks.json'

export const useRunbookStore = defineStore('runbook', () => {
    const runbooks = ref<Runbook[]>([])
    const selectedId = ref('')
    const loaded = ref(false)
    const saving = ref(false)

    // --- Serialize queue: prevents concurrent writes (soul.md: Single-writer persistence) ---
    let persistPromise: Promise<void> | null = null
    let pendingPersist = false

    async function persist(): Promise<void> {
        if (persistPromise) {
            pendingPersist = true
            return
        }
        persistPromise = doPersist()
        try {
            await persistPromise
        } finally {
            persistPromise = null
        }
        if (pendingPersist) {
            pendingPersist = false
            await persist()
        }
    }

    async function doPersist(): Promise<void> {
        saving.value = true
        try {
            const content = JSON.stringify(runbooks.value, null, 2)
            await invoke('write_data_file', { relativePath: STORAGE_KEY, content })
        } finally {
            saving.value = false
        }
    }

    // --- CRUD ---

    const selectedRunbook = computed(() =>
        runbooks.value.find((r) => r.id === selectedId.value) ?? null,
    )

    async function loadRunbooks(): Promise<void> {
        try {
            const raw = await invoke<string>('read_data_file', { relativePath: STORAGE_KEY })
            const parsed = JSON.parse(raw) as unknown[]
            runbooks.value = parsed.map((item) => migrateRunbook(item as Parameters<typeof migrateRunbook>[0]))
            loaded.value = true

            // Check if migration changed any runbook and persist if so
            const migrated = JSON.stringify(runbooks.value)
            if (migrated !== raw) {
                await persist()
            }
        } catch {
            runbooks.value = []
            loaded.value = true
        }
    }

    async function reload(): Promise<void> {
        runbooks.value = []
        selectedId.value = ''
        loaded.value = false
        await loadRunbooks()
    }

    function selectRunbook(id: string): void {
        selectedId.value = id
    }

    async function createRunbook(): Promise<string> {
        const now = new Date().toISOString()
        const rb: Runbook = {
            id: `rb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: '',
            body: '',
            steps: [],
            createdAt: now,
            updatedAt: now,
        }
        runbooks.value = [rb, ...runbooks.value]
        selectedId.value = rb.id
        await persist()
        return rb.id
    }

    async function updateRunbook(
        id: string,
        patch: Partial<Pick<Runbook, 'name' | 'body' | 'steps'>>,
    ): Promise<void> {
        const rb = runbooks.value.find((r) => r.id === id)
        if (!rb) return

        if (patch.name !== undefined) rb.name = patch.name
        if (patch.body !== undefined) rb.body = patch.body
        if (patch.steps !== undefined) rb.steps = patch.steps
        rb.updatedAt = new Date().toISOString()

        await persist()
    }

    async function deleteRunbook(id: string): Promise<void> {
        runbooks.value = runbooks.value.filter((r) => r.id !== id)
        if (selectedId.value === id) {
            selectedId.value = runbooks.value[0]?.id ?? ''
        }
        await persist()
    }

    // --- Step helpers ---

    function addStep(runbookId: string, text = ''): void {
        const rb = runbooks.value.find((r) => r.id === runbookId)
        if (!rb) return
        rb.steps.push({ id: createStepId(), text, checked: false })
        rb.updatedAt = new Date().toISOString()
        void persist()
    }

    function updateStep(runbookId: string, stepId: string, patch: Partial<Pick<RunbookStep, 'text' | 'checked'>>): void {
        const rb = runbooks.value.find((r) => r.id === runbookId)
        if (!rb) return
        const step = rb.steps.find((s) => s.id === stepId)
        if (!step) return
        if (patch.text !== undefined) step.text = patch.text
        if (patch.checked !== undefined) step.checked = patch.checked
        rb.updatedAt = new Date().toISOString()
        void persist()
    }

    function removeStep(runbookId: string, stepId: string): void {
        const rb = runbooks.value.find((r) => r.id === runbookId)
        if (!rb) return
        rb.steps = rb.steps.filter((s) => s.id !== stepId)
        rb.updatedAt = new Date().toISOString()
        void persist()
    }

    function moveStep(runbookId: string, stepId: string, direction: -1 | 1): void {
        const rb = runbooks.value.find((r) => r.id === runbookId)
        if (!rb) return
        const idx = rb.steps.findIndex((s) => s.id === stepId)
        if (idx < 0) return
        const newIdx = idx + direction
        if (newIdx < 0 || newIdx >= rb.steps.length) return
        const temp = rb.steps[idx]
        rb.steps[idx] = rb.steps[newIdx]
        rb.steps[newIdx] = temp
        rb.updatedAt = new Date().toISOString()
        void persist()
    }

    return {
        runbooks,
        selectedId,
        selectedRunbook,
        loaded,
        saving,
        loadRunbooks,
        reload,
        selectRunbook,
        createRunbook,
        updateRunbook,
        deleteRunbook,
        addStep,
        updateStep,
        removeStep,
        moveStep,
    }
})
