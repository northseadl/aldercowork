<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, nextTick } from 'vue'

import { useI18n } from '../../i18n'
import { useWorkspaceStore } from '../../stores/workspace'

import type { SessionArtifactSummary } from '../../types/artifacts'
import type { FileOutcome } from '../../types/artifacts'

const props = defineProps<{
  summary: SessionArtifactSummary
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const panelOpen = ref(false)
const copied = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

// Context menu state
const ctxMenu = ref<{ x: number; y: number; file: FileOutcome } | null>(null)

const fileCount = computed(() => props.summary.files.length)
const hasFiles = computed(() => fileCount.value > 0)

// Close panel when files disappear (session switch)
watch(hasFiles, (has) => {
  if (!has) panelOpen.value = false
})

function togglePanel() {
  panelOpen.value = !panelOpen.value
  ctxMenu.value = null
}

// --- File operations (using Tauri shell plugin) ---

async function openFile(file: FileOutcome) {
  if (file.status === 'deleted' || file.status === 'processing') return
  const ws = workspaceStore.activePath
  const abs = ws ? `${ws}/${file.path}` : file.path
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:shell|open', { path: abs })
  } catch (error) {
    console.warn('[ArtifactFab] open failed:', error)
  }
}

async function showInDirectory(file: FileOutcome) {
  const ws = workspaceStore.activePath
  const abs = ws ? `${ws}/${file.path}` : file.path
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    // Tauri's revealItemInDir opens the containing folder and selects the file
    await invoke('plugin:opener|reveal_item_in_dir', { path: abs })
  } catch (error) {
    console.warn('[ArtifactFab] reveal failed:', error)
  }
}

async function copyPath(file: FileOutcome) {
  try {
    await navigator.clipboard.writeText(file.path)
    copied.value = file.path
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = null }, 1500)
  } catch {
    copied.value = null
  }
}

function handleContextMenu(event: MouseEvent, file: FileOutcome) {
  event.preventDefault()
  ctxMenu.value = { x: event.clientX, y: event.clientY, file }
}

function handleKeyboardContextMenu(event: KeyboardEvent, file: FileOutcome) {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault()
    const el = event.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    ctxMenu.value = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, file }
  }
}

function closeContextMenu() {
  ctxMenu.value = null
}

function handleCtxAction(action: 'open' | 'reveal' | 'copy') {
  if (!ctxMenu.value) return
  const file = ctxMenu.value.file
  closeContextMenu()
  if (action === 'open') openFile(file)
  else if (action === 'reveal') showInDirectory(file)
  else if (action === 'copy') copyPath(file)
}

// Close context menu on outside click
function handleDocumentClick() {
  closeContextMenu()
}

watch(ctxMenu, async (val) => {
  await nextTick()
  if (val) {
    document.addEventListener('click', handleDocumentClick, { once: true })
  }
})

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  document.removeEventListener('click', handleDocumentClick)
})

// File icon extension resolver
const EXT_ICONS: Record<string, string> = {
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', vue: 'code',
  rs: 'code', go: 'code', py: 'code', rb: 'code', java: 'code',
  css: 'style', scss: 'style', less: 'style',
  json: 'config', yaml: 'config', yml: 'config', toml: 'config',
  md: 'doc', txt: 'doc', html: 'doc',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image',
}

