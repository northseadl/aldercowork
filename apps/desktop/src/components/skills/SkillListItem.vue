<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../i18n'
import type { SkillPanelSkill } from './types'

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
  (event: 'select', id: string): void
}>()

const { t } = useI18n()

const activationStatus = computed(() => {
  const { global, workspace } = props.skill.activation
  if (global && workspace) return 'both'
  if (global) return 'global'
  if (workspace) return 'workspace'
  return 'none'
})

const activationTooltip = computed(() => {
  switch (activationStatus.value) {
    case 'both': return t('skills.activation.bothActive')
    case 'global': return t('skills.activation.globalActive')
    case 'workspace': return t('skills.activation.workspaceActive')
    default: return t('skills.activation.inactive')
  }
})
</script>

<template>
  <button
    type="button"
    class="skill-list-item"
    :class="{ 'is-selected': selected }"
    @click="emit('select', skill.id)"
  >
    <span class="skill-list-item__icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <span
        class="skill-list-item__dot"
        :class="`is-${activationStatus}`"
        :title="activationTooltip"
      />
    </span>

    <span class="skill-list-item__content">
      <span class="skill-list-item__title">{{ skill.name }}</span>
      <span v-if="skill.description" class="skill-list-item__description">{{ skill.description }}</span>
    </span>
  </button>
</template>

<style scoped>
.skill-list-item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: transparent;
  color: var(--text-1);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: calc(var(--sp) * 1.25);
  align-items: center;
  padding: calc(var(--sp) * 1.25) calc(var(--sp) * 1.5);
  text-align: left;
  cursor: pointer;
  transition:
    background var(--speed-regular) var(--ease),
    border-color var(--speed-regular) var(--ease);
}

.skill-list-item:hover {
  background: var(--surface-hover);
  border-color: var(--text-3);
}

.skill-list-item:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.skill-list-item.is-selected {
  background: var(--brand-subtle);
  border-color: var(--brand);
}

.skill-list-item__icon {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: var(--r-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

/* Activation status dot */
.skill-list-item__dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: var(--r-full);
  border: 2px solid var(--bg);
  transition: background var(--speed-regular) var(--ease);
}

.skill-list-item__dot.is-none {
  background: var(--text-3);
  opacity: 0.4;
}

.skill-list-item__dot.is-global {
  background: var(--syntax-function);
}

.skill-list-item__dot.is-workspace {
  background: var(--brand);
}

.skill-list-item__dot.is-both {
  background: linear-gradient(135deg, var(--syntax-function), var(--brand));
}

.skill-list-item__content {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.skill-list-item__title {
  font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font-mono);
  letter-spacing: var(--ls-tight);
  color: var(--text-1);
}

.skill-list-item__description {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-3);
  font-size: var(--text-small);
}
</style>
