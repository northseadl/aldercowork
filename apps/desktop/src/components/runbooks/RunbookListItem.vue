<script setup lang="ts">
import type { Runbook } from './types'

const props = defineProps<{
  runbook: Runbook
  selected: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

function formatTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  } catch {
    return ''
  }
}

/**
 * Count unchecked `- [ ]` and checked `- [x]` in the content.
 */
function todoStats(content: string): { done: number; total: number } | null {
  const unchecked = (content.match(/^- \[ \]/gm) ?? []).length
  const checked = (content.match(/^- \[x\]/gim) ?? []).length
  const total = unchecked + checked
  return total > 0 ? { done: checked, total } : null
}

const stats = todoStats(props.runbook.content)
</script>

<template>
  <button
    type="button"
    class="runbook-item"
    :class="{ 'is-selected': selected }"
    @click="emit('select', runbook.id)"
  >
    <div class="runbook-item__header">
      <span class="runbook-item__name">{{ runbook.name || '未命名' }}</span>
      <span class="runbook-item__time">{{ formatTime(runbook.updatedAt) }}</span>
    </div>

    <div class="runbook-item__meta">
      <span v-if="stats" class="runbook-item__todo-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        {{ stats.done }}/{{ stats.total }}
      </span>
      <span v-else class="runbook-item__snippet">{{ runbook.content.slice(0, 60).replace(/\n/g, ' ') || '空白手册' }}</span>
    </div>
  </button>
</template>

<style scoped>
.runbook-item {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--r-lg);
  background: transparent;
  padding: calc(var(--sp) * 1.25) calc(var(--sp) * 1.5);
  cursor: pointer;
  display: grid;
  gap: calc(var(--sp) * 0.5);
  transition:
    background var(--speed-quick) var(--ease),
    border-color var(--speed-quick) var(--ease);
}

.runbook-item:hover {
  background: var(--surface-hover);
}

.runbook-item.is-selected {
  background: var(--surface-active);
  border-color: var(--brand-subtle);
}

.runbook-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp);
}

.runbook-item__name {
  font: var(--fw-medium) var(--text-small) / var(--lh-tight) var(--font);
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runbook-item__time {
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  white-space: nowrap;
  flex-shrink: 0;
}

.runbook-item__meta {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 0.75);
}

.runbook-item__todo-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--brand);
  background: var(--brand-subtle);
  border-radius: var(--r-sm);
  padding: 2px 6px;
}

.runbook-item__snippet {
  font: var(--fw-regular) var(--text-micro) / var(--lh-normal) var(--font);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
