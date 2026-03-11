<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useI18n } from '../../i18n'

import type { SkillCardData, SkillStatus } from './types'

const props = defineProps<SkillCardData>()

const { t } = useI18n()

const expanded = ref(false)

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const isActive = computed(() => props.status === 'pending' || props.status === 'running')
const isCompact = computed(() => props.status === 'completed')

const hasDetails = computed(() =>
  Boolean(props.input?.trim() || props.output?.trim() || props.error?.trim() || props.status === 'failed'),
)

const statusLabel = computed(() => {
  const map: Record<SkillStatus, string> = {
    pending: t('chat.tools.statusPending'),
    running: t('chat.tools.statusRunning'),
    completed: t('chat.tools.statusCompleted'),
    failed: t('chat.tools.statusFailed'),
  }
  return map[props.status]
})

const outputPlaceholder = computed(() =>
  isActive.value ? t('chat.tools.waitingOutput') : t('chat.tools.noOutput'),
)

const spinClass = computed(() => {
  if (props.status === 'running') return 'is-spinning'
  if (props.status === 'pending') return 'is-spinning-slow'
  return ''
})

// ---------------------------------------------------------------------------
// Elapsed timer — 1s interval (no need for rAF at second-level granularity)
// ---------------------------------------------------------------------------
const elapsed = ref(0)
let timerId: ReturnType<typeof setInterval> | null = null

function startTimer() {
  stopTimer()
  elapsed.value = 0
  timerId = setInterval(() => { elapsed.value += 1 }, 1_000)
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

const elapsedLabel = computed(() => {
  if (!isActive.value) return null
  const s = elapsed.value
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
})

// ---------------------------------------------------------------------------
// Unified status watcher
// ---------------------------------------------------------------------------
watch(
  () => props.status,
  (status, prev) => {
    // Auto-collapse on completion
    if (status === 'completed') expanded.value = false

    // Timer lifecycle
    const wasActive = prev === 'pending' || prev === 'running'
    const nowActive = status === 'pending' || status === 'running'
    if (nowActive && !wasActive) startTimer()
    else if (!nowActive && wasActive) stopTimer()
  },
  { immediate: true },
)

onBeforeUnmount(stopTimer)
</script>

<template>
  <!-- ── Compact row for completed tools ── -->
  <div
    v-if="isCompact"
    class="sk-row"
    :class="{ 'has-details': hasDetails }"
    role="button"
    :tabindex="hasDetails ? 0 : undefined"
    @click="hasDetails && (expanded = !expanded)"
    @keydown.enter.prevent="hasDetails && (expanded = !expanded)"
  >
    <svg class="sk-row__check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <span class="sk-row__name">{{ props.name }}</span>
    <span v-if="props.summary" class="sk-row__summary">{{ props.summary }}</span>
    <svg
      v-if="hasDetails"
      class="sk-row__chevron"
      :class="{ 'is-expanded': expanded }"
      width="10" height="10" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>

    <!-- Inline expandable details for compact mode -->
    <div v-if="expanded && hasDetails" class="sk-row__details" @click.stop>
      <div v-if="props.input" class="sk-section">
        <div class="sk-label">{{ t('chat.tools.input') }}</div>
        <pre class="sk-block">{{ props.input }}</pre>
      </div>
      <div class="sk-section">
        <div class="sk-label">{{ t('chat.tools.output') }}</div>
        <pre v-if="props.output" class="sk-block">{{ props.output }}</pre>
        <div v-else class="sk-empty"><span>{{ outputPlaceholder }}</span></div>
      </div>
      <div v-if="props.error" class="sk-section">
        <div class="sk-label">{{ t('common.error') }}</div>
        <pre class="sk-block is-error">{{ props.error }}</pre>
      </div>
    </div>
  </div>

  <!-- ── Full card for active/failed tools ── -->
  <article v-else class="skill-card" :class="`is-${props.status}`">
    <div class="sk-header">
      <div class="sk-icon" aria-hidden="true">
        <!-- Failed: warning triangle -->
        <svg v-if="props.status === 'failed'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8v4" />
          <circle cx="12" cy="16" r="1" />
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>

        <!-- Pending / Running: arc spinner -->
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" :class="spinClass">
          <path d="M21 12a9 9 0 1 1-9-9" />
        </svg>
      </div>

      <div class="sk-info">
        <div class="sk-name-row">
          <div class="sk-name">{{ props.name }}</div>
          <span class="sk-badge" :class="props.status">{{ statusLabel }}</span>
          <span v-if="elapsedLabel" class="sk-elapsed">{{ elapsedLabel }}</span>
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

    <div class="sk-details-wrapper" :class="{ 'is-open': expanded }">
      <section class="sk-details">
        <div v-if="props.input" class="sk-section">
          <div class="sk-label">{{ t('chat.tools.input') }}</div>
          <pre class="sk-block">{{ props.input }}</pre>
        </div>

        <div class="sk-section">
          <div class="sk-label">{{ t('chat.tools.output') }}</div>
          <pre v-if="props.output" class="sk-block">{{ props.output }}</pre>
          <div v-else class="sk-empty">
            <span>{{ outputPlaceholder }}</span>
            <div v-if="isActive" class="sk-shimmer" />
          </div>
        </div>
        <div v-if="props.error" class="sk-section">
          <div class="sk-label">{{ t('common.error') }}</div>
          <pre class="sk-block is-error">{{ props.error }}</pre>
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   Compact row — completed tools
   ═══════════════════════════════════════════════════════════════════════════ */

.sk-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: var(--r-md);
  min-height: 28px;
  transition: background var(--speed-quick);
}

