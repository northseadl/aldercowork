<script setup lang="ts">
import { reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useI18n } from '../../i18n'
import { BUILTIN_PROVIDERS } from '../../stores/settings'
import { useProfileStore } from '../../stores/profile'
import type { EnterpriseManagedSettings, ManagedSection } from '../../types/profile'

const { t } = useI18n()
const profileStore = useProfileStore()
const { profiles, activeProfile, switching } = storeToRefs(profileStore)

const form = reactive({
  hubUrl: '',
  catalogPath: '/api/skills/catalog',
  organizationId: '',
  organizationName: '',
  userId: '',
  userName: '',
  label: '',
  authToken: '',
  strictMode: true,
  lockProviders: false,
  defaultProvider: 'anthropic',
  forcedModel: '',
  lockWorkspace: true,
  workspaceRoot: '',
  notes: '',
})

const saving = ref(false)
const formError = ref('')

function resetForm() {
  form.hubUrl = ''
  form.catalogPath = '/api/skills/catalog'
  form.organizationId = ''
  form.organizationName = ''
  form.userId = ''
  form.userName = ''
  form.label = ''
  form.authToken = ''
  form.strictMode = true
  form.lockProviders = false
  form.defaultProvider = 'anthropic'
  form.forcedModel = ''
  form.lockWorkspace = true
  form.workspaceRoot = ''
  form.notes = ''
  formError.value = ''
}

function managedSettingsPayload(): EnterpriseManagedSettings {
  const lockedSections: ManagedSection[] = []
  if (form.lockProviders) lockedSections.push('providers')
  if (form.forcedModel.trim()) lockedSections.push('model')
  if (form.lockWorkspace) lockedSections.push('workspace')

  return {
    locked: form.strictMode,
    lockedSections,
    defaultProvider: form.defaultProvider || null,
    forcedModel: form.forcedModel.trim() || null,
    workspaceRoot: form.workspaceRoot.trim() || null,
    disableWorkspaceSelection: form.lockWorkspace,
    providerOverrides: form.lockProviders
      ? {
        [form.defaultProvider]: {
          enabled: true,
          source: 'hub',
        },
      }
      : {},
    notes: form.notes.trim() || null,
    auditLevel: form.strictMode ? 'strict' : 'standard',
  }
}

