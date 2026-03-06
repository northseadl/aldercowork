<script setup lang="ts">
const props = defineProps<{
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical'
  status?: 'pending' | 'passed' | 'blocked'
}>()

const severityLabel: Record<'info' | 'low' | 'medium' | 'high' | 'critical', string> = {
  info: 'INFO',
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
  critical: 'CRIT',
}
</script>

<template>
  <span class="audit-badge" :class="[`is-${props.severity}`, `status-${props.status ?? 'passed'}`]">
    {{ severityLabel[props.severity] }}
  </span>
</template>

<style scoped>
.audit-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  border-radius: var(--r-full);
  padding: 4px 8px;
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  letter-spacing: .04em;
  border: 1px solid transparent;
}

.is-info {
  background: color-mix(in srgb, var(--brand) 15%, transparent);
  border-color: color-mix(in srgb, var(--brand) 24%, transparent);
  color: var(--brand);
}

.is-low {
  background: rgba(34, 197, 94, .12);
  border-color: rgba(34, 197, 94, .18);
  color: #15803d;
}

.is-medium {
  background: rgba(245, 158, 11, .14);
  border-color: rgba(245, 158, 11, .2);
  color: #b45309;
}

.is-high,
.is-critical {
  background: rgba(239, 68, 68, .14);
  border-color: rgba(239, 68, 68, .22);
  color: #b91c1c;
}

.status-blocked {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent);
}
</style>
