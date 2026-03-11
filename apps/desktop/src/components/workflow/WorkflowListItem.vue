<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../i18n'

import type { Workflow } from './types'

const props = defineProps<{
  workflow: Workflow
  selected: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()

const displayName = computed(() => props.workflow.name || t('workflow.untitled'))

const snippet = computed(() => {
  const desc = props.workflow.description.trim()
  if (desc) return desc.length > 80 ? desc.slice(0, 80) + '…' : desc
  const content = props.workflow.content.trim()
  if (content) return content.length > 80 ? content.slice(0, 80) + '…' : content
  return t('workflow.empty')
})

const relativeTime = computed(() => {
  try {
    const diff = Date.now() - new Date(props.workflow.updatedAt).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return t('workflow.justNow')
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  } catch {
    return ''
  }
})
</script>

<template>
  <div
    class="wf-list-item"
    :class="{ 'is-selected': selected }"
    role="button"
    tabindex="0"
    @click="emit('select', workflow.id)"
    @keydown.enter="emit('select', workflow.id)"
    @keydown.space.prevent="emit('select', workflow.id)"
  >
    <div class="wf-list-item__header">
      <span class="wf-list-item__name">{{ displayName }}</span>
      <span class="wf-list-item__time">{{ relativeTime }}</span>
    </div>
    <p class="wf-list-item__snippet">{{ snippet }}</p>
  </div>
</template>

<style scoped>
.wf-list-item {
  padding: calc(var(--sp) * 1.25) calc(var(--sp) * 1.5);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 0.12s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wf-list-item:hover {
  background: var(--surface-hover);
}

.wf-list-item.is-selected {
  background: var(--surface-active, color-mix(in oklab, var(--brand) 12%, transparent));
}

.wf-list-item__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--sp);
}

.wf-list-item__name {
  font: var(--fw-semibold) var(--text-sm) / var(--lh-tight) var(--font);
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.wf-list-item__time {
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  flex-shrink: 0;
}

.wf-list-item__snippet {
  margin: 0;
  font: var(--fw-normal) var(--text-xs) / var(--lh-relaxed) var(--font);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
