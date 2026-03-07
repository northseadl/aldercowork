<script setup lang="ts">
import { computed, ref } from 'vue'

import { useI18n } from '../../../i18n'
import { useWorkspaceStore } from '../../../stores/workspace'

import type { FileOutcome } from '../../../types/artifacts'

const props = defineProps<{
  file: FileOutcome
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const statusKey = computed(() => {
  if (props.file.status === 'processing') return 'processing'
  if (props.file.status === 'added') return 'added'
  if (props.file.status === 'deleted') return 'deleted'
  return 'modified'
})

const basename = computed(() => props.file.path.split('/').pop() ?? props.file.path)
const canOpen = computed(() => props.file.status !== 'deleted' && props.file.status !== 'processing')

const deltaLabel = computed(() => {
  if (props.file.status === 'processing') return '…'
  if (props.file.additions > 0 || props.file.deletions > 0) return `+${props.file.additions} / -${props.file.deletions}`
  return ''
})

async function openFile() {
  if (!canOpen.value) return
  const ws = workspaceStore.activePath
  const abs = ws ? `${ws}/${props.file.path}` : props.file.path
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:shell|open', { path: abs })
  } catch (error) {
    console.warn('[FileOutcomeCard] open failed:', error)
  }
}

async function copyPath() {
  try {
    await navigator.clipboard.writeText(props.file.path)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div
    class="file-row"
    :class="[`is-${statusKey}`, { 'is-live': file.live }]"
    role="button"
    tabindex="0"
    :title="file.path"
    @click="openFile"
    @keydown.enter.prevent="openFile"
  >
    <span class="file-row__dot" :class="`is-${statusKey}`" aria-hidden="true" />
    <span class="file-row__name" :class="{ 'is-disabled': !canOpen }">{{ basename }}</span>
    <span v-if="deltaLabel" class="file-row__delta">{{ deltaLabel }}</span>
    <span class="file-row__status">{{ t(`chat.artifacts.status.${statusKey}`) }}</span>

    <button
      type="button"
      class="file-row__action"
      :title="copied ? t('chat.artifacts.copiedPath') : t('chat.artifacts.copyPath')"
      @click.stop="copyPath"
    >
      <svg v-if="!copied" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background var(--speed-quick);
  min-height: 32px;
}

.file-row:hover { background: var(--surface-hover); }
.file-row:focus-visible { outline: 2px solid var(--brand); outline-offset: -2px; }

.file-row__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-full);
  flex-shrink: 0;
}
.file-row__dot.is-processing { background: var(--text-3); }
.file-row__dot.is-added { background: var(--color-success); }
.file-row__dot.is-modified { background: var(--color-warning); }
.file-row__dot.is-deleted { background: var(--color-error); }

.file-row.is-live .file-row__dot {
  animation: dot-pulse 1.6s ease-in-out infinite;
}

.file-row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
  color: var(--text-1);
}
.file-row__name.is-disabled {
  color: var(--text-3);
  cursor: default;
}

.file-row__delta {
  font: var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  white-space: nowrap;
}

.file-row__status {
  font-size: var(--text-micro);
  color: var(--text-3);
  white-space: nowrap;
}

.file-row__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--speed-quick), background var(--speed-quick);
}
.file-row__action:hover {
  color: var(--text-1);
  background: var(--surface-active);
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@media (prefers-reduced-motion: reduce) {
  .file-row.is-live .file-row__dot { animation: none; }
}
</style>
