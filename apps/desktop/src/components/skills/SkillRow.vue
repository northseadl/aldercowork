<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../i18n'
import type { InstalledSkillRecord, MarketplaceSkillSummary } from '@aldercowork/skill-schema'
import SkillAuditBadge from './SkillAuditBadge.vue'

const props = defineProps<{
  skill: InstalledSkillRecord | MarketplaceSkillSummary
  kind: 'installed' | 'marketplace'
  selected?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()

const isInstalled = computed(() => props.kind === 'installed')
const installed = computed(() => (isInstalled.value ? (props.skill as InstalledSkillRecord) : null))
const market = computed(() => (!isInstalled.value ? (props.skill as MarketplaceSkillSummary) : null))

const activationLabel = computed(() => {
  if (!installed.value) return ''
  const { global, workspace } = installed.value.activation
  if (global && workspace) return t('skills.activation.bothActive')
  if (global) return t('skills.activation.global')
  if (workspace) return t('skills.activation.workspace')
  return t('skills.activation.inactive')
})

const auditSeverity = computed(() => {
  if (installed.value?.audit) return installed.value.audit.severity
  if (market.value) return market.value.risk
  return null
})

const auditStatus = computed(() => installed.value?.audit?.status ?? undefined)
</script>

<template>
  <button
    type="button"
    class="skill-row"
    :class="{ 'is-selected': selected }"
    role="option"
    :aria-selected="selected"
    @click="emit('select', skill.id)"
  >
    <div class="skill-row__top">
      <strong class="skill-row__name">{{ skill.displayName }}</strong>
      <SkillAuditBadge v-if="auditSeverity" :severity="auditSeverity" :status="auditStatus" />
    </div>
    <p class="skill-row__summary">{{ skill.summary || skill.id }}</p>
    <div class="skill-row__meta">
      <span v-if="isInstalled">{{ activationLabel }}</span>
      <span v-if="market">{{ market.publisher }}</span>
      <span>v{{ skill.version }}</span>
    </div>
  </button>
</template>

<style scoped>
/* Card-style row — gap-separated, same pattern as RunbookListItem */
.skill-row {
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--r-lg);
  background: transparent;
  color: var(--text-1);
  text-align: left;
  padding: calc(var(--sp) * 1.5) calc(var(--sp) * 1.75);
  cursor: pointer;
  display: grid;
  gap: calc(var(--sp) * 0.5);
  transition:
    background var(--speed-quick) var(--ease),
    border-color var(--speed-quick) var(--ease),
    box-shadow var(--speed-quick) var(--ease);
}

.skill-row:hover {
  border-color: color-mix(in srgb, var(--brand) 30%, var(--border));
  background: var(--surface-hover);
}

.skill-row.is-selected {
  border-color: var(--brand);
  background: var(--brand-subtle);
  box-shadow: 0 0 0 1px var(--brand-subtle);
}

.skill-row:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.skill-row__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--sp) * 0.75);
}

.skill-row__name {
  font: var(--fw-semibold) var(--text-small) / var(--lh-tight) var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-row__summary {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-micro);
  line-height: var(--lh-normal);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 0.5);
  color: var(--text-3);
  font: var(--fw-medium) 10px / 1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
</style>
