import { computed, ref, watch } from 'vue'

import type { MessageSchema } from './zh'
import zh from './zh'
import en from './en'

export type Locale = 'zh' | 'en'

const LOCALE_KEY = 'aldercowork:locale'

const catalogs: Record<Locale, MessageSchema> = { zh, en }

function loadLocale(): Locale {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
    return 'zh' // default to Chinese
}

const currentLocale = ref<Locale>(loadLocale())

watch(currentLocale, (v) => localStorage.setItem(LOCALE_KEY, v))

/** Resolve a dot-path key from the message catalog */
function resolve(obj: Record<string, unknown>, path: string): string {
    const parts = path.split('.')
    let cur: unknown = obj
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return path
        cur = (cur as Record<string, unknown>)[p]
    }
    return typeof cur === 'string' ? cur : path
}

/**
 * i18n composable — returns a reactive `t()` function.
 *
 * @example
 * const { t, locale, setLocale } = useI18n()
 * t('nav.sessions')  // '会话' or 'Sessions'
 */
export function useI18n() {
    const messages = computed(() => catalogs[currentLocale.value])

    function t(key: string): string {
        return resolve(messages.value as unknown as Record<string, unknown>, key)
    }

    function setLocale(l: Locale) {
        currentLocale.value = l
    }

    return {
        t,
        locale: currentLocale,
        setLocale,
    }
}

export { zh, en }
export type { MessageSchema }
