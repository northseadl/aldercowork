<script setup lang="ts">
import { useI18n } from '../../i18n'
import { useKernel } from '../../composables/useKernel'
import { useSettingsStore } from '../../stores/settings'

const { t } = useI18n()
const settings = useSettingsStore()
const kernel = useKernel()

/** Restart kernel — config.json already has the latest provider settings */
async function handleRestart() {
  await kernel.restart()
}
</script>

<template>
  <div class="se">
    <h2 class="se__title">{{ t('settings.engine.title') }}</h2>

    <div class="se__section">
      <div class="se__row">
        <span class="se__label">{{ t('settings.engine.status') }}</span>
        <span class="se__status" :class="`is-${kernel.status.value}`">
          <span class="se__dot" />
          {{ t(`settings.engine.statusLabels.${kernel.status.value}`) }}
        </span>
      </div>

      <div v-if="kernel.version.value" class="se__row">
        <span class="se__label">{{ t('settings.engine.version') }}</span>
        <code class="se__code">v{{ kernel.version.value }}</code>
      </div>

      <div v-if="settings.activeProviders.length > 0" class="se__row">
        <span class="se__label">{{ t('settings.engine.activeProviders') }}</span>
        <span class="se__provider-list">
          <code v-for="p in settings.activeProviders" :key="p.id" class="se__provider-tag">
            {{ settings.getProviderDef(p.id)?.label ?? p.id }}
          </code>
        </span>
      </div>

      <div v-if="kernel.error.value" class="se__error">
        {{ kernel.error.value }}
      </div>
    </div>

    <button
      class="se__restart"
      :disabled="kernel.status.value === 'starting'"
      @click="handleRestart"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 4v6h6M23 20v-6h-6" />
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
      </svg>
      {{ kernel.status.value === 'starting' ? t('settings.engine.restarting') : t('settings.engine.restart') }}
    </button>
  </div>
</template>

<style scoped>
.se { display: grid; gap: calc(var(--sp) * 2.5); max-width: 480px; }
.se__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font);
  color: var(--text-1);
}
.se__section {
  display: grid;
  gap: calc(var(--sp) * 1.5);
  padding: calc(var(--sp) * 2);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--content-warm);
}
.se__label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.se__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp);
}
.se__code {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  color: var(--text-2);
  background: var(--surface-active);
  padding: 2px 8px;
  border-radius: var(--r-sm);
}
.se__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  color: var(--text-2);
}
.se__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-full);
}
.is-running .se__dot { background: var(--brand); box-shadow: 0 0 6px color-mix(in srgb, var(--brand) 60%, transparent); }
.is-starting .se__dot { background: #f59e0b; }
.is-stopped .se__dot { background: var(--text-4); }
.is-error .se__dot { background: #ef4444; }
.is-error { color: #ef4444; }
.se__error {
  font-size: var(--text-micro);
  color: #ef4444;
  background: rgba(239, 68, 68, .08);
  padding: 8px 12px;
  border-radius: var(--r-md);
  border: 1px solid rgba(239, 68, 68, .15);
}
.se__provider-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.se__provider-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  background: var(--surface-active);
  padding: 2px 8px;
  border-radius: var(--r-full);
}
.se__restart {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--content);
  color: var(--text-1);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer;
  transition: background var(--speed-quick), border-color var(--speed-quick);
}
.se__restart:hover:not(:disabled) { background: var(--surface-hover); border-color: var(--brand); }
.se__restart:disabled { opacity: .5; cursor: not-allowed; }
.se__restart svg { width: 16px; height: 16px; }
</style>
