<script setup lang="ts">
import { useI18n } from '../../i18n'
import WorkspacePicker from './WorkspacePicker.vue'

interface BreadcrumbItem {
  label: string
  current?: boolean
}

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    breadcrumbs?: BreadcrumbItem[]
  }>(),
  {
    breadcrumbs: () => [],
  },
)
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <div class="brand-mark">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="0" y="0" width="19.5" height="19.5" rx="4.5" fill="currentColor" opacity=".45" />
          <rect x="4.5" y="4.5" width="19.5" height="19.5" rx="4.5" fill="currentColor" opacity=".75" />
        </svg>
        <span>{{ t('header.brand') }}</span>
      </div>
    </div>

    <div class="header-center">
      <WorkspacePicker />
      <nav v-if="props.breadcrumbs.length" class="breadcrumb" :aria-label="t('nav.breadcrumb')">
        <template v-for="(item, index) in props.breadcrumbs" :key="`${item.label}-${index}`">
          <span :class="{ current: item.current }">{{ item.label }}</span>
          <span v-if="index < props.breadcrumbs.length - 1" class="sep">/</span>
        </template>
      </nav>
    </div>

    <div class="header-right">
      <slot name="tools" />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  grid-column: 1 / -1;
  height: var(--header-h);
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--shell);
  -webkit-app-region: drag;
  transition: background var(--speed-regular);
}

.header-left {
  width: var(--sidebar-w);
  display: flex;
  align-items: center;
  padding-left: 72px;
  gap: var(--sp);
  -webkit-app-region: no-drag;
}

.brand-mark {
  display: flex;
  align-items: center;
  gap: 7px;
}

.brand-mark svg {
  width: 16px;
  height: 16px;
  color: var(--brand);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.brand-mark span {
  font-size: var(--text-mini);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-tight);
}

.header-center {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--sp);
  -webkit-app-region: no-drag;
  min-width: 0;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-mini);
  color: var(--text-3);
  min-width: 0;
}

.breadcrumb .sep {
  color: var(--text-4);
}

.breadcrumb .current {
  color: var(--text-1);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.header-right :deep(.h-btn) {
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

.header-right :deep(.h-btn:hover) {
  background: var(--surface-hover);
  color: var(--text-1);
}

.header-right :deep(.h-btn svg) {
  width: 16px;
  height: 16px;
}
</style>
