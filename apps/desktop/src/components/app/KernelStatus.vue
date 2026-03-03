<script setup lang="ts">
import { useI18n } from '../../i18n'
import type { KernelStatus } from '../../composables/useKernel'

const props = defineProps<{
  status: KernelStatus
  version: string | null
  error: string | null
}>()

const { t } = useI18n()

const classNames: Record<KernelStatus, string> = {
  stopped: 'is-stopped',
  starting: 'is-starting',
  running: 'is-running',
  error: 'is-error',
}

const meta = () => classNames[props.status]
const displayLabel = () => {
  if (props.status === 'running' && props.version) {
    return `v${props.version}`
  }
  if (props.status === 'error' && props.error) {
    return props.error.length > 30 ? props.error.slice(0, 30) + '…' : props.error
  }
  return t(`kernel.${props.status === 'stopped' ? 'offline' : props.status === 'starting' ? 'starting' : props.status === 'running' ? 'connected' : 'error'}`)
}
</script>

<template>
  <div class="kernel-status" :class="meta()" :title="error ?? ''">
    <span class="ks-dot">
      <span class="ks-dot__core" />
      <span v-if="status === 'starting'" class="ks-dot__ring" />
    </span>
    <span class="ks-label">{{ displayLabel() }}</span>
  </div>
</template>

<style scoped>
.kernel-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border-radius: var(--r-full);
  cursor: default;
  user-select: none;
  transition: background var(--speed-regular) var(--ease);
}

.kernel-status:hover {
  background: var(--surface-hover);
}

/* --- Dot --- */
.ks-dot {
  position: relative;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.ks-dot__core {
  position: absolute;
  inset: 0;
  border-radius: var(--r-full);
  transition: background var(--speed-regular) var(--ease),
              box-shadow var(--speed-regular) var(--ease);
}

.is-running .ks-dot__core {
  background: var(--brand);
  box-shadow: 0 0 6px color-mix(in srgb, var(--brand) 60%, transparent);
}

.is-starting .ks-dot__core {
  background: var(--color-warning);
}

.is-stopped .ks-dot__core {
  background: var(--text-4);
}

.is-error .ks-dot__core {
  background: var(--color-error);
  box-shadow: 0 0 6px color-mix(in srgb, var(--color-error) 40%, transparent);
}

/* Expanding ring animation for "starting" state */
.ks-dot__ring {
  position: absolute;
  inset: -3px;
  border-radius: var(--r-full);
  border: 1.5px solid var(--color-warning);
  animation: ring-expand 1.8s cubic-bezier(0, 0.5, 0.5, 1) infinite;
}

@keyframes ring-expand {
  0%   { transform: scale(.6); opacity: .8; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* --- Label --- */
.ks-label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  transition: color var(--speed-regular) var(--ease);
}

.is-running .ks-label { color: var(--text-2); }
.is-error .ks-label { color: var(--color-error); }
</style>

