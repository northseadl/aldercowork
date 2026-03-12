<script setup lang="ts">
/**
 * SettingsProfiles — Identity management.
 *
 * Enterprise connection is deliberately simple:
 *   URL → optional label → optional auth token → Connect.
 *
 * Everything else (catalog path, org ID, user ID, workspace root,
 * provider locks, forced model, etc.) is the Hub's responsibility
 * to configure and push down — NOT the user's to fill in manually.
 */
import { reactive, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useI18n } from '../../i18n'
import { useProfileStore } from '../../stores/profile'

const { t } = useI18n()
const profileStore = useProfileStore()
const { profiles, activeProfile, switching } = storeToRefs(profileStore)

/* ── Connect form — 3 fields, nothing more ── */
const showConnect = ref(false)
const form = reactive({
  hubUrl: '',
  label: '',
  authToken: '',
})
const saving = ref(false)
const formError = ref('')

function resetForm() {
  form.hubUrl = ''
  form.label = ''
  form.authToken = ''
  formError.value = ''
}

async function handleConnect() {
  saving.value = true
  formError.value = ''
  try {
    await profileStore.connectEnterpriseProfile({
      hubUrl: form.hubUrl.trim(),
      label: form.label.trim() || undefined,
      authToken: form.authToken.trim() || undefined,
      activate: true,
    })
    resetForm()
    showConnect.value = false
  } catch (error: unknown) {
    formError.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}

async function handleSwitch(profileId: string) {
  try { await profileStore.switchProfile(profileId) }
  catch (error: unknown) { formError.value = error instanceof Error ? error.message : String(error) }
}

async function handleRemove(profileId: string) {
  try { await profileStore.removeEnterpriseProfile(profileId, true) }
  catch (error: unknown) { formError.value = error instanceof Error ? error.message : String(error) }
}

const enterpriseProfiles = computed(() => profiles.value.filter((p) => p.kind === 'enterprise'))
const hasMultipleProfiles = computed(() => profiles.value.length > 1)

function formatProfileKind(kind: 'local' | 'enterprise'): string {
  return kind === 'enterprise'
    ? t('settings.profiles.kindEnterprise')
    : t('settings.profiles.kindLocal')
}
</script>

<template>
  <div class="sp3">
    <!-- Active identity highlight -->
    <section class="sp3__active-section">
      <div class="sp3__active-info">
        <div class="sp3__active-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div class="sp3__active-text">
          <span class="sp3__active-name">{{ activeProfile?.label || t('settings.profiles.localName') }}</span>
          <span class="sp3__active-kind">
            {{ activeProfile?.kind === 'enterprise'
              ? activeProfile.enterprise?.hubUrl ?? t('settings.profiles.kindEnterprise')
              : t('settings.profiles.localDesc') }}
          </span>
        </div>
      </div>
      <span class="sp3__active-badge">{{ t('settings.profiles.active') }}</span>
    </section>

    <!-- Other profiles (only when > 1) -->
    <section v-if="hasMultipleProfiles" class="sp3__section">
      <span class="sp3__section-label">{{ t('settings.profiles.otherProfiles') }}</span>
      <div class="sp3__profile-list">
        <article
          v-for="profile in profiles.filter(p => p.id !== activeProfile?.id)"
          :key="profile.id"
          class="sp3__profile-card"
        >
          <div class="sp3__card-info">
            <span class="sp3__card-name">{{ profile.label }}</span>
            <span class="sp3__card-kind">{{ formatProfileKind(profile.kind) }}</span>
          </div>
          <div class="sp3__card-actions">
            <button
              class="sp3__btn sp3__btn--brand"
              :disabled="switching"
              @click="handleSwitch(profile.id)"
            >{{ t('settings.profiles.switchTo') }}</button>
            <button
              v-if="profile.kind === 'enterprise'"
              class="sp3__btn sp3__btn--ghost"
              :disabled="switching"
              @click="handleRemove(profile.id)"
            >{{ t('settings.profiles.disconnect') }}</button>
          </div>
        </article>
      </div>
    </section>

    <!-- Connect enterprise -->
    <section class="sp3__section">
      <button
        v-if="!showConnect"
        class="sp3__connect-trigger"
        @click="showConnect = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {{ t('settings.profiles.connectCta') }}
      </button>

      <form v-else class="sp3__connect-form" @submit.prevent="handleConnect">
        <div class="sp3__connect-header">
          <h3 class="sp3__connect-title">{{ t('settings.profiles.connectTitle') }}</h3>
          <p class="sp3__connect-desc">{{ t('settings.profiles.connectDesc') }}</p>
        </div>

        <!-- Hub URL (required) -->
        <label class="sp3__field">
          <span>{{ t('settings.profiles.hubUrl') }}</span>
          <input v-model="form.hubUrl" type="url" required placeholder="https://hub.example.com" />
        </label>

        <!-- Label + Token (optional, side by side) -->
        <div class="sp3__grid-2">
          <label class="sp3__field">
            <span>{{ t('settings.profiles.label') }} <em class="sp3__optional">{{ t('settings.providers.optional') }}</em></span>
            <input v-model="form.label" type="text" :placeholder="t('settings.profiles.labelPlaceholder')" />
          </label>
          <label class="sp3__field">
            <span>{{ t('settings.profiles.token') }}</span>
            <input v-model="form.authToken" type="password" autocomplete="off" :placeholder="t('settings.profiles.tokenPlaceholder')" />
          </label>
        </div>

        <div v-if="formError" class="sp3__error">{{ formError }}</div>

        <div class="sp3__form-actions">
          <button type="submit" class="sp3__btn sp3__btn--brand" :disabled="saving || switching || !form.hubUrl.trim()">
            {{ saving ? t('common.loading') : t('settings.profiles.connectAction') }}
          </button>
          <button type="button" class="sp3__btn sp3__btn--ghost" @click="showConnect = false; resetForm()">
            {{ t('common.cancel') }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.sp3 { display: grid; gap: calc(var(--sp) * 2); max-width: 560px; }

/* Active identity highlight */
.sp3__active-section {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; border-radius: var(--r-lg);
  border: 1px solid color-mix(in srgb, var(--brand) 30%, var(--border));
  background: color-mix(in srgb, var(--brand) 4%, var(--content-warm));
  gap: 12px;
}
.sp3__active-info { display: flex; align-items: center; gap: 12px; }
.sp3__active-avatar {
  width: 40px; height: 40px; border-radius: var(--r-full);
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  display: flex; align-items: center; justify-content: center;
  color: var(--brand); flex-shrink: 0;
}
.sp3__active-avatar svg { width: 20px; height: 20px; }
.sp3__active-text { display: grid; gap: 2px; }
.sp3__active-name { font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font); color: var(--text-1); }
.sp3__active-kind { font-size: var(--text-micro); color: var(--text-3); }
.sp3__active-badge {
  padding: 4px 10px; border-radius: var(--r-full);
  background: color-mix(in srgb, var(--brand) 14%, transparent);
  color: var(--brand); font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  white-space: nowrap;
}

/* Section */
.sp3__section { display: grid; gap: calc(var(--sp) * 1); }
.sp3__section-label {
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase; letter-spacing: .04em; color: var(--text-3);
}

/* Profile cards */
.sp3__profile-list { display: grid; gap: calc(var(--sp) * 0.75); }
.sp3__profile-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-radius: var(--r-md);
  border: 1px solid var(--border); background: var(--content-warm);
  gap: 12px;
}
.sp3__card-info { display: grid; gap: 2px; }
.sp3__card-name { font: var(--fw-medium) var(--text-small) / 1 var(--font); color: var(--text-1); }
.sp3__card-kind { font-size: var(--text-micro); color: var(--text-3); text-transform: capitalize; }
.sp3__card-actions { display: flex; gap: 6px; }

