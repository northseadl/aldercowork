<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { useI18n } from '../../i18n'
import { useSettingsStore, BUILTIN_PROVIDERS, FEATURED_PROVIDERS, type ProviderDefinition } from '../../stores/settings'
import { useCredentialStore } from '../../composables/useCredentialStore'
import { useKernel } from '../../composables/useKernel'
import ApiKeyInput from './ApiKeyInput.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const credentialStore = useCredentialStore()
const kernel = useKernel()

const showAll = ref(false)

let restartTimer: ReturnType<typeof setTimeout> | null = null

function getState(id: string) {
  return settings.providers.find((p) => p.id === id)
}

function scheduleKernelRestart() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(async () => {
    if (kernel.status.value !== 'running' && kernel.status.value !== 'starting') return
    try { await kernel.restart() } catch {}
  }, 250)
}

function onKeySaved(providerId: string, hasKey: boolean) {
  const prevHasKey = getState(providerId)?.hasKey ?? false
  settings.markProviderKey(providerId, hasKey)
  if (prevHasKey && hasKey) scheduleKernelRestart()
}

async function onBaseUrlChange(def: ProviderDefinition, e: Event) {
  const value = (e.target as HTMLInputElement).value.trim()
  try { await credentialStore.setBaseUrl(def.id, value) } catch { return }
  settings.setProviderBaseUrl(def.id, value)
}

function onSetDefault(id: string) {
  settings.setDefaultProvider(id)
}

const nonFeaturedGlobal = computed(() =>
  BUILTIN_PROVIDERS.filter((p) => !p.featured && p.region === 'global'),
)
const nonFeaturedCn = computed(() =>
  BUILTIN_PROVIDERS.filter((p) => !p.featured && p.region === 'cn'),
)

function getProviderDescription(def: ProviderDefinition): string {
  return def.descriptionKey ? t(def.descriptionKey) : (def.description ?? '')
}

onBeforeUnmount(() => { if (restartTimer) clearTimeout(restartTimer) })
</script>

