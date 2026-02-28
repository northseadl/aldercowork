<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../../i18n'

import type { FileInfo } from '../../../stores/session'

const props = defineProps<{
  file?: FileInfo
  direction?: 'input' | 'output'
}>()

const { t } = useI18n()

const isImage = computed(() => props.file?.mime?.startsWith('image/') ?? false)
const isPdf = computed(() => props.file?.mime === 'application/pdf')
const displayName = computed(() => props.file?.filename ?? t('chat.file.unnamed'))
const hasUrl = computed(() => Boolean(props.file?.url?.trim()))
</script>

<template>
  <div v-if="file && hasUrl" class="file-attachment" :class="{ 'is-image': isImage, 'is-input': direction === 'input' }">
    <!-- Inline image -->
    <template v-if="isImage">
      <img
        :src="file.url"
        :alt="displayName"
        class="file-image"
        loading="lazy"
      />
      <div class="file-meta">
        <span class="file-name">{{ displayName }}</span>
      </div>
    </template>

    <!-- PDF / generic file -->
    <template v-else>
      <div class="file-card">
        <svg class="file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path v-if="isPdf" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline v-if="isPdf" points="14 2 14 8 20 8" />
          <path v-if="!isPdf" d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline v-if="!isPdf" points="13 2 13 9 20 9" />
        </svg>
        <div class="file-info">
          <span class="file-name">{{ displayName }}</span>
          <span class="file-mime">{{ file.mime }}</span>
        </div>
        <a
          v-if="hasUrl"
          :href="file.url"
          :download="file.filename"
          class="file-download"
          :title="t('chat.file.download')"
          target="_blank"
          rel="noopener"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </a>
      </div>
    </template>
  </div>
</template>

<style scoped>
.file-attachment {
  margin: calc(var(--sp) * 1.5) 0;
}

.file-image {
  max-width: 100%;
  max-height: 400px;
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  object-fit: contain;
  display: block;
}

.file-meta {
  margin-top: 4px;
  font-size: var(--text-micro);
  color: var(--text-3);
}

.file-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--r-lg);
  background: var(--surface-card);
  border: 1px solid var(--border);
}

.file-icon {
  flex-shrink: 0;
  color: var(--brand);
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: var(--text-mini);
  font-weight: var(--fw-semibold);
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-mime {
  font-size: 10px;
  color: var(--text-3);
  font-family: var(--font-mono);
}

.file-download {
  width: 28px;
  height: 28px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  background: var(--surface-active);
  transition: color var(--speed-quick), background var(--speed-quick);
  text-decoration: none;
}

.file-download:hover {
  color: var(--brand);
  background: var(--brand-subtle);
}

.is-input .file-image {
  max-height: 200px;
}

.is-input .file-card {
  max-width: 280px;
}
</style>
