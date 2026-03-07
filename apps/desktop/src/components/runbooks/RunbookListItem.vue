<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../i18n'

import type { Runbook } from './types'

const props = defineProps<{
  runbook: Runbook
  selected: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()

const displayName = computed(() => props.runbook.name || t('runbooks.untitled'))

const snippet = computed(() => {
  const body = props.runbook.body.trim()
  if (body) return body.length > 80 ? body.slice(0, 80) + '…' : body
  if (props.runbook.steps.length > 0) {
    return props.runbook.steps.map((s) => s.text).filter(Boolean).join(', ').slice(0, 80)
  }
  return t('runbooks.empty')
})

const stepStats = computed(() => {
  const total = props.runbook.steps.length
  if (total === 0) return null
  const done = props.runbook.steps.filter((s) => s.checked).length
  return { total, done }
})

const relativeTime = computed(() => {
  try {
    const diff = Date.now() - new Date(props.runbook.updatedAt).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return t('runbooks.justNow')
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
    class="rb-list-item"
    :class="{ 'is-selected': selected }"
    role="button"
    tabindex="0"
    @click="emit('select', runbook.id)"
    @keydown.enter="emit('select', runbook.id)"
    @keydown.space.prevent="emit('select', runbook.id)"
  >
    <div class="rb-list-item__header">
      <span class="rb-list-item__name">{{ displayName }}</span>
      <span class="rb-list-item__time">{{ relativeTime }}</span>
    </div>
    <p class="rb-list-item__snippet">{{ snippet }}</p>
    <div v-if="stepStats" class="rb-list-item__steps">
      <span class="rb-list-item__step-bar">
        <span
          class="rb-list-item__step-fill"
          :style="{ width: `${(stepStats.done / stepStats.total) * 100}%` }"
        />
      </span>
      <span class="rb-list-item__step-count">{{ stepStats.done }}/{{ stepStats.total }}</span>
    </div>
  </div>
</template>

<style scoped>
.rb-list-item {
  padding: calc(var(--sp) * 1.25) calc(var(--sp) * 1.5);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 0.12s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rb-list-item:hover {
  background: var(--surface-hover);
}

.rb-list-item.is-selected {
  background: var(--surface-active, color-mix(in oklab, var(--brand) 12%, transparent));
}

.rb-list-item__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--sp);
}

.rb-list-item__name {
  font: var(--fw-semibold) var(--text-sm) / var(--lh-tight) var(--font);
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.rb-list-item__time {
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  flex-shrink: 0;
}

.rb-list-item__snippet {
  margin: 0;
  font: var(--fw-normal) var(--text-xs) / var(--lh-relaxed) var(--font);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rb-list-item__steps {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.rb-list-item__step-bar {
  flex: 1;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.rb-list-item__step-fill {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 2px;
  transition: width 0.2s ease;
}

.rb-list-item__step-count {
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  flex-shrink: 0;
}
</style>