.sk-row.has-details {
  cursor: pointer;
}
.sk-row.has-details:hover {
  background: var(--surface-hover);
}

.sk-row__check {
  color: var(--brand);
  flex-shrink: 0;
  opacity: 0.7;
}

.sk-row__name {
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.sk-row__summary {
  font-size: var(--text-micro);
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.sk-row__chevron {
  color: var(--text-3);
  flex-shrink: 0;
  transition: transform 0.15s var(--ease);
}
.sk-row__chevron.is-expanded { transform: rotate(90deg); }

.sk-row__details {
  width: 100%;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Full card — active/failed tools
   ═══════════════════════════════════════════════════════════════════════════ */

.skill-card {
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  border-radius: var(--r-lg);
  background: var(--surface-card);
  border: 1px solid var(--border);
  transition: border-color var(--speed-quick) var(--ease), background var(--speed-quick) var(--ease);
}

/* Active states: pulsing border conveys "system is working" */
.skill-card.is-pending,
.skill-card.is-running {
  animation: pulse-border 2s ease-in-out infinite;
}

@keyframes pulse-border {
  0%, 100% { border-color: color-mix(in srgb, var(--brand) 50%, var(--border)); }
  50% { border-color: color-mix(in srgb, var(--brand) 18%, var(--border)); }
}

.skill-card.is-failed {
  border-color: color-mix(in srgb, var(--color-error) 55%, var(--border));
}

/* ── Header ── */
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

.skill-card.is-running .sk-icon { color: var(--brand); }
.skill-card.is-failed .sk-icon  { color: var(--color-error); }

/* Spinner animations */
.is-spinning      { animation: spin 1s linear infinite; }
.is-spinning-slow { animation: spin 2.5s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Info ── */
.sk-info { flex: 1; min-width: 0; }

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

/* ── Status badge ── */
.sk-badge {
  font-size: 10px;
  font-weight: var(--fw-semibold);
  padding: 3px 8px;
  border-radius: var(--r-full);
  flex-shrink: 0;
}

.sk-badge.pending   { background: var(--surface-active); color: var(--text-3); }
.sk-badge.running   { background: var(--brand-subtle); color: var(--brand); }
.sk-badge.completed { background: var(--brand-muted); color: var(--brand); }
.sk-badge.failed    { background: color-mix(in srgb, var(--color-error) 12%, transparent); color: var(--color-error); }

/* ── Elapsed timer ── */
.sk-elapsed {
  font-size: 10px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  flex-shrink: 0;
}

/* ── Toggle button ── */
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

.sk-toggle-chevron { transition: transform 0.2s var(--ease); }
.sk-toggle-chevron.is-expanded { transform: rotate(90deg); }

/* ── Expandable details ── */
.sk-details-wrapper {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s var(--ease);
}

.sk-details-wrapper.is-open { grid-template-rows: 1fr; }

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

/* ── Shared section styles ── */
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

.sk-block.is-error {
  background: color-mix(in srgb, var(--color-error) 10%, var(--surface-active));
  border: 1px solid color-mix(in srgb, var(--color-error) 24%, transparent);
}

.sk-empty {
  font-size: var(--text-micro);
  color: var(--text-3);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Shimmer loading bar ── */
.sk-shimmer {
  height: 3px;
  border-radius: 2px;
  background: var(--surface-active);
  position: relative;
  overflow: hidden;
}

.sk-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand) 40%, transparent), transparent);
  animation: shimmer-slide 1.5s ease-in-out infinite;
}

@keyframes shimmer-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning,
  .is-spinning-slow { animation: none; }
  .skill-card.is-pending,
  .skill-card.is-running { animation: none; }
}
</style>
