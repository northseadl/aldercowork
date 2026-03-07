<script setup lang="ts">
import { computed, ref } from 'vue'

import FileOutcomeCard from './parts/FileOutcomeCard.vue'

import { useI18n } from '../../i18n'

import type { SessionArtifactSummary } from './types'

const props = defineProps<{
  summary: SessionArtifactSummary
}>()

const { t } = useI18n()
const expanded = ref(false)

const hasContent = computed(() => props.summary.files.length > 0 || !!props.summary.error)

const summaryText = computed(() =>
  t('chat.artifacts.shelfSummary')
    .replace('{files}', String(props.summary.totals.files))
    .replace('{additions}', String(props.summary.totals.additions))
    .replace('{deletions}', String(props.summary.totals.deletions)),
)
</script>

<template>
  <section v-if="hasContent" class="artifact-shelf" :aria-label="t('chat.artifacts.shelfTitle')">
    <button
      type="button"
      class="artifact-shelf__toggle"
      :aria-expanded="expanded ? 'true' : 'false'"
      @click="expanded = !expanded"
    >
      <svg
        class="artifact-shelf__chevron"
        :class="{ 'is-expanded': expanded }"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <span class="artifact-shelf__title">{{ t('chat.artifacts.shelfTitle') }}</span>
      <span class="artifact-shelf__meta">{{ summaryText }}</span>
    </button>

    <div v-if="props.summary.error" class="artifact-shelf__error" role="status">
      <svg class="artifact-shelf__error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 9v4" stroke-linecap="round" />
        <path d="M12 17h.01" stroke-linecap="round" />
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <span>{{ t('chat.artifacts.aggregateError') }}: {{ props.summary.error }}</span>
    </div>

    <div v-if="expanded && props.summary.files.length > 0" class="artifact-shelf__list">
      <FileOutcomeCard
        v-for="file in props.summary.files"
        :key="`session:${file.path}`"
        :file="file"
      />
    </div>
  </section>
</template>

<style scoped>
.artifact-shelf {
  margin-top: calc(var(--sp) * 3);
}

.artifact-shelf__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--surface-card) 92%, var(--content));
  cursor: pointer;
  transition: background var(--speed-quick);
}

.artifact-shelf__toggle:hover {
  background: var(--surface-hover);
}

.artifact-shelf__chevron {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform var(--speed-quick);
}
.artifact-shelf__chevron.is-expanded {
  transform: rotate(90deg);
}

.artifact-shelf__title {
  font-size: var(--text-small);
  font-weight: var(--fw-semibold);
  color: var(--text-1);
}

.artifact-shelf__meta {
  font-size: var(--text-micro);
  color: var(--text-3);
  margin-left: auto;
  font-family: var(--font-mono);
}

.artifact-shelf__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-top: calc(var(--sp) * 1);
  border-radius: var(--r-md);
  color: var(--color-warning);
  background: var(--color-warning-subtle);
  border: 1px solid color-mix(in srgb, var(--color-warning) 20%, transparent);
  font-size: var(--text-micro);
}

.artifact-shelf__error-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.artifact-shelf__list {
  display: flex;
  flex-direction: column;
  margin-top: calc(var(--sp) * 0.5);
  padding: 4px 0;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--surface-card) 92%, var(--content));
  max-height: 320px;
  overflow-y: auto;
}
</style>
