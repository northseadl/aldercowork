<script setup lang="ts">
import { useI18n } from '../../i18n'
import type { InstalledSkillRecord, MarketplaceSkillSummary } from '@aldercowork/skill-schema'
import SkillRow from './SkillRow.vue'

defineProps<{
  items: (InstalledSkillRecord | MarketplaceSkillSummary)[]
  kind: 'installed' | 'marketplace'
  selectedId: string
  loading: boolean
  error: string | null
  filterText: string
  showFilter: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  retry: []
  'update:filterText': [value: string]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="skill-list">
    <!-- Error -->
    <div v-if="error" class="skill-list__empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p>{{ error }}</p>
      <button type="button" class="skill-list__empty-action" @click="emit('retry')">{{ t('common.retry') }}</button>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="skill-list__skeletons">
      <div v-for="i in 4" :key="i" class="skill-list__skeleton" />
    </div>

    <!-- Empty + has search -->
    <div v-else-if="!items.length && filterText.trim()" class="skill-list__empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <p>{{ t('skills.searchNoResults') }}</p>
    </div>

    <!-- Empty + no skills at all -->
    <div v-else-if="!items.length" class="skill-list__empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
      <p>{{ t('skills.noSkillsInstalled') }}</p>
    </div>

    <!-- List -->
    <div v-else class="skill-list__items" role="listbox" :aria-label="t('skills.listLabel')">
      <SkillRow
        v-for="item in items"
        :key="item.id"
        :skill="item"
        :kind="kind"
        :selected="item.id === selectedId"
        @select="emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.skill-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

/* Gap-separated cards — matches RunbooksView list */
.skill-list__items {
  display: grid;
  align-content: start;
  gap: calc(var(--sp) * 1);
  padding-right: calc(var(--sp) * 0.5);
  flex: 1;
}

.skill-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 120px;
  gap: calc(var(--sp) * 1.5);
  text-align: center;
  color: var(--text-3);
  font-size: var(--text-small);
}

/* Dashed action button — same as Runbooks empty state */
.skill-list__empty-action {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--brand);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  transition: border-color var(--speed-regular) var(--ease), background var(--speed-regular) var(--ease);
}

.skill-list__empty-action:hover {
  border-color: var(--brand);
  background: var(--brand-subtle);
}

.skill-list__skeletons {
  display: grid;
  gap: calc(var(--sp) * 1);
}

.skill-list__skeleton {
  height: 72px;
  border-radius: var(--r-lg);
  background: linear-gradient(90deg, var(--surface-hover) 25%, var(--surface-active) 50%, var(--surface-hover) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
