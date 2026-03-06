<script setup lang="ts">
import { computed } from 'vue'

import FileOutcomeCard from './parts/FileOutcomeCard.vue'

import { useI18n } from '../../i18n'

import type { SessionArtifactSummary } from './types'

const props = defineProps<{
  summary: SessionArtifactSummary
}>()

const { t } = useI18n()

const hasContent = computed(() => props.summary.files.length > 0 || !!props.summary.error)
</script>

<template>
  <section v-if="hasContent" class="artifact-shelf" :aria-label="t('chat.artifacts.shelfTitle')">
    <header class="artifact-shelf__head">
      <div>
        <h3 class="artifact-shelf__title">{{ t('chat.artifacts.shelfTitle') }}</h3>
        <p class="artifact-shelf__meta">
          {{
            t('chat.artifacts.shelfSummary')
              .replace('{files}', String(props.summary.totals.files))
              .replace('{touches}', String(props.summary.totals.touchedCount))
              .replace('{additions}', String(props.summary.totals.additions))
              .replace('{deletions}', String(props.summary.totals.deletions))
          }}
        </p>
      </div>
    </header>

    <div v-if="props.summary.error" class="artifact-shelf__error" role="status">
      <svg class="artifact-shelf__error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 9v4" stroke-linecap="round" />
        <path d="M12 17h.01" stroke-linecap="round" />
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <span>{{ t('chat.artifacts.aggregateError') }}: {{ props.summary.error }}</span>
    </div>

    <div v-if="props.summary.files.length > 0" class="artifact-shelf__list">
      <FileOutcomeCard
        v-for="file in props.summary.files"
        :key="`session:${file.path}`"
        :file="file"
        context="session"
      />
    </div>
  </section>
</template>

<style scoped>
.artifact-shelf {
  margin-top: calc(var(--sp) * 3);
  padding: calc(var(--sp) * 2);
  border-radius: var(--r-xl);
  background: color-mix(in srgb, var(--surface-card) 92%, var(--content));
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.artifact-shelf__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: calc(var(--sp) * 1.5);
}

.artifact-shelf__title {
  margin: 0;
  font-size: var(--text-small);
  font-weight: var(--fw-semibold);
  color: var(--text-1);
}

.artifact-shelf__meta {
  margin: 4px 0 0;
  font-size: var(--text-micro);
  color: var(--text-3);
}

.artifact-shelf__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: calc(var(--sp) * 1.5);
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
  gap: calc(var(--sp) * 1.25);
}
</style>
