<script setup lang="ts">
import { computed } from 'vue'

type BadgeStatus = 'running' | 'queued' | 'done'

const props = withDefaults(
  defineProps<{
    status?: BadgeStatus
  }>(),
  {
    status: 'queued',
  },
)

const fallbackLabel = computed(() => {
  const labelByStatus: Record<BadgeStatus, string> = {
    running: 'Running',
    queued: 'Queued',
    done: 'Done',
  }

  return labelByStatus[props.status]
})
</script>

<template>
  <span class="app-badge" :class="`status-${props.status}`">
    <slot>{{ fallbackLabel }}</slot>
  </span>
</template>

<style scoped>
.app-badge {
  border-radius: var(--r-full);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: var(--fw-semibold);
  line-height: 1;
  font-family: var(--font);
}

.status-running {
  background: var(--brand-subtle);
  color: var(--brand);
}

.status-queued {
  background: var(--surface-active);
  color: var(--text-3);
}

.status-done {
  background: var(--brand-muted);
  color: var(--brand);
}
</style>
