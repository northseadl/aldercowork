<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

import { useI18n } from '../../i18n'
import { useSettingsStore, BUILTIN_PROVIDERS, type ProviderDefinition } from '../../stores/settings'
import { useCredentialStore } from '../../composables/useCredentialStore'
import { useKernel } from '../../composables/useKernel'
import ApiKeyInput from './ApiKeyInput.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const credentialStore = useCredentialStore()
const kernel = useKernel()
let restartTimer: ReturnType<typeof setTimeout> | null = null

function getState(id: string) {
  return settings.providers.find((p) => p.id === id)
}

function scheduleKernelRestart() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(async () => {
    if (kernel.status.value !== 'running' && kernel.status.value !== 'starting') return
    try {
      await kernel.restart()
    } catch (error) {
      console.warn('[settings] restart after credential rotation failed:', error)
    }
  }, 250)
}

function onKeySaved(providerId: string, hasKey: boolean) {
  const prevHasKey = getState(providerId)?.hasKey ?? false
  settings.markProviderKey(providerId, hasKey)
  // hasKey=true -> true means key rotation; provider state snapshot is unchanged,
  // so App-level provider watcher will not restart the kernel.
  if (prevHasKey && hasKey) {
    scheduleKernelRestart()
  }
}

async function onBaseUrlChange(def: ProviderDefinition, e: Event) {
  const value = (e.target as HTMLInputElement).value.trim()
  try {
    await credentialStore.setBaseUrl(def.id, value)
  } catch (error) {
    console.warn('[settings] failed to persist base URL:', error)
    return
  }
  settings.setProviderBaseUrl(def.id, value)
}

function onSetDefault(id: string) {
  settings.setDefaultProvider(id)
}

function statusClass(id: string): string {
  const state = getState(id)
  if (!state) return 'unconfigured'
  if (state.hasKey && state.enabled) return 'connected'
  return 'unconfigured'
}

onBeforeUnmount(() => {
  if (restartTimer) clearTimeout(restartTimer)
})
</script>

<template>
  <div class="sp">
    <h2 class="sp__title">{{ t('settings.providers.title') }}</h2>
    <p class="sp__desc">{{ t('settings.providers.desc') }}</p>

    <div class="sp__list">
      <div
        v-for="def in BUILTIN_PROVIDERS"
        :key="def.id"
        class="sp__card"
        :class="{ 'is-active': getState(def.id)?.hasKey }"
      >
        <div class="sp__card-header">
          <div class="sp__card-info">
            <span class="sp__provider-name">{{ def.label }}</span>
            <span
              v-if="settings.defaultProvider === def.id"
              class="sp__default-badge"
            >{{ t('settings.providers.default') }}</span>
          </div>
          <span class="sp__status" :class="'is-' + statusClass(def.id)">
            <span class="sp__dot" />
            {{ getState(def.id)?.hasKey ? t('settings.providers.connected') : t('settings.providers.notConfigured') }}
          </span>
        </div>

        <div class="sp__card-body">
          <div class="sp__field">
            <span class="sp__field-label">API Key</span>
            <ApiKeyInput
              :provider-id="def.id"
              :env-var="def.envVar"
              :has-key="getState(def.id)?.hasKey ?? false"
              @saved="(has) => onKeySaved(def.id, has)"
            />
          </div>

          <div v-if="def.supportsBaseUrl && getState(def.id)?.hasKey" class="sp__field">
            <span class="sp__field-label">Base URL <span class="sp__optional">({{ t('settings.providers.optional') }})</span></span>
            <input
              type="url"
              class="sp__input"
              :value="getState(def.id)?.baseUrl ?? def.defaultBaseUrl ?? ''"
              :placeholder="def.defaultBaseUrl || 'https://api.example.com/v1'"
              @change="onBaseUrlChange(def, $event)"
            />
          </div>

          <div v-if="getState(def.id)?.hasKey" class="sp__card-footer">
            <code class="sp__env-hint">{{ def.envVar }}</code>
            <button
              v-if="settings.defaultProvider !== def.id"
              class="sp__set-default"
              @click="onSetDefault(def.id)"
            >{{ t('settings.providers.setDefault') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp { display: grid; gap: calc(var(--sp) * 2.5); max-width: 560px; }

.sp__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font);
  color: var(--text-1);
}

.sp__desc {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.sp__list {
  display: grid;
  gap: calc(var(--sp) * 1);
}

.sp__card {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--content-warm);
  overflow: hidden;
  transition: border-color var(--speed-regular);
}

.sp__card.is-active {
  border-color: color-mix(in srgb, var(--brand) 40%, var(--border));
}

.sp__card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.sp__card-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp__provider-name {
  font: var(--fw-semibold) var(--text-small) / 1 var(--font);
  color: var(--text-1);
}

.sp__default-badge {
  font: var(--fw-medium) 10px / 1 var(--font);
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  padding: 3px 8px;
  border-radius: var(--r-full);
  letter-spacing: .02em;
}

.sp__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  color: var(--text-3);
}

.sp__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--r-full);
}

.is-connected .sp__dot {
  background: var(--brand);
  box-shadow: 0 0 6px color-mix(in srgb, var(--brand) 50%, transparent);
}

.is-unconfigured .sp__dot {
  background: var(--text-4);
}

.sp__card-body {
  padding: 12px 16px;
  display: grid;
  gap: calc(var(--sp) * 1.25);
}

.sp__field {
  display: grid;
  gap: 4px;
}

.sp__field-label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.sp__optional {
  text-transform: none;
  letter-spacing: 0;
  font-weight: normal;
}

.sp__input {
  width: 100%;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--content);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  padding: 0 12px;
  outline: none;
  transition: border-color var(--speed-regular), box-shadow var(--speed-regular);
}

.sp__input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.sp__card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}

.sp__env-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-4);
  background: var(--surface-active);
  padding: 2px 6px;
  border-radius: var(--r-sm);
}

.sp__set-default {
  border: 0;
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  transition: color var(--speed-quick), background var(--speed-quick);
}

.sp__set-default:hover {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 6%, transparent);
}
</style>
