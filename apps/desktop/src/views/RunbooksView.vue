<script setup lang="ts">
import { onMounted, ref, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

import { RunbookEditor, RunbookListItem } from '../components/runbooks'
import { useI18n } from '../i18n'
import { useConfirm, useToast } from '../composables'
import { useRunbookStore } from '../stores/runbook'
import { useSessionStore } from '../stores/session'
import { RUNBOOK_DRAFT_STORAGE_KEY, RUNBOOK_SEND_EVENT } from '../constants/runbook'

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()
const router = useRouter()
const runbookStore = useRunbookStore()
const sessionStore = useSessionStore()

const {
  runbooks,
  selectedId,
  selectedRunbook,
  loaded,
  saving,
} = storeToRefs(runbookStore)

const searchKeyword = ref('')
const creating = ref(false)

const filteredRunbooks = ref(runbooks.value)

watchEffect(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  filteredRunbooks.value = kw
    ? runbooks.value.filter((r) =>
        r.name.toLowerCase().includes(kw) ||
        r.content.toLowerCase().includes(kw))
    : runbooks.value
})

async function handleCreate() {
  creating.value = true
  try {
    await runbookStore.createRunbook(t('runbooks.untitled'))
    toast.info(t('runbooks.created'))
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

async function handleUpdateContent(content: string) {
  if (!selectedRunbook.value) return
  await runbookStore.updateRunbook(selectedRunbook.value.id, { content })
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

async function handleSendToChat() {
  if (!selectedRunbook.value?.content.trim()) return

  // Ensure a session exists, then navigate and send
  const sid = await sessionStore.ensureActiveSession()
  if (!sid) {
    toast.error(t('runbooks.sendFailed'))
    return
  }

  const content = selectedRunbook.value.content
  try {
    window.sessionStorage.setItem(RUNBOOK_DRAFT_STORAGE_KEY, content)
  } catch {
    // Best effort fallback to in-memory event only.
  }

  // Dispatch a custom event so an already-mounted ChatView can consume immediately.
  window.dispatchEvent(new CustomEvent(RUNBOOK_SEND_EVENT, {
    detail: { content },
  }))

  // Navigate to chat
  void router.push('/')
  toast.info(t('runbooks.sentToChat'))
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
      <div>
        <h1 class="runbooks-view__title">{{ t('runbooks.panelTitle') }}</h1>
        <p class="runbooks-view__subtitle">{{ t('runbooks.panelSubtitle') }}</p>
      </div>

      <div class="runbooks-view__toolbar-actions">
        <button
          type="button"
          class="runbooks-view__create-btn"
          :disabled="creating"
          @click="handleCreate"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="runbooks-view__create-icon">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          {{ t('runbooks.create') }}
        </button>

        <label class="runbooks-view__search" for="runbooks-search">
          <span class="runbooks-view__search-label">{{ t('runbooks.searchLabel') }}</span>
          <div class="runbooks-view__search-wrapper">
            <input
              id="runbooks-search"
              v-model="searchKeyword"
              type="search"
              class="runbooks-view__search-input"
              :placeholder="t('runbooks.searchPlaceholder')"
            />
            <button
              v-if="searchKeyword.trim()"
              type="button"
              class="runbooks-view__search-clear"
              :aria-label="t('common.clear')"
              @click="clearSearch"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </label>
      </div>
    </header>

    <div class="runbooks-view__layout">
      <!-- List pane -->
      <aside class="runbooks-view__list-pane" :aria-label="t('runbooks.listLabel')">
        <p class="runbooks-view__result-count">
          {{ t('runbooks.resultCount').replace('{count}', String(filteredRunbooks.length)) }}
          <span v-if="saving" class="runbooks-view__saving">{{ t('runbooks.saving') }}</span>
        </p>

        <div v-if="filteredRunbooks.length" class="runbooks-view__list">
          <RunbookListItem
            v-for="rb in filteredRunbooks"
            :key="rb.id"
            :runbook="rb"
            :selected="rb.id === selectedId"
            @select="handleSelect"
          />
        </div>

        <div v-else-if="searchKeyword.trim()" class="runbooks-view__empty-list">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p>{{ t('runbooks.noMatch') }}</p>
          <button type="button" class="runbooks-view__empty-action-btn" @click="clearSearch">
            {{ t('runbooks.clearSearch') }}
          </button>
        </div>

        <div v-else class="runbooks-view__empty-list">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M9 14l2 2 4-4" />
          </svg>
          <p>{{ t('runbooks.emptyDesc') }}</p>
          <button type="button" class="runbooks-view__empty-action-btn" @click="handleCreate">
            {{ t('runbooks.createFirst') }}
          </button>
        </div>
      </aside>

      <!-- Editor pane -->
      <section class="runbooks-view__editor-pane" :aria-label="t('runbooks.editorLabel')">
        <RunbookEditor
          v-if="selectedRunbook"
          :runbook="selectedRunbook"
          @update:name="handleUpdateName"
          @update:content="handleUpdateContent"
          @delete="handleDelete"
          @send="handleSendToChat"
        />

        <div v-else class="runbooks-view__editor-empty">
          <p>{{ t('runbooks.selectOrCreate') }}</p>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.runbooks-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--content);
}

.runbooks-view__toolbar {
  padding: calc(var(--sp) * 2.5) calc(var(--sp) * 3);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: calc(var(--sp) * 2);
}

.runbooks-view__title {
  margin: 0;
  font: var(--fw-semibold) 1.125rem / var(--lh-tight) var(--font-mono);
  color: var(--text-1);
}

.runbooks-view__subtitle {
  margin: calc(var(--sp) * 0.5) 0 0;
  color: var(--text-3);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.runbooks-view__toolbar-actions {
  display: flex;
  align-items: flex-end;
  gap: calc(var(--sp) * 1.5);
}

.runbooks-view__create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 calc(var(--sp) * 1.5);
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand-subtle);
  color: var(--brand);
  font: var(--fw-semibold) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--speed-regular) var(--ease),
    color var(--speed-regular) var(--ease);
}