<template>
  <div class="sp2">
    <!-- Engine status -->
    <section class="sp2__engine" :class="`is-${kernel.status.value}`">
      <div class="sp2__engine-row">
        <div class="sp2__engine-info">
          <span class="sp2__dot" />
          <span class="sp2__engine-label">
            {{ t(`settings.engine.statusLabels.${kernel.status.value}`) }}
          </span>
          <code v-if="kernel.version.value" class="sp2__engine-ver">v{{ kernel.version.value }}</code>
        </div>
        <button
          class="sp2__restart-btn"
          :disabled="kernel.status.value === 'starting'"
          @click="kernel.restart()"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          {{ kernel.status.value === 'starting' ? t('settings.engine.restarting') : t('settings.engine.restart') }}
        </button>
      </div>
      <div v-if="settings.activeProviders.length" class="sp2__active-tags">
        <code v-for="p in settings.activeProviders" :key="p.id" class="sp2__active-tag">
          {{ settings.getProviderDef(p.id)?.label ?? p.id }}
        </code>
      </div>
      <div v-if="kernel.error.value" class="sp2__engine-error">{{ kernel.error.value }}</div>
    </section>

    <!-- Featured providers -->
    <section class="sp2__section">
      <h3 class="sp2__section-title">{{ t('settings.providers.title') }}</h3>
      <p class="sp2__section-desc">{{ t('settings.providers.desc') }}</p>
      <div class="sp2__grid">
        <div
          v-for="def in FEATURED_PROVIDERS"
          :key="def.id"
          class="sp2__card"
          :class="{ 'is-active': getState(def.id)?.hasKey }"
        >
          <div class="sp2__card-head">
            <span class="sp2__name">{{ def.label }}</span>
            <div class="sp2__head-right">
              <span
                v-if="settings.defaultProvider === def.id"
                class="sp2__default-pill"
              >{{ t('settings.providers.default') }}</span>
              <span class="sp2__status" :class="getState(def.id)?.hasKey ? 'is-on' : 'is-off'">
                <span class="sp2__status-dot" />
              </span>
            </div>
          </div>
          <p v-if="getProviderDescription(def)" class="sp2__card-desc">{{ getProviderDescription(def) }}</p>
          <div class="sp2__key-row">
            <ApiKeyInput
              :provider-id="def.id"
              :env-var="def.envVar"
              :has-key="getState(def.id)?.hasKey ?? false"
              @saved="(has) => onKeySaved(def.id, has)"
            />
          </div>
          <div v-if="def.supportsBaseUrl && getState(def.id)?.hasKey" class="sp2__base-url">
            <input
              type="url"
              class="sp2__input"
              :value="getState(def.id)?.baseUrl ?? def.defaultBaseUrl ?? ''"
              :placeholder="def.defaultBaseUrl || 'https://api.example.com/v1'"
              @change="onBaseUrlChange(def, $event)"
            />
          </div>
          <button
            v-if="getState(def.id)?.hasKey && settings.defaultProvider !== def.id"
            class="sp2__set-default"
            @click="onSetDefault(def.id)"
          >{{ t('settings.providers.setDefault') }}</button>
        </div>
      </div>
    </section>

    <!-- All providers (collapsible) -->
    <section class="sp2__section">
      <button class="sp2__expand-btn" @click="showAll = !showAll">
        <span>{{ t('settings.providers.moreProviders') }}</span>
        <svg :class="{ 'is-open': showAll }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <template v-if="showAll">
        <!-- Global group -->
        <div v-if="nonFeaturedGlobal.length" class="sp2__group">
          <span class="sp2__group-label">{{ t('settings.providers.groupGlobal') }}</span>
          <div class="sp2__compact-list">
            <div
              v-for="def in nonFeaturedGlobal"
              :key="def.id"
              class="sp2__compact-card"
              :class="{ 'is-active': getState(def.id)?.hasKey }"
            >
              <div class="sp2__compact-head">
                <span class="sp2__name">{{ def.label }}</span>
                <span class="sp2__status" :class="getState(def.id)?.hasKey ? 'is-on' : 'is-off'">
                  <span class="sp2__status-dot" />
                </span>
              </div>
              <div class="sp2__key-row">
                <ApiKeyInput
                  :provider-id="def.id"
                  :env-var="def.envVar"
                  :has-key="getState(def.id)?.hasKey ?? false"
                  @saved="(has) => onKeySaved(def.id, has)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- China group -->
        <div v-if="nonFeaturedCn.length" class="sp2__group">
          <span class="sp2__group-label">{{ t('settings.providers.groupChina') }}</span>
          <div class="sp2__compact-list">
            <div
              v-for="def in nonFeaturedCn"
              :key="def.id"
              class="sp2__compact-card"
              :class="{ 'is-active': getState(def.id)?.hasKey }"
            >
              <div class="sp2__compact-head">
                <span class="sp2__name">{{ def.label }}</span>
                <span class="sp2__status" :class="getState(def.id)?.hasKey ? 'is-on' : 'is-off'">
                  <span class="sp2__status-dot" />
                </span>
              </div>
              <div class="sp2__key-row">
                <ApiKeyInput
                  :provider-id="def.id"
                  :env-var="def.envVar"
                  :has-key="getState(def.id)?.hasKey ?? false"
                  @saved="(has) => onKeySaved(def.id, has)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.sp2 { display: grid; gap: calc(var(--sp) * 2); max-width: 640px; }

/* Engine status */
.sp2__engine {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--content-warm);
  padding: 14px 16px;
  display: grid;
  gap: calc(var(--sp) * 0.75);
}
.sp2__engine-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp); }
.sp2__engine-info { display: flex; align-items: center; gap: 8px; }
.sp2__dot { width: 8px; height: 8px; border-radius: var(--r-full); }
.is-running .sp2__dot { background: var(--brand); box-shadow: 0 0 6px color-mix(in srgb, var(--brand) 60%, transparent); }
.is-starting .sp2__dot { background: var(--color-warning); }
.is-stopped .sp2__dot { background: var(--text-4); }
.is-error .sp2__dot { background: var(--color-error); }
.sp2__engine-label { font: var(--fw-medium) var(--text-small) / 1 var(--font); color: var(--text-1); }
.is-error .sp2__engine-label { color: var(--color-error); }
.sp2__engine-ver {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  color: var(--text-3);
  background: var(--surface-active);
  padding: 2px 8px;
  border-radius: var(--r-sm);
}
.sp2__restart-btn {
  display: flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 14px;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--content); color: var(--text-2);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  cursor: pointer; transition: all var(--speed-quick);
}
.sp2__restart-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--text-1); }
.sp2__restart-btn:disabled { opacity: .5; cursor: not-allowed; }
.sp2__restart-btn svg { width: 14px; height: 14px; }
.sp2__active-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.sp2__active-tag {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-2); background: var(--surface-active);
  padding: 2px 8px; border-radius: var(--r-full);
}
.sp2__engine-error {
  font-size: var(--text-micro); color: var(--color-error);
  background: var(--color-error-subtle); padding: 8px 12px;
  border-radius: var(--r-md); border: 1px solid color-mix(in srgb, var(--color-error) 15%, transparent);
}


