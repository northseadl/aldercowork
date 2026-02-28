<script setup lang="ts">
import { ref } from 'vue'

import { useI18n } from '../i18n'
import SettingsProvider from '../components/settings/SettingsProvider.vue'
import SettingsEngine from '../components/settings/SettingsEngine.vue'
import SettingsTheme from '../components/settings/SettingsTheme.vue'
import SettingsShortcuts from '../components/settings/SettingsShortcuts.vue'
import SettingsAbout from '../components/settings/SettingsAbout.vue'

type SettingsTab = 'providers' | 'engine' | 'theme' | 'shortcuts' | 'about'

const { t } = useI18n()
const activeTab = ref<SettingsTab>('providers')

const tabs: { id: SettingsTab; icon: string }[] = [
  { id: 'providers', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'engine', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'theme', icon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z' },
  { id: 'shortcuts', icon: 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z' },
  { id: 'about', icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-14v4m0 4h.01' },
]
</script>

<template>
  <div class="settings">
    <aside class="settings__nav">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="settings__tab"
        :class="{ 'is-active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path :d="tab.icon" />
        </svg>
        <span>{{ t(`settings.tabs.${tab.id}`) }}</span>
      </button>
    </aside>

    <section class="settings__content">
      <SettingsProvider  v-if="activeTab === 'providers'" />
      <SettingsEngine    v-else-if="activeTab === 'engine'" />
      <SettingsTheme     v-else-if="activeTab === 'theme'" />
      <SettingsShortcuts v-else-if="activeTab === 'shortcuts'" />
      <SettingsAbout     v-else-if="activeTab === 'about'" />
    </section>
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  grid-template-columns: 180px 1fr;
  height: 100%;
  overflow: hidden;
}

.settings__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: calc(var(--sp) * 2) calc(var(--sp) * 1.5);
  border-right: 1px solid var(--border);
}

.settings__tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer;
  transition: background var(--speed-quick), color var(--speed-quick);
}

.settings__tab:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.settings__tab.is-active {
  background: var(--surface-active);
  color: var(--text-1);
}

.settings__tab svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.settings__content {
  overflow-y: auto;
  padding: calc(var(--sp) * 3);
}
</style>
