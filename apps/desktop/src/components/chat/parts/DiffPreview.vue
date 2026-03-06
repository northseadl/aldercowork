<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../../i18n'

const props = defineProps<{
  before?: string
  after?: string
  status: 'processing' | 'added' | 'modified' | 'deleted'
}>()

const { t } = useI18n()

const hasBefore = computed(() => (props.before ?? '').length > 0)
const hasAfter = computed(() => (props.after ?? '').length > 0)
</script>

<template>
  <div class="diff-preview">
    <div v-if="status !== 'added'" class="diff-preview__pane">
      <div class="diff-preview__label">{{ t('chat.artifacts.diffBefore') }}</div>
      <pre class="diff-preview__content" :class="{ empty: !hasBefore }">{{ hasBefore ? before : t('chat.artifacts.diffEmpty') }}</pre>
    </div>

    <div v-if="status !== 'deleted'" class="diff-preview__pane">
      <div class="diff-preview__label">{{ t('chat.artifacts.diffAfter') }}</div>
      <pre class="diff-preview__content" :class="{ empty: !hasAfter }">{{ hasAfter ? after : t('chat.artifacts.diffEmpty') }}</pre>
    </div>
  </div>
</template>

<style scoped>
.diff-preview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--sp) * 1);
  margin-top: calc(var(--sp) * 1.25);
}

.diff-preview__pane {
  min-width: 0;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--code-bg);
  overflow: hidden;
}

.diff-preview__label {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-3);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-active) 70%, transparent);
}

.diff-preview__content {
  margin: 0;
  padding: 10px;
  min-height: 72px;
  max-height: 220px;
  overflow: auto;
  font: 11px/1.55 var(--font-mono);
  white-space: pre-wrap;
  color: var(--text-1);
}

.diff-preview__content.empty {
  color: var(--text-3);
}

@media (max-width: 720px) {
  .diff-preview {
    grid-template-columns: 1fr;
  }
}
</style>
