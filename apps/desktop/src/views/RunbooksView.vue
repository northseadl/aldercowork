<script setup lang="ts">
import { useI18n } from '../i18n'
const { t } = useI18n()
</script>

<template>
  <div class="runbooks-empty">
    <div class="empty-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
    </div>
    <h2>{{ t('runbooks.title') }}</h2>
    <p>{{ t('runbooks.emptyDesc') }}</p>
  </div>
</template>

<style scoped>
.runbooks-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-3);
  gap: var(--sp);
}

.empty-icon {
  margin-bottom: calc(var(--sp) * 2);
}

.empty-icon svg {
  width: 48px;
  height: 48px;
  opacity: .5;
}

.runbooks-empty h2 {
  font-size: var(--text-large);
  font-weight: var(--fw-semibold);
  color: var(--text-2);
}

.runbooks-empty p {
  font-size: var(--text-small);
}
</style>
