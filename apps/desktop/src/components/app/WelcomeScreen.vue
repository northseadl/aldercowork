<script setup lang="ts">
import { ref, computed } from 'vue'

import { useDialogA11y } from '../../composables/useDialogA11y'
import { useI18n } from '../../i18n'
import { FEATURED_PROVIDERS, BUILTIN_PROVIDERS, useSettingsStore } from '../../stores/settings'
import { useCredentialStore } from '../../composables/useCredentialStore'

const otherProviders = BUILTIN_PROVIDERS.filter((p) => !p.featured)

const emit = defineEmits<{
  configured: []
}>()

const { t } = useI18n()
const settings = useSettingsStore()
const creds = useCredentialStore()

// --- Step management ---
const step = ref<'provider' | 'apikey' | 'enterprise-login'>('provider')
const selectedProvider = ref('anthropic')
const apiKeyInput = ref('')
const saving = ref(false)
const error = ref('')
const dialogRef = ref<HTMLElement | null>(null)
const dialogOpen = computed(() => true)

const selectedDef = computed(() =>
  BUILTIN_PROVIDERS.find((p) => p.id === selectedProvider.value) ?? BUILTIN_PROVIDERS[0],
)

useDialogA11y({
  open: dialogOpen,
  containerRef: dialogRef,
})


function selectProvider(id: string) {
  selectedProvider.value = id
  step.value = 'apikey'
  apiKeyInput.value = ''
  error.value = ''
}

function goBackToProvider() {
  step.value = 'provider'
  error.value = ''
}

async function handleSaveKey() {
  const trimmed = apiKeyInput.value.trim()
  if (!trimmed) {
    error.value = t('welcome.apiKeyRequired')
    return
  }

  saving.value = true
  error.value = ''

  try {
    await creds.setApiKey(selectedProvider.value, trimmed)
    settings.markProviderKey(selectedProvider.value, true)
    settings.setDefaultProvider(selectedProvider.value)
    settings.markConfigured()
    emit('configured')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function skipForNow() {
  settings.markConfigured()
  emit('configured')
}
</script>

<template>
  <div class="welcome" role="presentation">
    <div
      ref="dialogRef"
      class="welcome__card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-dialog-title"
      aria-describedby="welcome-dialog-subtitle"
      tabindex="-1"
    >
      <!-- Brand -->
      <div class="welcome__brand">
        <div class="welcome__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="0" y="0" width="19.5" height="19.5" rx="4.5" fill="var(--brand)" opacity=".45" />
            <rect x="4.5" y="4.5" width="19.5" height="19.5" rx="4.5" fill="var(--brand)" opacity=".75" />
          </svg>
        </div>
        <h1 id="welcome-dialog-title" class="welcome__title">{{ t('welcome.title') }}</h1>
        <p id="welcome-dialog-subtitle" class="welcome__subtitle">{{ t('welcome.subtitle') }}</p>
      </div>

      <!-- Step 1: Choose Provider -->
      <div v-if="step === 'provider'" class="welcome__step">
        <div class="welcome__step-header">
          <h2 class="welcome__section-title">{{ t('welcome.chooseProvider') }}</h2>
          <p class="welcome__desc">{{ t('welcome.chooseProviderDesc') }}</p>
        </div>

        <div class="welcome__step-body">
          <div class="welcome__providers">
            <button
              v-for="p in FEATURED_PROVIDERS"
              :key="p.id"
              class="welcome__provider-btn"
              @click="selectProvider(p.id)"
            >
              <span class="welcome__provider-name">{{ p.label }}</span>
              <span class="welcome__provider-desc">{{ p.description }}</span>
              <svg class="welcome__provider-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div v-if="otherProviders.length" class="welcome__more">
            <div class="welcome__more-label">{{ t('welcome.moreProviders') }}</div>
            <div class="welcome__more-grid">
              <button
                v-for="p in otherProviders"
                :key="p.id"
                class="welcome__more-btn"
                @click="selectProvider(p.id)"
              >
                {{ p.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="welcome__step-actions">
          <button class="welcome__skip" @click="skipForNow">
            {{ t('welcome.skipForNow') }}
          </button>
        </div>
      </div>

      <!-- Step 2: Enter API Key -->
      <div v-else-if="step === 'apikey'" class="welcome__step">
        <button class="welcome__back" @click="goBackToProvider">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {{ t('welcome.back') }}
        </button>

        <div class="welcome__step-header">
          <h2 class="welcome__section-title">{{ selectedDef.label }}</h2>
          <p class="welcome__desc">{{ t('welcome.enterApiKey') }}</p>
        </div>

        <div class="welcome__step-body">
          <form class="welcome__form" @submit.prevent="handleSaveKey">
            <div class="welcome__field">
              <label class="welcome__label" :for="`apikey-${selectedDef.id}`">{{ t('welcome.apiKeyLabel') }}</label>
              <input
                :id="`apikey-${selectedDef.id}`"
                v-model="apiKeyInput"
                type="password"
                class="welcome__input"
                :placeholder="`${selectedDef.envVar}=sk-...`"
                autocomplete="off"
                spellcheck="false"
              />
              <code class="welcome__env-hint">{{ selectedDef.envVar }}</code>
            </div>

            <div v-if="error" class="welcome__error">{{ error }}</div>

            <button type="submit" class="welcome__submit" :disabled="saving">
              {{ saving ? t('common.loading') : t('welcome.getStarted') }}
            </button>
          </form>
        </div>

        <div class="welcome__step-actions">
          <button class="welcome__skip" @click="skipForNow">
            {{ t('welcome.skipForNow') }}
          </button>
        </div>
      </div>

      <div v-else class="welcome__step">
        <div class="welcome__step-header">
          <h2 class="welcome__section-title">{{ t('welcome.chooseProvider') }}</h2>
          <p class="welcome__desc">{{ t('welcome.chooseProviderDesc') }}</p>
        </div>
        <div class="welcome__step-actions">
          <button class="welcome__skip" @click="skipForNow">
            {{ t('welcome.skipForNow') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--shell);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: clamp(16px, 4vw, 28px);
}

.welcome__card {
  width: min(100%, 460px);
  max-block-size: calc(100dvh - clamp(32px, 8vw, 56px));
  margin-block: auto;
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background: var(--content-warm);
  box-shadow: var(--shadow-card);
  padding: clamp(20px, 3vw, 24px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: calc(var(--sp) * 2);
  overflow: hidden;
}

.welcome__brand {
  text-align: center;
  display: grid;
  gap: calc(var(--sp) * 0.75);
  justify-items: center;
}

.welcome__logo svg { width: 56px; height: 56px; }

.welcome__title {
  margin: 0;
  font: var(--fw-semibold) 1.25rem / var(--lh-tight) var(--font-mono);
  color: var(--text-1);
}

.welcome__subtitle {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
}

.welcome__step {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp) * 1.5);
  min-block-size: 0;
}

.welcome__step-header {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.welcome__step-body {
  display: grid;
  gap: calc(var(--sp) * 1.5);
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-inline-end: 4px;
  margin-inline-end: -4px;
}

.welcome__step-actions {
  padding-top: calc(var(--sp) * 1.25);
  border-top: 1px solid var(--border);
}

.welcome__section-title {
  margin: 0;
  font: var(--fw-semibold) var(--text-small) / 1 var(--font-mono);
  color: var(--text-1);
}

.welcome__desc {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.welcome__back {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  cursor: pointer;
  padding: 4px 0;
  transition: color var(--speed-quick);
}

.welcome__back:hover { color: var(--text-1); }
.welcome__back svg { width: 14px; height: 14px; }

/* Provider selection buttons */
.welcome__providers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: 8px;
}

.welcome__provider-btn {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 4px 12px;
  align-items: center;
  min-block-size: 84px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--content);
  cursor: pointer;
  text-align: left;
  outline: none;
  transition:
    border-color var(--speed-quick),
    background var(--speed-quick),
    box-shadow var(--speed-quick);
}

.welcome__provider-btn:hover {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 4%, var(--content));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 26%, transparent);
}

.welcome__provider-btn:focus {
  outline: none;
}

.welcome__provider-btn:focus-visible {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 5%, var(--content));
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--brand) 45%, transparent);
}

