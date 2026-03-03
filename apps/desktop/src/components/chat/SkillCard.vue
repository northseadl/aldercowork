<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useI18n } from '../../i18n'

import type { SkillCardData, SkillStatus } from './types'

const props = defineProps<SkillCardData>()

const { t } = useI18n()

const expanded = ref(false)

watch(
  () => props.status,
  (status) => {
    if (status === 'failed') {
      expanded.value = true
    }
  },
  { immediate: true },
)

const hasDetails = computed(() => {
  return Boolean(props.input?.trim() || props.output?.trim() || props.status === 'failed')
})

const statusLabel = computed(() => {
  const labelByStatus: Record<SkillStatus, string> = {
    pending: t('chat.tools.statusPending'),
    running: t('chat.tools.statusRunning'),
    completed: t('chat.tools.statusCompleted'),
    failed: t('chat.tools.statusFailed'),
  }

  return labelByStatus[props.status]
})

const outputPlaceholder = computed(() => {
  if (props.status === 'pending' || props.status === 'running') {
    return t('chat.tools.waitingOutput')
  }

  return t('chat.tools.noOutput')
})

const detailsRef = ref<HTMLElement | null>(null)
</script>

<template>
  <article class="skill-card" :class="`is-${props.status}`">
    <div class="sk-header">
      <div class="sk-icon" aria-hidden="true">
        <svg
          v-if="props.status === 'completed'"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>

        <svg
          v-else-if="props.status === 'failed'"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 8v4" />
          <circle cx="12" cy="16" r="1" />
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>

        <svg
          v-else
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          :class="{ 'is-spinning': props.status === 'running' }"
        >
          <path d="M21 12a9 9 0 1 1-9-9" />
        </svg>
      </div>

      <div class="sk-info">
        <div class="sk-name-row">
          <div class="sk-name">{{ props.name }}</div>
          <span class="sk-badge" :class="props.status">{{ statusLabel }}</span>
        </div>
        <div v-if="props.summary" class="sk-summary">{{ props.summary }}</div>
      </div>

      <button
        v-if="hasDetails"
        type="button"
        class="sk-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <svg
          class="sk-toggle-chevron"
          :class="{ 'is-expanded': expanded }"
          width="12" height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>

    <div
      ref="detailsRef"
      class="sk-details-wrapper"
      :class="{ 'is-open': expanded }"
    >
      <section class="sk-details">
        <div v-if="props.input" class="sk-section">
          <div class="sk-label">{{ t('chat.tools.input') }}</div>
          <pre class="sk-block">{{ props.input }}</pre>
        </div>

        <div class="sk-section">
          <div class="sk-label">{{ t('chat.tools.output') }}</div>
          <pre v-if="props.output" class="sk-block">{{ props.output }}</pre>
          <div v-else class="sk-empty">{{ outputPlaceholder }}</div>
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.skill-card {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border-radius: var(--r-lg);
  background: var(--surface-card);
  border: 1px solid var(--border);
  transition: border-color var(--speed-quick) var(--ease), background var(--speed-quick) var(--ease);
}

.skill-card.is-running {
  border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
}

.skill-card.is-failed {
  border-color: color-mix(in srgb, var(--color-error) 55%, var(--border));
}

.sk-header {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--sp) * 1.5);
}

.sk-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-active);
  color: var(--text-2);
  flex-shrink: 0;
}

.skill-card.is-running .sk-icon {
  color: var(--brand);
}

.skill-card.is-failed .sk-icon {
  color: var(--color-error);
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sk-info {
  flex: 1;
  min-width: 0;
}

.sk-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sk-name {
  min-width: 0;
  font-size: var(--text-mini);
  font-weight: var(--fw-semibold);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sk-summary {
  margin-top: 2px;
  font-size: var(--text-micro);
  color: var(--text-3);
}

.sk-badge {
  font-size: 10px;
  font-weight: var(--fw-semibold);
  padding: 3px 8px;
  border-radius: var(--r-full);
  flex-shrink: 0;
}

.sk-badge.pending {
  background: var(--surface-active);
  color: var(--text-3);
}

.sk-badge.running {
  background: var(--brand-subtle);
  color: var(--brand);
}

.sk-badge.completed {
  background: var(--brand-muted);
  color: var(--brand);
}

.sk-badge.failed {
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  color: var(--color-error);
}

.sk-toggle {
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--speed-quick), background var(--speed-quick);
}

.sk-toggle:hover {
  color: var(--text-2);
  background: var(--surface-hover);
}

.sk-toggle-chevron {
  transition: transform 0.2s var(--ease);
}

.sk-toggle-chevron.is-expanded {
  transform: rotate(90deg);
}

/* Animated expand/collapse */
.sk-details-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s var(--ease);
}

.sk-details-wrapper.is-open {
  grid-template-rows: 1fr;
}

.sk-details {
  overflow: hidden;
  border-top: 0 solid transparent;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-details-wrapper.is-open .sk-details {
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid var(--border);
}

.sk-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sk-label {
  font-size: 10px;
  font-weight: var(--fw-semibold);
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.sk-block {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--r-md);
  background: var(--surface-active);
  color: var(--text-1);
  font: var(--text-micro) / 1.45 var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow: auto;
}

.sk-empty {
  font-size: var(--text-micro);
  color: var(--text-3);
}
</style>