function fileIconClass(file: FileOutcome): string {
  const ext = file.path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? 'generic'
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function statusDotClass(file: FileOutcome): string {
  if (file.status === 'processing') return 'is-processing'
  if (file.status === 'added') return 'is-added'
  if (file.status === 'deleted') return 'is-deleted'
  return 'is-modified'
}
</script>

<template>
  <!-- FAB trigger — only visible when there are artifact files -->
  <Transition name="fab-pop">
    <button
      v-if="hasFiles"
      type="button"
      class="artifact-fab"
      :class="{ 'is-open': panelOpen }"
      :title="t('chat.artifacts.fabTitle')"
      :aria-label="t('chat.artifacts.fabTitle')"
      @click="togglePanel"
    >
      <!-- Folder/file icon -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <span class="artifact-fab__badge">{{ fileCount }}</span>
    </button>
  </Transition>

  <!-- Floating panel -->
  <Transition name="panel-slide">
    <div v-if="panelOpen && hasFiles" class="artifact-panel">
      <header class="artifact-panel__head">
        <span class="artifact-panel__title">{{ t('chat.artifacts.fabTitle') }}</span>
        <span class="artifact-panel__count">{{ t('chat.artifacts.filesCount').replace('{count}', String(fileCount)) }}</span>
        <button type="button" class="artifact-panel__close" :aria-label="t('common.close')" @click="panelOpen = false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div class="artifact-panel__list">
        <div
          v-for="file in props.summary.files"
          :key="file.path"
          class="af-item"
          :class="[`af-icon--${fileIconClass(file)}`, { 'af-item--disabled': file.status === 'deleted' || file.status === 'processing' }]"
          role="button"
          tabindex="0"
          :title="file.path"
          @click="openFile(file)"
          @keydown.enter.prevent="openFile(file)"
          @keydown="handleKeyboardContextMenu($event, file)"
          @contextmenu="handleContextMenu($event, file)"
        >
          <span class="af-item__status" :class="statusDotClass(file)" />
          <!-- File type icon -->
          <svg v-if="fileIconClass(file) === 'code'" class="af-item__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
          </svg>
          <svg v-else-if="fileIconClass(file) === 'style'" class="af-item__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
          </svg>
          <svg v-else-if="fileIconClass(file) === 'config'" class="af-item__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33" />
          </svg>
          <svg v-else-if="fileIconClass(file) === 'image'" class="af-item__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
          </svg>
          <svg v-else class="af-item__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
          </svg>
          <span class="af-item__name">{{ basename(file.path) }}</span>
          <span v-if="file.additions > 0 || file.deletions > 0" class="af-item__delta">
            +{{ file.additions }}/-{{ file.deletions }}
          </span>
        </div>

        <div v-if="!hasFiles" class="artifact-panel__empty">
          {{ t('chat.artifacts.fabEmpty') }}
        </div>
      </div>

      <!-- Summary footer -->
      <footer v-if="props.summary.totals.files > 0" class="artifact-panel__foot">
        {{ t('chat.artifacts.shelfSummary').replace('{files}', String(props.summary.totals.files)).replace('{additions}', String(props.summary.totals.additions)).replace('{deletions}', String(props.summary.totals.deletions)) }}
      </footer>

      <div v-if="props.summary.error" class="artifact-panel__error">
        {{ props.summary.error }}
      </div>
    </div>
  </Transition>

  <!-- Context menu -->
  <Teleport to="body">
    <Transition name="ctx-fade">
      <div
        v-if="ctxMenu"
        class="af-ctx"
        :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      >
        <button
          type="button"
          class="af-ctx__item"
          :disabled="ctxMenu.file.status === 'deleted' || ctxMenu.file.status === 'processing'"
          @click="handleCtxAction('open')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          {{ t('chat.artifacts.openFile') }}
        </button>
        <button type="button" class="af-ctx__item" @click="handleCtxAction('reveal')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          {{ t('chat.artifacts.openInDirectory') }}
        </button>
        <button type="button" class="af-ctx__item" @click="handleCtxAction('copy')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {{ copied === ctxMenu.file.path ? t('chat.artifacts.copiedPath') : t('chat.artifacts.copyPath') }}
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── FAB button ── */
.artifact-fab {
  position: absolute;
  left: 12px;
  bottom: 100px;
  width: 40px;
  height: 40px;
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 20;
  transition: background var(--speed-quick), color var(--speed-quick), box-shadow var(--speed-quick), border-color var(--speed-quick);
}

.artifact-fab:hover {
  background: var(--surface-hover);
  color: var(--text-1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
}

.artifact-fab.is-open {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-subtle);
}

.artifact-fab__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--r-full);
  background: var(--brand);
  color: var(--on-brand);
  font: var(--fw-semibold) 10px / 18px var(--font-mono);
  text-align: center;
}