.welcome__provider-name {
  font: var(--fw-semibold) var(--text-small) / var(--lh-tight) var(--font);
  color: var(--text-1);
  grid-column: 1;
}

.welcome__provider-desc {
  font: var(--fw-normal) var(--text-micro) / var(--lh-normal) var(--font);
  color: var(--text-3);
  grid-column: 1;
}

.welcome__provider-arrow {
  grid-column: 2;
  grid-row: 1 / 3;
  width: 16px;
  height: 16px;
  color: var(--text-4);
  transition: color var(--speed-quick);
}

.welcome__provider-btn:hover .welcome__provider-arrow {
  color: var(--brand);
}

/* Form */
.welcome__form {
  display: grid;
  gap: calc(var(--sp) * 1.5);
}

.welcome__field {
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.welcome__label {
  color: var(--text-2);
  font: var(--fw-medium) var(--text-mini) / 1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.welcome__input {
  height: 40px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--content);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: var(--text-small);
  padding: 0 calc(var(--sp) * 1.25);
  outline: none;
  transition:
    border-color var(--speed-regular) var(--ease),
    box-shadow var(--speed-regular) var(--ease);
}

.welcome__input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.welcome__env-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-4);
}

.welcome__error {
  font-size: var(--text-micro);
  color: var(--color-error);
  background: var(--color-error-subtle);
  padding: 8px 12px;
  border-radius: var(--r-md);
  border: 1px solid color-mix(in srgb, var(--color-error) 15%, transparent);
}

.welcome__submit {
  height: 44px;
  border: 0;
  border-radius: var(--r-lg);
  background: var(--brand);
  color: var(--shell);
  font: var(--fw-semibold) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  transition:
    background var(--speed-quick) var(--ease),
    transform var(--speed-quick) var(--ease),
    box-shadow var(--speed-quick) var(--ease);
  box-shadow: var(--shadow-card);
}

.welcome__submit:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.welcome__submit:active:not(:disabled) {
  transform: translateY(0);
}

.welcome__submit:disabled {
  opacity: .6;
  cursor: not-allowed;
}

.welcome__skip {
  border: 0;
  background: transparent;
  color: var(--text-4);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  cursor: pointer;
  padding: 8px;
  text-align: center;
  transition: color var(--speed-quick);
}

.welcome__skip:hover { color: var(--text-2); }

/* More providers — compact grid */
.welcome__more {
  display: grid;
  gap: calc(var(--sp) * 1.25);
  padding-top: calc(var(--sp) * 1.5);
  border-top: 1px solid var(--border);
}

.welcome__more-label {
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.welcome__more-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 8px;
}

.welcome__more-btn {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  background: transparent;
  color: var(--text-2);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  padding: 8px 14px;
  cursor: pointer;
  transition: background var(--speed-quick), color var(--speed-quick), border-color var(--speed-quick);
  text-align: center;
}

.welcome__more-btn:hover {
  background: var(--surface-hover);
  color: var(--text-1);
  border-color: var(--text-3);
}

@media (max-width: 540px) {
  .welcome {
    padding: 12px;
  }

  .welcome__card {
    max-block-size: calc(100dvh - 24px);
  }
}
</style>
