<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

import { RunbookEditor, RunbookListItem } from '../components/runbooks'
import { serializeForPrompt } from '../components/runbooks/types'
import { useI18n } from '../i18n'
import { useConfirm, useToast } from '../composables'
import { useKernel } from '../composables/useKernel'
import { useRunbookStore } from '../stores/runbook'
import { useSessionStore } from '../stores/session'

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()
const router = useRouter()
const runbookStore = useRunbookStore()
const sessionStore = useSessionStore()
const { status: kernelStatus } = useKernel()

const {
  runbooks,
  selectedId,
  selectedRunbook,
  loaded,
  saving,
} = storeToRefs(runbookStore)

const searchKeyword = ref('')
const creating = ref(false)
const sending = ref(false)

const filteredRunbooks = computed(() => {
  if (!searchKeyword.value.trim()) return runbooks.value
  const kw = searchKeyword.value.toLowerCase()
  return runbooks.value.filter((r) =>
    r.name.toLowerCase().includes(kw)
    || r.body.toLowerCase().includes(kw)
    || r.steps.some((s) => s.text.toLowerCase().includes(kw)),
  )
})

async function handleCreate() {
  creating.value = true
  try {
    await runbookStore.createRunbook()
  } finally {
    creating.value = false
  }
}

function handleSelect(id: string) {
  runbookStore.selectRunbook(id)
}

async function handleUpdateName(name: string) {
  if (!selectedRunbook.value) return
  await runbookStore.updateRunbook(selectedRunbook.value.id, { name })
}

async function handleUpdateBody(body: string) {
  if (!selectedRunbook.value) return
  await runbookStore.updateRunbook(selectedRunbook.value.id, { body })
}

async function handleDelete() {
  if (!selectedRunbook.value) return
  const decision = await confirm({
    title: t('runbooks.deleteConfirmTitle'),
    message: t('runbooks.deleteConfirm').replace('{name}', selectedRunbook.value.name),
    confirmLabel: t('runbooks.delete'),
    variant: 'danger',
  })
  if (decision !== 'confirm') return
  await runbookStore.deleteRunbook(selectedRunbook.value.id)
  toast.info(t('runbooks.deleted'))
}

// --- Delegate to ChatView's send pipeline via pendingPrompt ---
async function handleExecute() {
  const rb = selectedRunbook.value
  if (!rb) return

  const prompt = serializeForPrompt(rb)
  if (!prompt.trim()) return

  // Guard: kernel must be running
  if (kernelStatus.value !== 'running') {
    toast.error(t('runbooks.engineNotReady'))
    return
  }

  sending.value = true
  try {
    // Ensure we have a real remote session
    const sid = await sessionStore.ensureActiveSession()
    if (!sid || sid.startsWith('local-')) {
      toast.error(t('runbooks.sendFailed'))
      return
    }

    // Deposit the prompt for ChatView to consume through its full SSE streaming pipeline.
    // This replaces the previous direct `promptAsync` call which bypassed event stream
    // subscription and resulted in a silent response (no streaming rendering).
    sessionStore.setPendingPrompt({ text: prompt })

    // Navigate to chat — ChatView will detect the pending prompt and auto-send
    toast.info(t('runbooks.sentToChat'))
    void router.push('/')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    toast.error(msg)
  } finally {
    sending.value = false
  }
}

// --- Step operations ---
function handleAddStep(text: string) {
  if (!selectedRunbook.value) return
  runbookStore.addStep(selectedRunbook.value.id, text)
}

function handleUpdateStep(stepId: string, patch: { text?: string; checked?: boolean }) {
  if (!selectedRunbook.value) return
  runbookStore.updateStep(selectedRunbook.value.id, stepId, patch)
}

function handleRemoveStep(stepId: string) {
  if (!selectedRunbook.value) return
  runbookStore.removeStep(selectedRunbook.value.id, stepId)
}