/* Section */
.sp2__section { display: grid; gap: calc(var(--sp) * 1.25); }
.sp2__section-title {
  margin: 0; font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font); color: var(--text-1);
}
.sp2__section-desc {
  margin: 0; color: var(--text-3); font-size: var(--text-small); line-height: var(--lh-normal);
}

/* Featured grid */
.sp2__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: calc(var(--sp) * 1);
}

/* Provider card */
.sp2__card {
  border: 1px solid var(--border); border-radius: var(--r-lg);
  background: var(--content-warm); padding: 14px;
  display: grid; gap: calc(var(--sp) * 0.75);
  transition: border-color var(--speed-regular);
}
.sp2__card.is-active { border-color: color-mix(in srgb, var(--brand) 40%, var(--border)); }
.sp2__card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sp2__head-right { display: flex; align-items: center; gap: 6px; }
.sp2__name { font: var(--fw-semibold) var(--text-small) / 1 var(--font); color: var(--text-1); }
.sp2__card-desc { margin: 0; color: var(--text-3); font-size: var(--text-micro); }
.sp2__default-pill {
  font: var(--fw-medium) 10px / 1 var(--font); color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  padding: 3px 8px; border-radius: var(--r-full);
}
.sp2__status { display: flex; align-items: center; }
.sp2__status-dot { width: 7px; height: 7px; border-radius: var(--r-full); }
.is-on .sp2__status-dot { background: var(--brand); box-shadow: 0 0 5px color-mix(in srgb, var(--brand) 50%, transparent); }
.is-off .sp2__status-dot { background: var(--text-4); }
.sp2__key-row { min-height: 0; }
.sp2__base-url { display: grid; }
.sp2__input {
  width: 100%; height: 34px;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--content); color: var(--text-1);
  font-family: var(--font-mono); font-size: var(--text-micro);
  padding: 0 12px; outline: none;
  transition: border-color var(--speed-regular), box-shadow var(--speed-regular);
}
.sp2__input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-subtle); }
.sp2__set-default {
  border: 0; background: transparent; color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  cursor: pointer; padding: 4px 0; text-align: left;
  transition: color var(--speed-quick);
}
.sp2__set-default:hover { color: var(--brand); }

/* Expand button */
.sp2__expand-btn {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; height: 38px; padding: 0 14px;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--content); color: var(--text-2);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer; transition: all var(--speed-quick);
}
.sp2__expand-btn:hover { border-color: var(--text-4); color: var(--text-1); }
.sp2__expand-btn svg { width: 16px; height: 16px; transition: transform var(--speed-regular); }
.sp2__expand-btn svg.is-open { transform: rotate(180deg); }

/* Groups */
.sp2__group { display: grid; gap: calc(var(--sp) * 0.75); }
.sp2__group-label {
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase; letter-spacing: .04em; color: var(--text-3);
}
.sp2__compact-list { display: grid; gap: calc(var(--sp) * 0.75); }
.sp2__compact-card {
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--content-warm); padding: 12px;
  display: grid; gap: calc(var(--sp) * 0.5);
  transition: border-color var(--speed-regular);
}
.sp2__compact-card.is-active { border-color: color-mix(in srgb, var(--brand) 30%, var(--border)); }
.sp2__compact-head { display: flex; align-items: center; justify-content: space-between; }

@media (max-width: 640px) {
  .sp2__grid { grid-template-columns: 1fr; }
}
</style>
