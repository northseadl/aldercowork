<script setup lang="ts">
import { useI18n } from '../../i18n'

const { t } = useI18n()

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
  <div class="ss">
    <h2 class="ss__title">{{ t('settings.shortcuts.title') }}</h2>
    <p class="ss__desc">{{ t('settings.shortcuts.desc') }}</p>

    <div class="ss__list">
      <div v-for="s in shortcuts" :key="s.keys" class="ss__row">
        <span class="ss__label">{{ t(s.action) }}</span>
        <kbd class="ss__kbd">{{ s.keys }}</kbd>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ss { display: grid; gap: calc(var(--sp) * 2); max-width: 480px; }
.ss__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font);
  color: var(--text-1);
}
.ss__desc {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
}
.ss__list {
  display: grid;
  gap: 0;
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--content-warm);
  overflow: hidden;
}
.ss__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.ss__row:last-child { border-bottom: 0; }
.ss__label {
  color: var(--text-2);
  font-size: var(--text-small);
}
.ss__kbd {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border);
  background: var(--content);
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
}
</style>
