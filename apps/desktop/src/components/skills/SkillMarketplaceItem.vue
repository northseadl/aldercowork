<script setup lang="ts">
import type { SkillMarketSkill } from './types'

import SkillAuditBadge from './SkillAuditBadge.vue'

withDefaults(
  defineProps<{
    skill: SkillMarketSkill
    selected?: boolean
  }>(),
  {
    selected: false,
  },
)

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <button
    type="button"
    class="skill-market-item"
    :class="{ 'is-selected': selected }"
    @click="emit('select', skill.id)"
  >
    <div class="skill-market-item__header">
      <strong class="skill-market-item__title">{{ skill.displayName }}</strong>
      <SkillAuditBadge :severity="skill.risk" />
    </div>
    <p class="skill-market-item__summary">{{ skill.summary }}</p>
    <div class="skill-market-item__meta">
      <span>{{ skill.publisher }}</span>
      <span>{{ skill.version }}</span>
      <span v-if="skill.installedVersion">Installed {{ skill.installedVersion }}</span>
      <span v-if="skill.updateAvailable" class="skill-market-item__update">Update</span>
    </div>
  </button>
</template>

<style scoped>
.skill-market-item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--content);
  color: var(--text-1);
  text-align: left;
  padding: calc(var(--sp) * 1.5);
  cursor: pointer;
  transition:
    border-color var(--speed-regular) var(--ease),
    background var(--speed-regular) var(--ease);
}

.skill-market-item:hover {
  border-color: var(--brand);
}

.skill-market-item.is-selected {
  background: color-mix(in srgb, var(--syntax-function) 9%, var(--content));
  border-color: var(--syntax-function);
}

.skill-market-item__header {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--sp) * 1);
  align-items: center;
}

.skill-market-item__title {
  font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font-mono);
}

.skill-market-item__summary {
  margin: calc(var(--sp) * 0.75) 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.skill-market-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 0.75);
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1.2 var(--font-mono);
  text-transform: uppercase;
}

.skill-market-item__update {
  color: var(--brand);
}
</style>
