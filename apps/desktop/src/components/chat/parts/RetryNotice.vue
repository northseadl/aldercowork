<script setup lang="ts">
import { useI18n } from '../../../i18n'

const props = defineProps<{
  retry?: {
    attempt: number
    error: string
  }
}>()

const { t } = useI18n()
</script>

<template>
  <div v-if="retry" class="retry-notice">
    <svg class="retry-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
    <span class="retry-text">
      {{ t('chat.retry.label').replace('{attempt}', String(retry.attempt)) }}
    </span>
    <span class="retry-error">{{ retry.error }}</span>
  </div>
</template>

<style scoped>
.retry-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--r-md);
  background: var(--color-warning-subtle);
  border: 1px solid color-mix(in srgb, var(--color-warning) 25%, var(--border));
  margin: var(--sp) 0;
}

.retry-icon {
  flex-shrink: 0;
  color: var(--color-warning);
}

.retry-text {
  font-size: var(--text-micro);
  font-weight: var(--fw-semibold);
  color: var(--text-2);
  white-space: nowrap;
}

.retry-error {
  font-size: var(--text-micro);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
