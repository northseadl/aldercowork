<script setup lang="ts">
import { useI18n } from '../../i18n'
import { useUpdater } from '../../composables/useUpdater'

const { t } = useI18n()
const { status, available, progress, downloadAndInstall, installAndRelaunch, dismiss } = useUpdater()
</script>

<template>
  <!-- Available → download -->
  <div v-if="status === 'available' && available" class="update-banner" role="status">
    <div class="update-banner__content">
      <svg class="update-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span class="update-banner__text">
        {{ t('updater.available').replace('{version}', available.version) }}
      </span>
    </div>
    <div class="update-banner__actions">
      <button type="button" class="update-banner__btn update-banner__btn--primary" @click="downloadAndInstall">
        {{ t('updater.download') }}
      </button>
      <button type="button" class="update-banner__btn" @click="dismiss">
        {{ t('updater.dismiss') }}
      </button>
    </div>
  </div>

  <!-- Downloading -->
  <div v-else-if="status === 'downloading'" class="update-banner update-banner--downloading" role="status">
    <div class="update-banner__content">
      <div class="update-banner__spinner" />
      <span class="update-banner__text">
        {{ t('updater.downloading').replace('{progress}', String(progress)) }}
      </span>
    </div>
    <div class="update-banner__progress-bar">
      <div class="update-banner__progress-fill" :style="{ width: `${progress}%` }" />
    </div>
  </div>

  <!-- Ready → restart -->
  <div v-else-if="status === 'ready'" class="update-banner update-banner--ready" role="status">
    <div class="update-banner__content">
      <svg class="update-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span class="update-banner__text">
        {{ t('updater.ready') }}
        <span class="update-banner__subtext">{{ t('updater.readyDesc') }}</span>
      </span>
    </div>
    <div class="update-banner__actions">
      <button type="button" class="update-banner__btn update-banner__btn--primary" @click="installAndRelaunch">
        {{ t('updater.restart') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.update-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--sp) * 1.5);
  padding: 10px 16px;
  background: color-mix(in oklch, var(--brand) 12%, var(--surface-card));
  border: 1px solid color-mix(in oklch, var(--brand) 30%, transparent);
  border-radius: var(--r-lg);
  margin: 8px 12px 0;
  font: var(--fw-medium) var(--text-sm) / 1.4 var(--font);
  color: var(--text-1);
  animation: banner-in 0.3s ease-out;
}

.update-banner--downloading {
  flex-wrap: wrap;
}

.update-banner--ready {
  background: color-mix(in oklch, var(--brand) 18%, var(--surface-card));
  border-color: var(--brand);
}

@keyframes banner-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.update-banner__content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.update-banner__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--brand);
}

.update-banner__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.update-banner__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.update-banner__subtext {
  color: var(--text-3);
  margin-left: 6px;
  font-weight: var(--fw-normal);
}

.update-banner__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.update-banner__btn {
  padding: 5px 12px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-2);
  font: var(--fw-medium) var(--text-xs) / 1.2 var(--font);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.update-banner__btn:hover {
  background: var(--surface-hover);
}

.update-banner__btn--primary {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--on-brand);
}

.update-banner__btn--primary:hover {
  filter: brightness(1.1);
}

.update-banner__progress-bar {
  width: 100%;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.update-banner__progress-fill {
  height: 100%;
  background: var(--brand);
  border-radius: 2px;
  transition: width 0.3s ease;
}
</style>
