<script setup lang="ts">
/**
 * ReferencePopover — floating search panel for @ references.
 *
 * Appears above the compose area when the user types `@` or clicks the
 * reference button. Searches files, symbols, and commands/skills
 * via the OpenCode SDK.
 *
 * Design principles:
 *  - Keyboard-first with mouse as secondary (↑↓ Enter Esc)
 *  - Grouped results: commands → files → symbols
 *  - Smooth enter/leave transitions
 *  - No focus trap; textarea retains focus
 */
import { nextTick, ref, watch } from 'vue'

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

const searchInput = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

// Auto-focus search input when popover opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    await nextTick()
    searchInput.value?.focus()
  }
})

// Scroll selected item into view
watch(() => props.selectedIndex, async (idx) => {
  await nextTick()
  const container = listRef.value
  if (!container) return
  const item = container.children[idx] as HTMLElement | undefined
  item?.scrollIntoView({ block: 'nearest' })
})

function handleInput(e: Event) {
  emit('update:query', (e.target as HTMLInputElement).value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    emit('move', 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    emit('move', -1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const candidate = props.candidates[props.selectedIndex]
    if (candidate) emit('select', candidate)
  }
}

const CATEGORY_META: Record<string, { icon: string; label: string }> = {
  command: { icon: '⚡', label: 'Skill / Command' },
  file: { icon: '📄', label: 'File' },
  symbol: { icon: '🔷', label: 'Symbol' },
}

function categoryOf(c: ReferenceCandidate) {
  return CATEGORY_META[c.category] ?? CATEGORY_META.file
}
</script>

<template>
  <Transition name="ref-pop">
    <div v-if="isOpen" class="ref-popover" @keydown="handleKeydown">
      <!-- Search bar -->
      <div class="ref-popover__search">
        <svg class="ref-popover__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref="searchInput"
          class="ref-popover__input"
          type="text"
          :value="query"
          :placeholder="t('chat.reference.searchPlaceholder')"
          @input="handleInput"
          autocomplete="off"
        />
        <span v-if="isSearching" class="ref-popover__spinner" />
      </div>

      <!-- Empty state -->
      <div v-if="candidates.length === 0 && !isSearching && query.trim()" class="ref-popover__empty">
        {{ t('chat.reference.noResults') }}
      </div>

      <!-- Results list -->
      <div v-if="candidates.length > 0" ref="listRef" class="ref-popover__list" role="listbox">
        <button
          v-for="(candidate, idx) in candidates"
          :key="candidate.key"
          role="option"
          type="button"
          class="ref-popover__item"
          :class="{ 'is-selected': idx === selectedIndex }"
          :aria-selected="idx === selectedIndex"
          @click="emit('select', candidate)"
        >
          <span class="ref-popover__item-icon" aria-hidden="true">{{ categoryOf(candidate).icon }}</span>
          <span class="ref-popover__item-body">
            <span class="ref-popover__item-label">{{ candidate.label }}</span>
            <span class="ref-popover__item-detail">{{ candidate.detail }}</span>
          </span>
        </button>
      </div>

      <!-- Keyboard hints -->
      <div class="ref-popover__footer">
        <kbd>↑↓</kbd> {{ t('chat.reference.navigate') }}
        <kbd>↵</kbd> {{ t('chat.reference.confirm') }}
        <kbd>esc</kbd> {{ t('chat.reference.dismiss') }}
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ref-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  overflow: hidden;
}

/* ---------- Search ---------- */
.ref-popover__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.ref-popover__search-icon {
  width: 15px;
  height: 15px;
  color: var(--text-3);
  flex-shrink: 0;
}

.ref-popover__input {
  flex: 1;
  border: 0;
  background: transparent;
  font: var(--text-small) var(--font);
  color: var(--text-1);
  outline: 0;
}
.ref-popover__input::placeholder { color: var(--text-3); }

.ref-popover__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--brand);
  border-radius: var(--r-full);
  animation: ref-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes ref-spin {
  to { transform: rotate(360deg); }
}

/* ---------- Empty ---------- */
.ref-popover__empty {
  padding: 20px 16px;
  text-align: center;
  color: var(--text-3);
  font-size: var(--text-small);
}

/* ---------- List ---------- */
.ref-popover__list {
  overflow-y: auto;
  max-height: 260px;
  padding: 4px;
}

.ref-popover__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  background: transparent;
  border-radius: var(--r-md);
  cursor: pointer;
  text-align: left;
  transition: background var(--speed-quick) var(--ease);
}

.ref-popover__item:hover,
.ref-popover__item.is-selected {
  background: var(--surface-hover);
}

.ref-popover__item-icon {
  font-size: 13px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.ref-popover__item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ref-popover__item-label {
  font: var(--fw-medium) var(--text-small) / 1.3 var(--font);
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-popover__item-detail {
  font: 11px / 1 var(--font-mono);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- Footer ---------- */
.ref-popover__footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-top: 1px solid var(--border);
  color: var(--text-3);
  font-size: 10px;
}

.ref-popover__footer kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 4px;
  font: 10px var(--font-mono);
  color: var(--text-2);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: 3px;
}

/* ---------- Transitions ---------- */
.ref-pop-enter-active,
.ref-pop-leave-active {
  transition: opacity 120ms var(--ease), transform 120ms var(--ease);
}
.ref-pop-enter-from,
.ref-pop-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
