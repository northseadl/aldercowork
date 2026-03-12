<script setup lang="ts">
import { useI18n } from '../../i18n'
import { useKernel } from '../../composables/useKernel'
import packageJson from '../../../package.json'

const { t } = useI18n()
const kernel = useKernel()
</script>

<template>
  <div class="sa">
    <div class="sa__brand">
      <div class="sa__logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="0" y="0" width="19.5" height="19.5" rx="4.5" fill="var(--brand)" opacity=".45" />
          <rect x="4.5" y="4.5" width="19.5" height="19.5" rx="4.5" fill="var(--brand)" opacity=".75" />
        </svg>
      </div>
      <h2 class="sa__name">{{ t('settings.about.appName') }}</h2>
      <p class="sa__tagline">{{ t('settings.about.tagline') }}</p>
    </div>

    <p class="sa__desc">{{ t('settings.about.desc') }}</p>

    <div class="sa__info">
      <div class="sa__row">
        <span class="sa__label">{{ t('settings.about.appVersion') }}</span>
        <code class="sa__val">v{{ packageJson.version }}</code>
      </div>
      <div v-if="kernel.version.value" class="sa__row">
        <span class="sa__label">{{ t('settings.about.kernelVersion') }}</span>
        <code class="sa__val">v{{ kernel.version.value }}</code>
      </div>
      <div class="sa__row">
        <span class="sa__label">{{ t('settings.about.license') }}</span>
        <span class="sa__val">MIT</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sa { display: grid; gap: calc(var(--sp) * 2.5); max-width: 480px; }
.sa__brand {
  display: grid;
  justify-items: center;
  gap: calc(var(--sp) * 0.75);
  padding: calc(var(--sp) * 3) 0;
}
.sa__logo svg { width: 56px; height: 56px; }
.sa__name {
  margin: 0;
  font: var(--fw-semibold) 1.25rem / var(--lh-tight) var(--font);
  color: var(--text-1);
}
.sa__tagline {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
}
.sa__desc {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
  line-height: var(--lh-relaxed);
  text-align: center;
}
.sa__info {
  display: grid;
  gap: 0;
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--content-warm);
  overflow: hidden;
}
.sa__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.sa__row:last-child { border-bottom: 0; }
.sa__label {
  color: var(--text-3);
  font-size: var(--text-small);
}
.sa__val {
  color: var(--text-2);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
}
</style>
