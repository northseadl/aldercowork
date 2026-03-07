<script setup lang="ts">
import { useI18n, type Locale } from '../../i18n'
import { useTheme, type ThemePreference } from '../../composables/useTheme'

const { t, locale, setLocale } = useI18n()
const { preference, setPreference } = useTheme()

const themeOptions: { id: ThemePreference; labelKey: string; icon: string }[] = [
  { id: 'system', labelKey: 'settings.theme.system', icon: 'M2 3h20v14H2zM8 21h8M12 17v4' },
  { id: 'dark', labelKey: 'settings.theme.dark', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
  { id: 'light', labelKey: 'settings.theme.light', icon: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42' },
]

const languages: { id: Locale; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

const shortcuts = [
  { keys: '⏎', action: 'settings.shortcuts.keys.send' },
  { keys: '⌘ 1', action: 'settings.shortcuts.keys.sessions' },
  { keys: '⌘ 2', action: 'settings.shortcuts.keys.skills' },
  { keys: '⌘ 3', action: 'settings.shortcuts.keys.runbooks' },
  { keys: '⌘ ,', action: 'settings.shortcuts.keys.settings' },
  { keys: '⌘ N', action: 'settings.shortcuts.keys.newSession' },
  { keys: '⌘ ⇧ T', action: 'settings.shortcuts.keys.toggleTheme' },
]
</script>

<template>
  <div class="sa2">
    <!-- Theme + Language -->
    <section class="sa2__section">
      <div class="sa2__row-group">
        <span class="sa2__label">{{ t('settings.theme.mode') }}</span>
        <div class="sa2__toggles">
          <button
            v-for="opt in themeOptions"
            :key="opt.id"
            class="sa2__toggle"
            :class="{ 'is-active': preference === opt.id }"
            @click="setPreference(opt.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-for="p in opt.icon.split('M').filter(Boolean).map(s => 'M' + s)" :key="p" :d="p" />
            </svg>
            {{ t(opt.labelKey) }}
          </button>
        </div>
      </div>

      <div class="sa2__row-group">
        <span class="sa2__label">{{ t('settings.theme.language') }}</span>
        <div class="sa2__toggles">
          <button
            v-for="lang in languages"
            :key="lang.id"
            class="sa2__toggle"
            :class="{ 'is-active': locale === lang.id }"
            @click="setLocale(lang.id)"
          >
            {{ lang.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- Shortcuts -->
    <section class="sa2__section">
      <span class="sa2__label">{{ t('settings.shortcuts.title') }}</span>
      <div class="sa2__shortcuts">
        <div v-for="s in shortcuts" :key="s.keys" class="sa2__shortcut-row">
          <span class="sa2__shortcut-action">{{ t(s.action) }}</span>
          <kbd class="sa2__kbd">{{ s.keys }}</kbd>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sa2 { display: grid; gap: calc(var(--sp) * 2); max-width: 520px; }

.sa2__section {
  display: grid; gap: calc(var(--sp) * 1.5);
  padding: calc(var(--sp) * 2); border-radius: var(--r-lg);
  border: 1px solid var(--border); background: var(--content-warm);
}
.sa2__row-group { display: grid; gap: calc(var(--sp) * 0.75); }
.sa2__label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  text-transform: uppercase; letter-spacing: .04em;
}
.sa2__toggles { display: flex; gap: 8px; }
.sa2__toggle {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--content); color: var(--text-2);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer; transition: all var(--speed-quick);
}
.sa2__toggle:hover { border-color: var(--text-4); color: var(--text-1); }
.sa2__toggle.is-active {
  border-color: var(--brand); color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--content));
}
.sa2__toggle svg { width: 16px; height: 16px; }

/* Shortcuts */
.sa2__shortcuts {
  display: grid; gap: 0; border-radius: var(--r-md);
  border: 1px solid var(--border); background: var(--content); overflow: hidden;
}
.sa2__shortcut-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
}
.sa2__shortcut-row:last-child { border-bottom: 0; }
.sa2__shortcut-action { color: var(--text-2); font-size: var(--text-small); }
.sa2__kbd {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--content-warm);
  color: var(--text-3); font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  box-shadow: 0 1px 2px rgba(0,0,0,.06);
}
</style>
