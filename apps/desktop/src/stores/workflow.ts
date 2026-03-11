import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'

import type { Workflow } from '../components/workflow/types'

const STORAGE_KEY = 'workflows.json'

export const useWorkflowStore = defineStore('workflow', () => {
    const workflows = ref<Workflow[]>([])
    const selectedId = ref('')
    const loaded = ref(false)
    const saving = ref(false)

    // --- Serialize queue: prevents concurrent writes ---
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
            const content = JSON.stringify(workflows.value, null, 2)
            await invoke('write_data_file', { relativePath: STORAGE_KEY, content })
        } finally {
            saving.value = false
        }
    }

    // --- CRUD ---

    const selectedWorkflow = computed(() =>
        workflows.value.find((w) => w.id === selectedId.value) ?? null,
    )

    async function loadWorkflows(): Promise<void> {
        try {
            const raw = await invoke<string>('read_data_file', { relativePath: STORAGE_KEY })
            workflows.value = JSON.parse(raw) as Workflow[]
            loaded.value = true
        } catch {
            workflows.value = []
            loaded.value = true
        }
    }

    function selectWorkflow(id: string): void {
        selectedId.value = id
    }

    async function createWorkflow(): Promise<string> {
        const now = new Date().toISOString()
        const wf: Workflow = {
            id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: '',
            description: '',
            content: '',
            createdAt: now,
            updatedAt: now,
        }
        workflows.value = [wf, ...workflows.value]
        selectedId.value = wf.id
        await persist()
        return wf.id
    }

    async function updateWorkflow(
        id: string,
        patch: Partial<Pick<Workflow, 'name' | 'description' | 'content'>>,
    ): Promise<void> {
        const wf = workflows.value.find((w) => w.id === id)
        if (!wf) return

        if (patch.name !== undefined) wf.name = patch.name
        if (patch.description !== undefined) wf.description = patch.description
        if (patch.content !== undefined) wf.content = patch.content
        wf.updatedAt = new Date().toISOString()

        await persist()
    }

    async function deleteWorkflow(id: string): Promise<void> {
        workflows.value = workflows.value.filter((w) => w.id !== id)
        if (selectedId.value === id) {
            selectedId.value = workflows.value[0]?.id ?? ''
        }
        await persist()
    }

    return {
        workflows,
        selectedId,
        selectedWorkflow,
        loaded,
        saving,
        loadWorkflows,
        selectWorkflow,
        createWorkflow,
        updateWorkflow,
        deleteWorkflow,
    }
})
