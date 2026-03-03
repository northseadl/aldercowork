<script setup lang="ts">
import { useI18n } from '../../i18n'
import { useTheme } from '../../composables/useTheme'

const { t } = useI18n()
const { preference, theme, toggle } = useTheme()
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="t(`settings.theme.${preference}`)"
    :aria-label="t(`settings.theme.${preference}`)"
    @click="toggle"
  >
    <!-- System icon -->
    <svg v-if="preference === 'system'" class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>

    <!-- Sun icon (shown when preference is light) -->
    <svg v-else-if="preference === 'light'" class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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

    <!-- Moon icon (shown when preference is dark) -->
    <svg v-else class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
}

.theme-toggle:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.theme-toggle:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.theme-icon {
  width: 16px;
  height: 16px;
  transition: transform var(--speed-regular);
}
</style>
