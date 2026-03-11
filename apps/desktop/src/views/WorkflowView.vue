<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

import { WorkflowEditor, WorkflowListItem } from '../components/workflow'
import { serializeWorkflowForPrompt } from '../components/workflow/types'
import { useI18n } from '../i18n'
import { useConfirm, useToast } from '../composables'
import { useKernel } from '../composables/useKernel'
import { useWorkflowStore } from '../stores/workflow'
import { useSessionStore } from '../stores/session'

const { t, locale } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()
const router = useRouter()
const workflowStore = useWorkflowStore()
const sessionStore = useSessionStore()
const { status: kernelStatus } = useKernel()

const {
  workflows,
  selectedId,
  selectedWorkflow,
  loaded,
  saving,
} = storeToRefs(workflowStore)

const searchKeyword = ref('')
const creating = ref(false)
const sending = ref(false)

const filteredWorkflows = computed(() => {
  if (!searchKeyword.value.trim()) return workflows.value
  const kw = searchKeyword.value.toLowerCase()
  return workflows.value.filter((w) =>
    w.name.toLowerCase().includes(kw)
    || w.description.toLowerCase().includes(kw)
    || w.content.toLowerCase().includes(kw),
  )
})

async function handleCreate() {
  creating.value = true
  try {
    await workflowStore.createWorkflow()
  } finally {
    creating.value = false
  }
}

function handleSelect(id: string) {
  workflowStore.selectWorkflow(id)
}

async function handleUpdateName(name: string) {
  if (!selectedWorkflow.value) return
  await workflowStore.updateWorkflow(selectedWorkflow.value.id, { name })
}

async function handleUpdateDescription(description: string) {
  if (!selectedWorkflow.value) return
  await workflowStore.updateWorkflow(selectedWorkflow.value.id, { description })
}

async function handleUpdateContent(content: string) {
  if (!selectedWorkflow.value) return
  await workflowStore.updateWorkflow(selectedWorkflow.value.id, { content })
}

async function handleDelete() {
  if (!selectedWorkflow.value) return
  const decision = await confirm({
    title: t('workflow.deleteConfirmTitle'),
    message: t('workflow.deleteConfirm').replace('{name}', selectedWorkflow.value.name),
    confirmLabel: t('workflow.delete'),
    variant: 'danger',
  })
  if (decision !== 'confirm') return
  await workflowStore.deleteWorkflow(selectedWorkflow.value.id)
  toast.info(t('workflow.deleted'))
}

async function handleExecute() {
  const wf = selectedWorkflow.value
  if (!wf) return

  const prompt = serializeWorkflowForPrompt(wf, locale.value)
  if (!prompt.trim()) return

  if (kernelStatus.value !== 'running') {
    toast.error(t('workflow.engineNotReady'))
    return
  }

  sending.value = true
  try {
    const sid = await sessionStore.ensureActiveSession()
    if (!sid || sid.startsWith('local-')) {
      toast.error(t('workflow.sendFailed'))
      return
    }

    sessionStore.setPendingPrompt({
      text: prompt,
      commandRef: { name: wf.name || t('workflow.untitled'), source: 'workflow' as 'workflow', template: wf.content },
    })

    toast.info(t('workflow.sentToChat'))
    void router.push('/')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    toast.error(msg)
  } finally {
    sending.value = false
  }
}

function clearSearch() {
  searchKeyword.value = ''
}

onMounted(() => {
  if (!loaded.value) {
    workflowStore.loadWorkflows()
  }
})
</script>

<template>
  <section class="workflow-view">
    <header class="workflow-view__toolbar">
      <div class="workflow-view__search-wrap">
        <input
          v-model="searchKeyword"
          type="search"
          class="workflow-view__search"
          :placeholder="t('workflow.searchPlaceholder')"
        />
        <button
          v-if="searchKeyword"
          type="button"
          class="workflow-view__clear-btn"
          @click="clearSearch"
        >×</button>
      </div>

      <button
        type="button"
        class="workflow-view__create-btn"
        :disabled="creating"
        @click="handleCreate"
      >
        + {{ t('workflow.createNew') }}
      </button>
    </header>

    <div class="workflow-view__body">
      <!-- List pane -->
      <aside class="workflow-view__list">
        <div v-if="!loaded" class="workflow-view__loading">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="filteredWorkflows.length === 0" class="workflow-view__empty">
          {{ searchKeyword ? t('workflow.noResults') : t('workflow.emptyState') }}
        </div>
        <WorkflowListItem
          v-for="wf in filteredWorkflows"
          v-else
          :key="wf.id"
          :workflow="wf"
          :selected="wf.id === selectedId"
          @select="handleSelect"
        />
      </aside>

      <!-- Editor pane -->
      <main class="workflow-view__editor">
        <div v-if="!selectedWorkflow" class="workflow-view__no-selection">
          <p>{{ t('workflow.selectToEdit') }}</p>
        </div>
        <WorkflowEditor
          v-else
          :key="selectedWorkflow.id"
          :workflow="selectedWorkflow"
          @update:name="handleUpdateName"
          @update:description="handleUpdateDescription"
          @update:content="handleUpdateContent"
          @execute="handleExecute"
          @delete="handleDelete"
        />
      </main>
    </div>

    <!-- Saving indicator -->
    <div v-if="saving || sending" class="workflow-view__saving">
      {{ sending ? t('workflow.sending') : t('workflow.saving') }}
    </div>
  </section>
</template>

<style scoped>
.workflow-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.workflow-view__toolbar {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1);
  padding: calc(var(--sp) * 2) calc(var(--sp) * 2) calc(var(--sp) * 1.5);
  flex-shrink: 0;
}

.workflow-view__search-wrap {
  position: relative;
  flex: 1;
  max-width: 280px;
}

.workflow-view__search {
  width: 100%;
  padding: 6px 12px;
  font: var(--fw-normal) var(--text-sm) / 1.4 var(--font);
  color: var(--text-1);
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color 0.15s;
}

.workflow-view__search:focus {
  border-color: var(--brand);
}

.workflow-view__clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-3);
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.workflow-view__clear-btn:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.workflow-view__create-btn {
  border: 1px solid var(--brand);
  background: var(--brand);
  color: var(--on-brand);
  border-radius: var(--r-md);
  padding: 6px 14px;
  font: var(--fw-medium) var(--text-sm) / 1.2 var(--font);
  cursor: pointer;
  transition: filter 0.12s;
  flex-shrink: 0;
}

.workflow-view__create-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.workflow-view__create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workflow-view__body {
  display: grid;
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  flex: 1;
  overflow: hidden;
  gap: calc(var(--sp) * 1);
  padding: 0 calc(var(--sp) * 1.5) calc(var(--sp) * 1.5);
}

.workflow-view__list {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
  padding: calc(var(--sp) * 0.75);
}

.workflow-view__editor {
  min-height: 0;
  overflow: hidden;
}

.workflow-view__loading,
.workflow-view__empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-3);
  font: var(--fw-normal) var(--text-sm) / 1.4 var(--font);
  padding: calc(var(--sp) * 2);
  text-align: center;
}

.workflow-view__no-selection {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-3);
  font: var(--fw-normal) var(--text-sm) / 1.4 var(--font);
  padding: calc(var(--sp) * 2);
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
}

.workflow-view__saving {
  position: absolute;
  bottom: calc(var(--sp) * 2);
  right: calc(var(--sp) * 2);
  padding: 4px 12px;
  font: var(--fw-medium) var(--text-micro) / 1.2 var(--font-mono);
  color: var(--text-3);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  pointer-events: none;
  opacity: 0.8;
}
</style>
