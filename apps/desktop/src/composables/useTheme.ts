import { computed, ref, watchEffect } from 'vue'

/** Three modes: explicit dark/light or system-follow (default) */
export type ThemePreference = 'system' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'cw-t'

// ── Singleton state (module-level) ──
const preference = ref<ThemePreference>(readStoredPreference() ?? 'system')
const systemTheme = ref<ResolvedTheme>(detectSystemTheme())
let mediaQuery: MediaQueryList | null = null
let synced = false

/** The actually applied theme — derived from preference + system state */
const resolved = computed<ResolvedTheme>(() =>
  preference.value === 'system' ? systemTheme.value : preference.value,
)

// ── Internal helpers ──

function detectSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredPreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw
    return null
  } catch {
    return null
  }
}

function persistPreference(value: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Ignore storage write failures (private mode, permissions, etc.).
  }
}

function applyToDocument(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

function handleSystemChange(e: MediaQueryListEvent) {
  systemTheme.value = e.matches ? 'dark' : 'light'
}

// ── Public API ──

export function useTheme() {
  if (!synced && typeof window !== 'undefined') {
    // Listen for OS theme changes
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', handleSystemChange)

    // Reactive sync: whenever resolved theme changes, update DOM + persist preference
    watchEffect(() => {
      applyToDocument(resolved.value)
      persistPreference(preference.value)
    })

    synced = true
  }

  function setPreference(next: ThemePreference) {
    preference.value = next
  }

  /** Cycle: system → dark → light → system */
  function toggle() {
    const order: ThemePreference[] = ['system', 'dark', 'light']
    const idx = order.indexOf(preference.value)
    preference.value = order[(idx + 1) % order.length]
  }

  return {
    /** User's raw preference (system | dark | light) */
    preference,
    /** The actually applied theme — always 'dark' | 'light' */
    theme: resolved,
    setPreference,
    toggle,
  }
}
