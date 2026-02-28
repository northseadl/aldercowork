import { ref, watchEffect } from 'vue'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'cw-t'
const FALLBACK_THEME: Theme = 'light'

const theme = ref<Theme>(resolveInitialTheme())
let synced = false

function resolveInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return FALLBACK_THEME
  }

  const storedTheme = readStoredTheme()
  if (storedTheme) {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)

    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

function persistTheme(value: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Ignore storage write failures (private mode, permissions, etc.).
  }
}

function syncTheme() {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.theme = theme.value
  persistTheme(theme.value)
}

export function useTheme() {
  if (!synced && typeof window !== 'undefined') {
    watchEffect(() => {
      syncTheme()
    })

    synced = true
  }

  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  return { theme, toggle }
}