async function handleConnect() {
  saving.value = true
  formError.value = ''
  try {
    if (form.lockProviders) {
      formError.value = t('settings.profiles.lockProvidersUnsupported')
      return
    }

    await profileStore.connectEnterpriseProfile({
      hubUrl: form.hubUrl.trim(),
      catalogPath: form.catalogPath.trim() || undefined,
      organizationId: form.organizationId.trim(),
      organizationName: form.organizationName.trim() || undefined,
      userId: form.userId.trim(),
      userName: form.userName.trim() || undefined,
      label: form.label.trim() || undefined,
      authToken: form.authToken.trim() || undefined,
      managedSettings: managedSettingsPayload(),
      activate: true,
    })
    resetForm()
  } catch (error: unknown) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function handleSwitch(profileId: string) {
  try {
    await profileStore.switchProfile(profileId)
  } catch (error: unknown) {
    formError.value = error instanceof Error ? error.message : String(error)
  }
}

async function handleRemove(profileId: string) {
  try {
    await profileStore.removeEnterpriseProfile(profileId, true)
  } catch (error: unknown) {
    formError.value = error instanceof Error ? error.message : String(error)
  }
}

function managedSummary(profileId: string) {
  const profile = profiles.value.find((item) => item.id === profileId)
  const managed = profile?.managedSettings
  if (!managed) return t('settings.profiles.unmanaged')
  const sections = managed.lockedSections.join(', ') || 'runtime'
  return `${managed.auditLevel || 'standard'} · ${sections}`
}
</script>

<template>
  <div class="spf">
    <header class="spf__hero">
      <div>
        <h2 class="spf__title">{{ t('settings.profiles.title') }}</h2>
        <p class="spf__desc">{{ t('settings.profiles.desc') }}</p>
      </div>
      <div v-if="activeProfile" class="spf__active-badge">
        {{ t('settings.profiles.active') }} · {{ activeProfile.label }}
      </div>
    </header>

    <section class="spf__section">
      <div class="spf__section-header">
        <h3>{{ t('settings.profiles.identities') }}</h3>
        <span class="spf__count">{{ profiles.length }}</span>
      </div>

      <div class="spf__cards">
        <article
          v-for="profile in profiles"
          :key="profile.id"
          class="spf__card"
          :class="{ 'is-active': profile.id === activeProfile?.id }"
        >
          <div class="spf__card-head">
            <div>
              <div class="spf__card-title">{{ profile.label }}</div>
              <div class="spf__card-meta">{{ profile.kind === 'enterprise' ? profile.enterprise?.hubUrl : 'Local isolated profile' }}</div>
            </div>
            <span class="spf__kind">{{ profile.kind }}</span>
          </div>

          <div class="spf__card-body">
            <div v-if="profile.kind === 'enterprise'" class="spf__meta-row">
              {{ profile.enterprise?.organizationName }} / {{ profile.enterprise?.userName }}
            </div>
            <div class="spf__meta-row">{{ managedSummary(profile.id) }}</div>
          </div>

          <div class="spf__card-actions">
            <button
              type="button"
              class="spf__btn spf__btn--primary"
              :disabled="switching || profile.id === activeProfile?.id"
              @click="handleSwitch(profile.id)"
            >
              {{ profile.id === activeProfile?.id ? t('settings.profiles.current') : t('settings.profiles.activate') }}
            </button>
            <button
              v-if="profile.kind === 'enterprise'"
              type="button"
              class="spf__btn spf__btn--danger"
              :disabled="switching"
              @click="handleRemove(profile.id)"
            >
              {{ t('settings.profiles.remove') }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="spf__section">
      <div class="spf__section-header">
        <h3>{{ t('settings.profiles.connectTitle') }}</h3>
        <span class="spf__pill">{{ t('settings.profiles.strict') }}</span>
      </div>

      <form class="spf__form" @submit.prevent="handleConnect">
        <label class="spf__field">
          <span>{{ t('settings.profiles.hubUrl') }}</span>
          <input v-model="form.hubUrl" type="url" required placeholder="https://hub.example.com" />
        </label>

        <label class="spf__field">
          <span>{{ t('settings.profiles.catalogPath') }}</span>
          <input v-model="form.catalogPath" type="text" placeholder="/api/skills/catalog" />
        </label>

        <div class="spf__grid">
          <label class="spf__field">
            <span>{{ t('settings.profiles.orgId') }}</span>
            <input v-model="form.organizationId" type="text" required />
          </label>
          <label class="spf__field">
            <span>{{ t('settings.profiles.orgName') }}</span>
            <input v-model="form.organizationName" type="text" />
          </label>
        </div>

        <div class="spf__grid">
          <label class="spf__field">
            <span>{{ t('settings.profiles.userId') }}</span>
            <input v-model="form.userId" type="text" required />
          </label>
          <label class="spf__field">
            <span>{{ t('settings.profiles.userName') }}</span>
            <input v-model="form.userName" type="text" />
          </label>
        </div>

        <div class="spf__grid">
          <label class="spf__field">
            <span>{{ t('settings.profiles.label') }}</span>
            <input v-model="form.label" type="text" :placeholder="t('settings.profiles.labelPlaceholder')" />
          </label>
          <label class="spf__field">
            <span>{{ t('settings.profiles.token') }}</span>
            <input v-model="form.authToken" type="password" autocomplete="off" />
          </label>
        </div>

        <div class="spf__policy">
          <label class="spf__toggle">
            <input v-model="form.strictMode" type="checkbox" />
            <span>{{ t('settings.profiles.lockRuntime') }}</span>
          </label>
          <label class="spf__toggle">
            <input v-model="form.lockProviders" type="checkbox" />
            <span>{{ t('settings.profiles.lockProviders') }}</span>
          </label>
          <label class="spf__toggle">
            <input v-model="form.lockWorkspace" type="checkbox" />
            <span>{{ t('settings.profiles.lockWorkspace') }}</span>
          </label>
        </div>

        <p v-if="form.lockProviders" class="spf__policy-note">
          {{ t('settings.profiles.lockProvidersUnsupported') }}
        </p>

        <div class="spf__grid">
          <label class="spf__field">
            <span>{{ t('settings.profiles.defaultProvider') }}</span>
            <select v-model="form.defaultProvider">
              <option v-for="provider in BUILTIN_PROVIDERS" :key="provider.id" :value="provider.id">
                {{ provider.label }}
              </option>
            </select>
          </label>
          <label class="spf__field">
            <span>{{ t('settings.profiles.forcedModel') }}</span>
            <input v-model="form.forcedModel" type="text" placeholder="anthropic/claude-sonnet-4" />
          </label>
        </div>

        <label class="spf__field">
          <span>{{ t('settings.profiles.workspaceRoot') }}</span>
          <input v-model="form.workspaceRoot" type="text" :placeholder="t('settings.profiles.workspacePlaceholder')" />
        </label>

        <label class="spf__field">
          <span>{{ t('settings.profiles.notes') }}</span>
          <textarea v-model="form.notes" rows="3" :placeholder="t('settings.profiles.notesPlaceholder')" />
        </label>

        <div v-if="formError" class="spf__error">{{ formError }}</div>

        <div class="spf__actions">
          <button type="submit" class="spf__btn spf__btn--primary" :disabled="saving || switching">
            {{ saving ? t('common.loading') : t('settings.profiles.connectCta') }}
          </button>
          <button type="button" class="spf__btn" :disabled="saving || switching" @click="resetForm">
            {{ t('common.clear') }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.spf {
  display: grid;
  gap: calc(var(--sp) * 2);
  max-width: 920px;
}

.spf__hero,
.spf__section-header,
.spf__card-head,
.spf__card-actions,
.spf__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.spf__title,
.spf__section h3 {
  margin: 0;
  color: var(--text-1);
}

.spf__desc,
.spf__card-meta,
.spf__meta-row {
  color: var(--text-3);
  font-size: var(--text-small);
}

.spf__policy-note {
  margin: 0;
  color: var(--color-warning);
  font-size: var(--text-micro);
}

.spf__active-badge,
.spf__pill,
.spf__kind,
.spf__count {
  padding: 4px 10px;
  border-radius: var(--r-full);
  background: var(--surface-active);
  color: var(--text-2);
  font-size: var(--text-micro);
}

.spf__section {
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
  padding: calc(var(--sp) * 2);
  display: grid;
  gap: calc(var(--sp) * 1.5);
}

.spf__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.spf__card {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--content);
  padding: 14px;
  display: grid;
  gap: 14px;
}

.spf__card.is-active {
  border-color: color-mix(in srgb, var(--brand) 38%, var(--border));
}

.spf__card-title {
  color: var(--text-1);
  font-weight: var(--fw-semibold);
}

.spf__card-body {
  display: grid;
  gap: 6px;
}

.spf__form {
  display: grid;
  gap: 14px;
}

.spf__grid,
.spf__policy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.spf__field {
  display: grid;
  gap: 6px;
}

.spf__field span {
  color: var(--text-3);
  font-size: var(--text-micro);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.spf__field input,
.spf__field select,
.spf__field textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--content);
  color: var(--text-1);
  padding: 10px 12px;
  font: var(--text-small) / 1.4 var(--font);
}

.spf__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: var(--text-small);
}

.spf__btn {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--content);
  color: var(--text-1);
  padding: 10px 14px;
  cursor: pointer;
}

.spf__btn--primary {
  background: var(--brand);
  color: var(--shell);
  border-color: color-mix(in srgb, var(--brand) 60%, transparent);
}

.spf__btn--danger {
  color: var(--color-error);
}

.spf__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spf__error {
  color: var(--color-error);
  background: var(--color-error-subtle);
  border: 1px solid color-mix(in srgb, var(--color-error) 18%, transparent);
  border-radius: var(--r-md);
  padding: 10px 12px;
  font-size: var(--text-small);
}

@media (max-width: 800px) {
  .spf__grid,
  .spf__policy {
    grid-template-columns: 1fr;
  }

  .spf__hero,
  .spf__section-header,
  .spf__card-actions,
  .spf__actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
