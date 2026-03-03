<script setup lang="ts">
import { useI18n, type Locale } from '../../i18n'
import { useTheme, type ThemePreference } from '../../composables/useTheme'

const { t, locale, setLocale } = useI18n()
const { preference, setPreference } = useTheme()

const themeOptions: { id: ThemePreference; labelKey: string }[] = [
  { id: 'system', labelKey: 'settings.theme.system' },
  { id: 'dark', labelKey: 'settings.theme.dark' },
  { id: 'light', labelKey: 'settings.theme.light' },
]

const languages: { id: Locale; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]
</script>

<template>
  <div class="st">
    <h2 class="st__title">{{ t('settings.theme.title') }}</h2>

    <div class="st__section">
      <span class="st__label">{{ t('settings.theme.mode') }}</span>
      <div class="st__toggles">
        <button
          v-for="opt in themeOptions"
          :key="opt.id"
          class="st__toggle"
          :class="{ 'is-active': preference === opt.id }"
          @click="setPreference(opt.id)"
        >
          <!-- System monitor icon -->
          <svg v-if="opt.id === 'system'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>

          <!-- Moon icon -->
          <svg v-else-if="opt.id === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>

          <!-- Sun icon -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>

          {{ t(opt.labelKey) }}
        </button>
      </div>
    </div>

    <div class="st__section">
      <span class="st__label">{{ t('settings.theme.language') }}</span>
      <div class="st__toggles">
        <button
          v-for="lang in languages"
          :key="lang.id"
          class="st__toggle"
          :class="{ 'is-active': locale === lang.id }"
          @click="setLocale(lang.id)"
        >
          {{ lang.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st { display: grid; gap: calc(var(--sp) * 2.5); max-width: 480px; }
.st__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font);
  color: var(--text-1);
}
.st__section {
  display: grid;
  gap: calc(var(--sp) * 1);
  padding: calc(var(--sp) * 2);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--content-warm);
}
.st__label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.st__toggles {
  display: flex;
  gap: 8px;
}
.st__toggle {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--content);
  color: var(--text-2);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer;
  transition: all var(--speed-quick);
}
.st__toggle:hover { border-color: var(--text-4); color: var(--text-1); }
.st__toggle.is-active {
  border-color: var(--brand);
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--content));
}
.st__toggle svg { width: 16px; height: 16px; }
</style>