.runbooks-view__create-btn:hover {
  background: var(--brand);
  color: var(--text-on-brand, #fff);
}

.runbooks-view__create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.runbooks-view__create-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.runbooks-view__search {
  display: grid;
  gap: calc(var(--sp) * 0.75);
  min-width: min(280px, 100%);
}

.runbooks-view__search-label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.runbooks-view__search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.runbooks-view__search-input {
  width: 100%;
  height: 36px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--content-warm);
  color: var(--text-1);
  font-size: var(--text-small);
  padding: 0 calc(var(--sp) * 3) 0 calc(var(--sp) * 1.25);
  outline: none;
  transition:
    border-color var(--speed-regular) var(--ease),
    box-shadow var(--speed-regular) var(--ease);
}

.runbooks-view__search-input::placeholder {
  color: var(--text-3);
}

.runbooks-view__search-input:focus-visible {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.runbooks-view__search-clear {
  position: absolute;
  right: 6px;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--speed-quick), background var(--speed-quick);
}

.runbooks-view__search-clear:hover {
  color: var(--text-1);
  background: var(--surface-hover);
}

.runbooks-view__layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
}

.runbooks-view__list-pane {
  min-height: 0;
  border-right: 1px solid var(--border);
  padding: calc(var(--sp) * 2);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: calc(var(--sp) * 1.5);
}

.runbooks-view__result-count {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-mini) / 1 var(--font-mono);
  display: flex;
  align-items: center;
  gap: var(--sp);
}

.runbooks-view__saving {
  color: var(--brand);
  font-size: var(--text-micro);
}

.runbooks-view__list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: calc(var(--sp) * 1);
  padding-right: calc(var(--sp) * 0.5);
}

.runbooks-view__empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--sp) * 1.5);
  text-align: center;
  color: var(--text-3);
  font-size: var(--text-small);
  padding: calc(var(--sp) * 4) 0;
}

.runbooks-view__empty-action-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--brand);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  transition:
    border-color var(--speed-regular) var(--ease),
    background var(--speed-regular) var(--ease);
}

.runbooks-view__empty-action-btn:hover {
  border-color: var(--brand);
  background: var(--brand-subtle);
}

.runbooks-view__editor-pane {
  min-height: 0;
  padding: calc(var(--sp) * 2);
}

.runbooks-view__editor-empty {
  height: 100%;
  border: 1px dashed var(--border);
  border-radius: var(--r-xl);
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: var(--text-small);
  background: var(--content-warm);
}

@media (max-width: 1024px) {
  .runbooks-view__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .runbooks-view__toolbar-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .runbooks-view__search { min-width: 0; }

  .runbooks-view__layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(200px, 1fr) minmax(300px, 1fr);
  }

  .runbooks-view__list-pane {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
}
</style>
