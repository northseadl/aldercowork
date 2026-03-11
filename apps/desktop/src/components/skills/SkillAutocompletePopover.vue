<script setup lang="ts">
import type { InstalledSkillRecord } from '@aldercowork/skill-schema'
import type { SkillPopoverPos } from '../../composables/useSkillAutocomplete'

defineProps<{
  skills: InstalledSkillRecord[]
  selectedIndex: number
  position: SkillPopoverPos
}>()

const emit = defineEmits<{
  select: [skillId: string]
}>()
</script>

<template>
  <div
    class="skill-ac-popover"
    :style="{ top: position.top + 'px', left: position.left + 'px' }"
  >
    <div
      v-for="(skill, idx) in skills"
      :key="skill.id"
      class="skill-ac-option"
      :class="{ 'is-selected': idx === selectedIndex }"
      @mousedown.prevent="emit('select', skill.id)"
    >
      <span class="skill-ac-option__name">{{ skill.displayName || skill.id }}</span>
      <span class="skill-ac-option__id">@{{ skill.id }}</span>
    </div>
  </div>
</template>

<style scoped>
.skill-ac-popover {
  position: absolute;
  z-index: 20;
  min-width: 200px;
  max-width: 320px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px;
}

.skill-ac-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.08s;
}

.skill-ac-option:hover,
.skill-ac-option.is-selected {
  background: var(--surface-hover);
}

.skill-ac-option__name {
  font: var(--fw-medium) var(--text-sm) / 1.2 var(--font);
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-ac-option__id {
  font: var(--fw-normal) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  flex-shrink: 0;
}
</style>
