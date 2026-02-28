<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: 'fs' | 'network' | 'shell'
  value: string
}>()

const normalizedValue = computed(() => props.value.toLowerCase())

const badgeLabel = computed(() => {
  return `${props.type}:${props.value}`
})

const badgeClass = computed(() => {
  if (props.type === 'fs') {
    return normalizedValue.value === 'write' ? 'is-fs-write' : 'is-fs-read'
  }
  if (props.type === 'shell') {
    return normalizedValue.value === 'full' ? 'is-shell-full' : 'is-shell-restricted'
  }
  return 'is-network'
})

const isWarning = computed(() => {
  return (props.type === 'fs' && normalizedValue.value === 'write')
    || (props.type === 'shell' && normalizedValue.value === 'full')
})
</script>

<template>
  <span class="permission-badge" :class="badgeClass">
    <!-- Warning triangle for dangerous permissions (fs:write, shell:full) -->
    <svg v-if="isWarning" class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" />
    </svg>

    <!-- Folder icon for fs:read -->
    <svg v-else-if="type === 'fs'" class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>

    <!-- Terminal icon for shell:restricted -->
    <svg v-else-if="type === 'shell'" class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>

    <!-- Globe icon for network -->
    <svg v-else class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
    </svg>

    <span>{{ badgeLabel }}</span>
  </span>
</template>

<style scoped>
.permission-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--r-full);
  border: 1px solid transparent;
  padding: 4px 10px;
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  letter-spacing: var(--ls-normal);
}

.badge-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.is-fs-read {
  background: rgba(34, 197, 94, .12);
  border-color: rgba(34, 197, 94, .2);
  color: #16a34a;
}

.is-fs-write {
  background: rgba(245, 158, 11, .14);
  border-color: rgba(245, 158, 11, .22);
  color: #b45309;
}

.is-network {
  background: rgba(59, 130, 246, .13);
  border-color: rgba(59, 130, 246, .22);
  color: #2563eb;
}

.is-shell-restricted {
  background: rgba(249, 115, 22, .14);
  border-color: rgba(249, 115, 22, .24);
  color: #c2410c;
}

.is-shell-full {
  background: rgba(239, 68, 68, .14);
  border-color: rgba(239, 68, 68, .24);
  color: #b91c1c;
}
</style>