/* ── Floating panel ── */
.artifact-panel {
  position: absolute;
  left: 12px;
  bottom: 148px;
  width: 300px;
  max-height: 400px;
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background: var(--surface-card);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.artifact-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.artifact-panel__title {
  font: var(--fw-semibold) var(--text-small) / 1 var(--font);
  color: var(--text-1);
  flex: 1;
}

.artifact-panel__count {
  font: var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
}

.artifact-panel__close {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color var(--speed-quick), background var(--speed-quick);
}
.artifact-panel__close:hover { color: var(--text-1); background: var(--surface-hover); }

.artifact-panel__list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.artifact-panel__empty {
  padding: 20px 12px;
  text-align: center;
  color: var(--text-3);
  font-size: var(--text-micro);
}

.artifact-panel__foot {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font: var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  text-align: center;
}

.artifact-panel__error {
  padding: 6px 12px;
  font-size: var(--text-micro);
  color: var(--color-error);
  text-align: center;
}

/* ── File item ── */
.af-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background var(--speed-quick);
}
.af-item:hover { background: var(--surface-hover); }
.af-item:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }
.af-item--disabled { opacity: 0.5; cursor: default; }

/* Status markers — shape-differentiated for colorblind accessibility */
.af-item__status {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
}

/* Processing: hollow circle (ring) */
.af-item__status.is-processing {
  border-radius: var(--r-full);
  border: 1.5px solid var(--text-3);
  background: transparent;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

/* Added: filled circle */
.af-item__status.is-added {
  border-radius: var(--r-full);
  background: var(--color-success);
}

/* Modified: diamond (rotated square) */
.af-item__status.is-modified {
  width: 6px;
  height: 6px;
  background: var(--color-warning);
  border-radius: 1px;
  transform: rotate(45deg);
}

/* Deleted: horizontal dash */
.af-item__status.is-deleted {
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--color-error);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.af-item__icon {
  flex-shrink: 0;
  color: var(--text-3);
}

.af-icon--code .af-item__icon { color: var(--brand); }
.af-icon--style .af-item__icon { color: var(--color-warning, #f59e0b); }
.af-icon--config .af-item__icon { color: var(--text-3); }
.af-icon--image .af-item__icon { color: var(--color-success, #22c55e); }

.af-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: var(--text-small) / 1 var(--font-mono);
  color: var(--text-1);
}

.af-item__delta {
  font: var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Context menu ── */
.af-ctx {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  padding: 4px;
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--surface-card);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
}

.af-ctx__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-1);
  font: var(--text-small) / 1 var(--font);
  cursor: pointer;
  text-align: left;
  transition: background var(--speed-quick);
}
.af-ctx__item:hover { background: var(--surface-hover); }
.af-ctx__item:disabled { opacity: 0.4; cursor: default; }
.af-ctx__item:disabled:hover { background: transparent; }
.af-ctx__item svg { color: var(--text-3); flex-shrink: 0; }

/* ── Transitions ── */
.fab-pop-enter-active { transition: opacity 0.2s var(--ease), transform 0.2s var(--ease); }
.fab-pop-leave-active { transition: opacity 0.15s var(--ease), transform 0.15s var(--ease); }
.fab-pop-enter-from { opacity: 0; transform: scale(0.8); }
.fab-pop-leave-to { opacity: 0; transform: scale(0.8); }

.panel-slide-enter-active { transition: opacity 0.2s var(--ease), transform 0.2s var(--ease); }
.panel-slide-leave-active { transition: opacity 0.15s var(--ease), transform 0.15s var(--ease); }
.panel-slide-enter-from { opacity: 0; transform: translateY(8px); }
.panel-slide-leave-to { opacity: 0; transform: translateY(8px); }

.ctx-fade-enter-active { transition: opacity 0.1s var(--ease); }
.ctx-fade-leave-active { transition: opacity 0.08s var(--ease); }
.ctx-fade-enter-from,
.ctx-fade-leave-to { opacity: 0; }
</style>
