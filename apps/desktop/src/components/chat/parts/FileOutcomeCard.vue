<script setup lang="ts">
import { computed, ref } from 'vue'

import DiffPreview from './DiffPreview.vue'

import { useI18n } from '../../../i18n'

import type { FileOutcome } from '../../../types/artifacts'

const props = defineProps<{
  file: FileOutcome
  context: 'turn' | 'session'
}>()

const { t } = useI18n()

const expanded = ref(false)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const statusKey = computed(() => {
  if (props.file.status === 'processing') return 'processing'
  if (props.file.status === 'added') return 'added'
  if (props.file.status === 'deleted') return 'deleted'
  return 'modified'
})

const basename = computed(() => props.file.path.split('/').pop() ?? props.file.path)
const canPreview = computed(() =>
  !props.file.binary
  && Boolean(props.file.before || props.file.after)
  && props.file.status !== 'processing',
)
const sourceLabel = computed(() => {
  const keyBySource: Record<string, string> = {
    summary: t('chat.artifacts.sourceSession'),
    diff: t('chat.artifacts.sourceDiff'),
    git: t('chat.artifacts.sourceGit'),
    snapshot: t('chat.artifacts.sourceSnapshot'),
    attachment: t('chat.artifacts.sourceAttachment'),
    live: t('chat.artifacts.sourceTurn'),
  }

  if (props.context === 'session' && props.file.source !== 'diff') {
    return keyBySource[props.file.source] ?? t('chat.artifacts.sourceSession')
  }

  return keyBySource[props.file.source] ?? t('chat.artifacts.sourceTurn')
})
const deltaLabel = computed(() => {
  if (props.file.status === 'processing') return t('chat.artifacts.processingSummary')
  if (props.file.binary) return t('chat.artifacts.binaryFile')
  if (props.file.additions > 0 || props.file.deletions > 0) return `+${props.file.additions} / -${props.file.deletions}`
  return t('chat.artifacts.noLineStats')
})

function toggleExpanded() {
  if (!canPreview.value) return
  expanded.value = !expanded.value
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
  <article class="file-outcome-card" :class="[`is-${statusKey}`, { 'is-live': file.live }]">
    <div class="file-outcome-card__head">
      <div class="file-outcome-card__identity">
        <span class="file-outcome-card__badge" :class="`is-${statusKey}`">
          {{ t(`chat.artifacts.status.${statusKey}`) }}
        </span>
        <div class="file-outcome-card__meta">
          <span class="file-outcome-card__name">{{ basename }}</span>
          <span class="file-outcome-card__path">{{ file.path }}</span>
        </div>
      </div>

      <div class="file-outcome-card__summary">
        <span class="file-outcome-card__delta">{{ deltaLabel }}</span>
        <span class="file-outcome-card__source">{{ sourceLabel }}</span>
        <span v-if="file.mimeType" class="file-outcome-card__mime">{{ file.mimeType }}</span>
      </div>
    </div>

    <div class="file-outcome-card__actions">
      <button
        v-if="canPreview"
        type="button"
        class="file-outcome-card__button"
        :aria-expanded="expanded ? 'true' : 'false'"
        @click="toggleExpanded"
      >
        {{ expanded ? t('chat.artifacts.hideDiff') : t('chat.artifacts.showDiff') }}
      </button>

      <button type="button" class="file-outcome-card__button subtle" @click="copyPath">
        {{ copied ? t('chat.artifacts.copiedPath') : t('chat.artifacts.copyPath') }}
      </button>
    </div>

    <DiffPreview
      v-if="expanded && canPreview"
      :before="file.before"
      :after="file.after"
      :status="file.status"
    />
  </article>
</template>

<style scoped>
.file-outcome-card {
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--content) 88%, var(--surface-card));
  padding: calc(var(--sp) * 1.25);
}

.file-outcome-card.is-live {
  animation: artifact-pulse 1.6s ease-in-out infinite;
}

.file-outcome-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.file-outcome-card__identity {
  display: flex;
  gap: 10px;
  min-width: 0;
}

.file-outcome-card__badge {
  align-self: flex-start;
  border-radius: var(--r-full);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: var(--fw-semibold);
  white-space: nowrap;
}

.file-outcome-card__badge.is-processing {
  color: var(--text-2);
  background: var(--surface-active);
}

.file-outcome-card__badge.is-added {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 10%, transparent);
}

.file-outcome-card__badge.is-modified {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
}

.file-outcome-card__badge.is-deleted {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
}

.file-outcome-card__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.file-outcome-card__name {
  font-size: var(--text-small);
  font-weight: var(--fw-semibold);
  color: var(--text-1);
  font-family: var(--font-mono);
}

.file-outcome-card__path {
  font-size: var(--text-micro);
  color: var(--text-3);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-outcome-card__summary {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.file-outcome-card__delta,
.file-outcome-card__source {
  font-size: var(--text-micro);
}

.file-outcome-card__delta {
  color: var(--text-2);
  font-family: var(--font-mono);
}

.file-outcome-card__source {
  color: var(--text-3);
}

.file-outcome-card__mime {
  font-size: 10px;
  color: var(--text-3);
  font-family: var(--font-mono);
}

.file-outcome-card__actions {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1);
  margin-top: calc(var(--sp) * 1.25);
}

.file-outcome-card__button {
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  padding: 6px 10px;
  background: var(--surface-card);
  color: var(--text-2);
  font-size: 11px;
  cursor: pointer;
  transition: background var(--speed-quick), color var(--speed-quick), border-color var(--speed-quick);
}

.file-outcome-card__button:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.file-outcome-card__button.subtle {
  color: var(--text-3);
}

@keyframes artifact-pulse {
  0%, 100% { border-color: var(--border); }
  50% { border-color: color-mix(in srgb, var(--brand) 30%, var(--border)); }
}

@media (prefers-reduced-motion: reduce) {
  .file-outcome-card.is-live {
    animation: none;
  }
}

@media (max-width: 720px) {
  .file-outcome-card__head {
    flex-direction: column;
  }

  .file-outcome-card__summary {
    align-items: flex-start;
  }

  .file-outcome-card__actions {
    flex-wrap: wrap;
  }
}
</style>
