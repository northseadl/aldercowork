<script setup lang="ts">
import { useI18n } from '../../i18n'
import type { StagedSkillRecord } from '@aldercowork/skill-schema'

defineProps<{
  staged: StagedSkillRecord
}>()

const emit = defineEmits<{
  review: []
  dismiss: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="staging-banner">
    <div class="staging-banner__info">
      <svg class="staging-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
      <div>
        <strong>{{ staged.displayName }}</strong>
        <span>{{ t('skills.staging.awaiting') }}</span>
      </div>
    </div>
    <div class="staging-banner__actions">
      <button type="button" class="staging-banner__btn" @click="emit('review')">{{ t('skills.staging.review') }}</button>
      <button type="button" class="staging-banner__btn staging-banner__btn--ghost" @click="emit('dismiss')">{{ t('skills.staging.dismiss') }}</button>
    </div>
  </div>
</template>

<style scoped>
.staging-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 30%, var(--border));
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--color-warning) 6%, var(--content-warm));
}

.staging-banner__info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.staging-banner__icon {
  width: 18px;
  height: 18px;
  color: var(--color-warning);
  flex-shrink: 0;
}

.staging-banner__info strong {
  color: var(--text-1);
  font-size: var(--text-small);
  display: block;
}

.staging-banner__info span {
  color: var(--text-3);
  font-size: var(--text-micro);
}

.staging-banner__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.staging-banner__btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--content);
  color: var(--text-1);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  cursor: pointer;
  transition: border-color var(--speed-quick);
}

.staging-banner__btn:hover { border-color: var(--brand); }

.staging-banner__btn--ghost {
  border-color: transparent;
  background: transparent;
  color: var(--text-3);
}

.staging-banner__btn--ghost:hover { color: var(--text-1); }
</style>
