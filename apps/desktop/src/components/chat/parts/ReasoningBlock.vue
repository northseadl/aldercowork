<script setup lang="ts">
/**
 * ReasoningBlock — collapsible thinking process panel.
 *
 * - Auto-expands on stream start, auto-collapses on stream end
 * - Preview text shown on toggle bar (first ~80 chars)
 * - Full text in collapsible body with auto-scroll
 */
import { nextTick, computed, ref, watch } from 'vue'

import { useI18n } from '../../../i18n'

const props = defineProps<{
  text?: string
  streaming?: boolean
}>()

const { t } = useI18n()
const expanded = ref(!!props.streaming)
const textRef = ref<HTMLElement | null>()
let userToggled = false

const isEmpty = computed(() => !props.text?.trim())

// Preview: first ~80 chars, truncated at last space
const previewText = computed(() => {
  if (!props.text) return ''
  const raw = props.text.trim()
  if (raw.length <= 80) return raw
  const cut = raw.slice(0, 80)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + '…'
})

// Auto-expand/collapse — immediate: true ensures initial streaming=true triggers expand
watch(() => props.streaming, (streaming, prev) => {
  if (streaming && !prev) {
    expanded.value = true
    userToggled = false
  }
  if (!streaming && prev && !userToggled) {
    expanded.value = false
  }
}, { immediate: true })

// Auto-scroll reasoning text to bottom during streaming
watch(() => props.text, () => {
  if (!props.streaming || !expanded.value) return
  nextTick(() => {
    const el = textRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

function toggle() {
  expanded.value = !expanded.value
  userToggled = true
}
</script>

<template>
  <div v-if="!isEmpty" class="reasoning-block" :class="{ 'is-expanded': expanded }">
    <button
      type="button"
      class="reasoning-toggle"
      @click="toggle"
    >
      <svg class="reasoning-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span class="reasoning-label">{{ t('chat.reasoning.title') }}</span>
      <svg
        class="reasoning-chevron"
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
      <span v-if="streaming" class="reasoning-dot" />
    </button>

    <!-- Preview: first part of reasoning shown on the bar -->
    <div v-if="!expanded && previewText" class="reasoning-preview" @click="toggle">
      {{ previewText }}
    </div>

    <!-- Full text body -->
    <div class="reasoning-body" :class="{ 'is-open': expanded }">
      <div class="reasoning-body-inner">
        <pre v-if="expanded" ref="textRef" class="reasoning-text">{{ props.text }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reasoning-block {
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--brand) 6%, var(--surface-card));
  border: 1px solid color-mix(in srgb, var(--brand) 18%, var(--border));
  margin: calc(var(--sp) * 1.5) 0;
  overflow: hidden;
  transition: border-color var(--speed-quick);
}

.reasoning-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--text-2);
  font-size: var(--text-mini);
  font-weight: var(--fw-semibold);
}

.reasoning-toggle:hover {
  color: var(--text-1);
}

.reasoning-icon {
  flex-shrink: 0;
  color: var(--brand);
}

.reasoning-label {
  flex: 1;
  text-align: left;
}

.reasoning-chevron {
  color: var(--text-3);
  transition: transform 0.2s var(--ease);
  flex-shrink: 0;
}

.reasoning-chevron.is-expanded {
  transform: rotate(90deg);
}

.reasoning-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand);
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* Preview on toggle bar (collapsed state) */
.reasoning-preview {
  padding: 0 14px 10px;
  font-size: var(--text-micro);
  color: var(--text-3);
  line-height: var(--lh-relaxed);
  cursor: pointer;
}

.reasoning-preview:hover {
  color: var(--text-2);
}

/* Animated expand/collapse body */
.reasoning-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s var(--ease);
}

.reasoning-body.is-open {
  grid-template-rows: 1fr;
}

.reasoning-body-inner {
  overflow: hidden;
}

.reasoning-text {
  margin: 0;
  padding: 0 14px 14px;
  font: var(--text-micro) / 1.55 var(--font-mono);
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
}
</style>