/* Connect trigger */
.sp3__connect-trigger {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; height: 44px; border: 1px dashed var(--border);
  border-radius: var(--r-lg); background: transparent;
  color: var(--text-3); font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer; transition: all var(--speed-quick);
}
.sp3__connect-trigger:hover {
  border-color: var(--brand); color: var(--brand);
  background: color-mix(in srgb, var(--brand) 4%, transparent);
}
.sp3__connect-trigger svg { width: 16px; height: 16px; }

/* Connect form */
.sp3__connect-form {
  display: grid; gap: 14px;
  padding: calc(var(--sp) * 2);
  border: 1px solid var(--border); border-radius: var(--r-xl);
  background: var(--content-warm);
}
.sp3__connect-header { display: grid; gap: 4px; }
.sp3__connect-title { margin: 0; font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font); color: var(--text-1); }
.sp3__connect-desc { margin: 0; color: var(--text-3); font-size: var(--text-small); line-height: var(--lh-normal); }

/* Fields */
.sp3__field { display: grid; gap: 4px; }
.sp3__field > span {
  color: var(--text-3); font-size: var(--text-micro);
  text-transform: uppercase; letter-spacing: .04em;
}
.sp3__optional {
  font-style: normal;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.5;
}
.sp3__field input {
  width: 100%; border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--content); color: var(--text-1);
  padding: 8px 12px; font: var(--text-small) / 1.4 var(--font);
  outline: none; transition: border-color var(--speed-regular), box-shadow var(--speed-regular);
}
.sp3__field input:focus {
  border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-subtle);
}
.sp3__grid-2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}

/* Buttons */
.sp3__btn {
  padding: 8px 16px; border-radius: var(--r-md);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer; border: 1px solid var(--border);
  background: var(--content); color: var(--text-1);
  transition: all var(--speed-quick);
}
.sp3__btn:disabled { opacity: .5; cursor: not-allowed; }
.sp3__btn--brand {
  background: var(--brand); color: var(--shell);
  border-color: color-mix(in srgb, var(--brand) 60%, transparent);
}
.sp3__btn--brand:hover:not(:disabled) { filter: brightness(1.08); }
.sp3__btn--ghost { background: transparent; border-color: transparent; color: var(--text-3); }
.sp3__btn--ghost:hover:not(:disabled) { color: var(--text-1); }

.sp3__form-actions { display: flex; gap: 8px; }

.sp3__error {
  color: var(--color-error); background: var(--color-error-subtle);
  border: 1px solid color-mix(in srgb, var(--color-error) 18%, transparent);
  border-radius: var(--r-md); padding: 8px 12px; font-size: var(--text-small);
}

@media (max-width: 640px) {
  .sp3__grid-2 { grid-template-columns: 1fr; }
  .sp3__active-section { flex-direction: column; align-items: stretch; }
}
</style>
