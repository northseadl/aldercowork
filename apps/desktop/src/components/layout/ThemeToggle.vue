<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useI18n } from '../../i18n'

const { t } = useI18n()

type ThemeMode = 'dark' | 'light'

const THEME_STORAGE_KEY = 'cw-t'
const currentTheme = ref<ThemeMode>('dark')

const getStoredTheme = (): ThemeMode | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme
  }

  return null
}

const getSystemTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const applyTheme = (theme: ThemeMode) => {
  if (typeof window === 'undefined') {
    return
  }

  currentTheme.value = theme
  document.documentElement.dataset.theme = theme
  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
}

const initializeTheme = () => {
  const nextTheme = getStoredTheme() ?? getSystemTheme()
  applyTheme(nextTheme)
}

const toggleTheme = () => {
  applyTheme(currentTheme.value === 'dark' ? 'light' : 'dark')
}

onMounted(() => {
  initializeTheme()
})
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="currentTheme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')"
    :aria-label="currentTheme === 'dark' ? t('settings.theme.light') : t('settings.theme.dark')"
    @click="toggleTheme"
  >
    <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

    <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </button>
</template>

<style scoped>
.theme-toggle {
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background var(--speed-quick),
    color var(--speed-quick);
  position: relative;
}

.theme-toggle:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.theme-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.theme-toggle svg {
  width: 16px;
  height: 16px;
}

.sun,
.moon {
  position: absolute;
  transition: all var(--speed-regular);
}

.sun {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

.moon {
  opacity: 0;
  transform: rotate(-90deg) scale(0.7);
}

[data-theme='dark'] .sun {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

[data-theme='dark'] .moon {
  opacity: 0;
  transform: rotate(-90deg) scale(0.7);
}

[data-theme='light'] .sun {
  opacity: 0;
  transform: rotate(90deg) scale(0.7);
}

[data-theme='light'] .moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}
</style>
