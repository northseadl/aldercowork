<script setup lang="ts">
import { useI18n } from '../../../i18n'

const props = defineProps<{
  patch?: {
    hash: string
    files: string[]
  }
}>()

const { t } = useI18n()

function basename(path: string): string {
  return path.split('/').pop() ?? path
}
</script>

<template>
  <div v-if="patch && patch.files.length > 0" class="patch-diff">
    <div class="pd-header">
      <!-- Git diff icon (two-branch merge) -->
      <svg class="pd-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M6 21V9a9 9 0 0 0 9 9" />
      </svg>
      <span class="pd-label">
        {{ t('chat.patch.filesChanged').replace('{count}', String(patch.files.length)) }}
      </span>
      <code v-if="patch.hash" class="pd-hash">{{ patch.hash.slice(0, 7) }}</code>
    </div>
    <ul class="pd-files">
      <li v-for="file in patch.files" :key="file" class="pd-file">
        <span class="pd-basename">{{ basename(file) }}</span>
        <span class="pd-path">{{ file }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.patch-diff {
  border-radius: var(--r-lg);
  background: var(--surface-card);
  border: 1px solid var(--border);
  overflow: hidden;
  margin: calc(var(--sp) * 1.5) 0;
}

.pd-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.pd-icon {
  flex-shrink: 0;
  color: var(--brand);
}

.pd-label {
  font-size: var(--text-mini);
  font-weight: var(--fw-semibold);
  color: var(--text-1);
  flex: 1;
}

.pd-hash {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-3);
  background: var(--surface-active);
  padding: 2px 6px;
  border-radius: var(--r-sm);
}

.pd-files {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pd-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  font-size: var(--text-micro);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.pd-file:last-child {
  border-bottom: 0;
}

.pd-basename {
  font-weight: var(--fw-semibold);
  font-family: var(--font-mono);
  color: var(--text-1);
  white-space: nowrap;
}

.pd-path {
  color: var(--text-3);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