function handleMoveStep(stepId: string, direction: -1 | 1) {
  if (!selectedRunbook.value) return
  runbookStore.moveStep(selectedRunbook.value.id, stepId, direction)
}

function clearSearch() {
  searchKeyword.value = ''
}

onMounted(() => {
  if (!loaded.value) {
    runbookStore.loadRunbooks()
  }
})
</script>

<template>
  <section class="runbooks-view">
    <header class="runbooks-view__toolbar">
      <div class="runbooks-view__search-wrap">
        <input
          v-model="searchKeyword"
          type="search"
          class="runbooks-view__search"
          :placeholder="t('runbooks.searchPlaceholder')"
        />
        <button
          v-if="searchKeyword"
          type="button"
          class="runbooks-view__clear-btn"
          @click="clearSearch"
        >×</button>
      </div>

      <button
        type="button"
        class="runbooks-view__create-btn"
        :disabled="creating"
        @click="handleCreate"
      >
        + {{ t('runbooks.createNew') }}
      </button>
    </header>

    <div class="runbooks-view__body">
      <!-- List pane -->
      <aside class="runbooks-view__list">
        <div v-if="!loaded" class="runbooks-view__loading">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="filteredRunbooks.length === 0" class="runbooks-view__empty">
          {{ searchKeyword ? t('runbooks.noResults') : t('runbooks.emptyState') }}
        </div>
        <RunbookListItem
          v-for="rb in filteredRunbooks"
          v-else
          :key="rb.id"
          :runbook="rb"
          :selected="rb.id === selectedId"
          @select="handleSelect"
        />
      </aside>

      <!-- Editor pane -->
      <main class="runbooks-view__editor">
        <div v-if="!selectedRunbook" class="runbooks-view__no-selection">
          <p>{{ t('runbooks.selectToEdit') }}</p>
        </div>
        <RunbookEditor
          v-else
          :key="selectedRunbook.id"
          :runbook="selectedRunbook"
          @update:name="handleUpdateName"
          @update:body="handleUpdateBody"
          @add-step="handleAddStep"
          @update-step="handleUpdateStep"
          @remove-step="handleRemoveStep"
          @move-step="handleMoveStep"
          @execute="handleExecute"
          @delete="handleDelete"
        />
      </main>
    </div>

    <!-- Saving indicator -->
    <div v-if="saving || sending" class="runbooks-view__saving">
      {{ sending ? t('runbooks.sending') : t('runbooks.saving') }}
    </div>
  </section>
</template>

<style scoped>
.runbooks-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Toolbar — matches SkillsView padding for cross-page alignment */
.runbooks-view__toolbar {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1);
  padding: calc(var(--sp) * 2) calc(var(--sp) * 2) calc(var(--sp) * 1.5);
  flex-shrink: 0;
}

.runbooks-view__search-wrap {
  position: relative;
  flex: 1;
  max-width: 280px;
}

.runbooks-view__search {
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

.runbooks-view__search:focus {
  border-color: var(--brand);
}

.runbooks-view__clear-btn {
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

.runbooks-view__clear-btn:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.runbooks-view__create-btn {
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

.runbooks-view__create-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.runbooks-view__create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Body: master-detail layout — boundless design (gap + containerized panels) */
.runbooks-view__body {
  display: grid;
  grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  flex: 1;
  overflow: hidden;
  gap: calc(var(--sp) * 1);
  padding: 0 calc(var(--sp) * 1.5) calc(var(--sp) * 1.5);
}

.runbooks-view__list {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
  padding: calc(var(--sp) * 0.75);
}

.runbooks-view__editor {
  min-height: 0;
  overflow: hidden;
}

.runbooks-view__loading,
.runbooks-view__empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-3);
  font: var(--fw-normal) var(--text-sm) / 1.4 var(--font);
  padding: calc(var(--sp) * 2);
  text-align: center;
}

.runbooks-view__no-selection {
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

/* Saving indicator */
.runbooks-view__saving {
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
