<script setup lang="ts">
/**
 * ReferencePopover — inline completion dropdown for @ references.
 *
 * Minimally invasive: no separate search input (textarea text after @ IS the query),
 * narrow width, compact items. Modeled after Claude Code / Codex inline reference UX.
 */
import { computed, nextTick, ref, watch } from 'vue'

import type { ReferenceCandidate } from '../../composables/useReference'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const props = defineProps<{
  isOpen: boolean
  isSearching: boolean
  candidates: ReferenceCandidate[]
  selectedIndex: number
  query: string
}>()

const emit = defineEmits<{
  (e: 'update:query', value: string): void
  (e: 'select', candidate: ReferenceCandidate): void
  (e: 'close'): void
  (e: 'move', delta: number): void
}>()

const listRef = ref<HTMLDivElement | null>(null)

/** Only render the popover when there's something to show */
const hasContent = computed(() =>
  props.isSearching || props.candidates.length > 0 || (props.candidates.length === 0 && props.query.trim().length > 0),
)

// Scroll selected item into view
watch(() => props.selectedIndex, async (idx) => {
  await nextTick()
  const container = listRef.value
  if (!container) return
  const item = container.children[idx] as HTMLElement | undefined
  item?.scrollIntoView({ block: 'nearest' })
})

const CATEGORY_ICON: Record<string, string> = {
  command: 'command',
  file: 'file',
  symbol: 'symbol',
}

function iconOf(c: ReferenceCandidate) {
  return CATEGORY_ICON[c.category] ?? 'file'
}
</script>

<template>
  <Transition name="ref-pop">
    <div v-if="isOpen && hasContent" class="ref-drop">
      <!-- Inline header: just the @ query echo + spinner -->
      <div v-if="isSearching || (candidates.length === 0 && query.trim())" class="ref-drop__status">
        <span v-if="isSearching" class="ref-drop__spinner" />
        <span v-else class="ref-drop__empty">{{ t('chat.reference.noResults') }}</span>
      </div>

      <!-- Compact results list -->
      <div v-if="candidates.length > 0" ref="listRef" class="ref-drop__list" role="listbox">
        <button
          v-for="(candidate, idx) in candidates"
          :key="candidate.key"
          role="option"
          type="button"
          class="ref-drop__item"
          :class="{ 'is-active': idx === selectedIndex }"
          :aria-selected="idx === selectedIndex"
          @click="emit('select', candidate)"
        >
          <svg v-if="iconOf(candidate) === 'command'" class="ref-drop__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <svg v-else-if="iconOf(candidate) === 'file'" class="ref-drop__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <svg v-else class="ref-drop__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span class="ref-drop__label">{{ candidate.label }}</span>
          <span v-if="candidate.detail" class="ref-drop__detail">{{ candidate.detail }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ref-drop {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 12px;
  width: 300px;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  z-index: 100;
  overflow: hidden;
}

/* ---------- Status (searching / empty) ---------- */
.ref-drop__status {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
}

.ref-drop__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--brand);
  border-radius: var(--r-full);
  animation: ref-spin 0.6s linear infinite;
}

@keyframes ref-spin {
  to { transform: rotate(360deg); }
}

.ref-drop__empty {
  color: var(--text-3);
  font-size: var(--text-micro);
}

/* ---------- List ---------- */
.ref-drop__list {
  overflow-y: auto;
  padding: 3px;
}

.ref-drop__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  border-radius: var(--r-sm);
  cursor: pointer;
  text-align: left;
  transition: background var(--speed-quick) var(--ease);
}

.ref-drop__item:hover,
.ref-drop__item.is-active {
  background: var(--surface-hover);
}

.ref-drop__icon {
  width: 13px;
  height: 13px;
  color: var(--text-3);
  flex-shrink: 0;
}

.ref-drop__label {
  font: var(--fw-medium) 12px / 1.2 var(--font-mono);
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.ref-drop__detail {
  font: 10px / 1 var(--font-mono);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-left: auto;
  flex-shrink: 1;
}

/* ---------- Transition ---------- */
.ref-pop-enter-active,
.ref-pop-leave-active {
  transition: opacity 100ms var(--ease), transform 100ms var(--ease);
}
.ref-pop-enter-from,
.ref-pop-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
