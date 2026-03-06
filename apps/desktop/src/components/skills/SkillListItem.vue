<script setup lang="ts">
import { computed } from 'vue'

import type { SkillPanelSkill } from './types'

import SkillAuditBadge from './SkillAuditBadge.vue'

const props = withDefaults(
  defineProps<{
    skill: SkillPanelSkill
    selected?: boolean
  }>(),
  {
    selected: false,
  },
)

const emit = defineEmits<{
  select: [id: string]
}>()

const activationLabel = computed(() => {
  if (props.skill.activation.global && props.skill.activation.workspace) return 'Global + Workspace'
  if (props.skill.activation.global) return 'Global'
  if (props.skill.activation.workspace) return 'Workspace'
  return 'Inactive'
})
</script>

<template>
  <button
    type="button"
    class="skill-list-item"
    :class="{ 'is-selected': selected }"
    @click="emit('select', skill.id)"
  >
    <div class="skill-list-item__main">
      <div class="skill-list-item__title-row">
        <strong class="skill-list-item__title">{{ skill.displayName }}</strong>
        <SkillAuditBadge
          v-if="skill.audit"
          :severity="skill.audit.severity"
          :status="skill.audit.status"
        />
      </div>
      <p class="skill-list-item__summary">{{ skill.summary || skill.id }}</p>
      <div class="skill-list-item__meta">
        <span>{{ activationLabel }}</span>
        <span>{{ skill.sourceLabel }}</span>
        <span v-if="skill.update?.available" class="skill-list-item__update">Update</span>
      </div>
    </div>
  </button>
</template>

<style scoped>
.skill-list-item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: transparent;
  color: var(--text-1);
  text-align: left;
  padding: calc(var(--sp) * 1.5);
  cursor: pointer;
  transition:
    border-color var(--speed-regular) var(--ease),
    background var(--speed-regular) var(--ease),
    transform var(--speed-regular) var(--ease);
}

.skill-list-item:hover {
  border-color: var(--text-3);
  background: var(--surface-hover);
  transform: translateY(-1px);
}

.skill-list-item.is-selected {
  border-color: var(--brand);
  background: var(--brand-subtle);
}

.skill-list-item:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.skill-list-item__main {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.skill-list-item__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--sp) * 1);
}

.skill-list-item__title {
  font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font-mono);
}

.skill-list-item__summary {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.skill-list-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 0.75);
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1.2 var(--font-mono);
  text-transform: uppercase;
}

.skill-list-item__update {
  color: var(--brand);
}
</style>
