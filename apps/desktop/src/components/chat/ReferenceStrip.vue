<script setup lang="ts">
/**
 * ReferenceStrip — displays pending file/symbol references and command chip
 * above the compose textarea. Each chip is dismissible.
 *
 * Design: brand-tinted chips for files/symbols, amber for commands.
 * Icons use inline SVG for tree-shakability.
 */
import type { CommandReference, FileReference } from '../../stores/session'
import { useI18n } from '../../i18n'

const { t } = useI18n()

defineProps<{
  references: FileReference[]
  command: CommandReference | null
}>()

const emit = defineEmits<{
  (e: 'removeReference', index: number): void
  (e: 'clearCommand'): void
}>()

function displayName(ref: FileReference): string {
  if (ref.source.type === 'symbol' && 'name' in ref.source) return ref.source.name
  return ref.filename.split('/').pop() ?? ref.filename
}

function sourceLabel(ref: FileReference): string {
  return ref.source.type === 'file' ? t('chat.reference.file') : t('chat.reference.symbol')
}
</script>

<template>
  <div class="ref-strip" role="list" :aria-label="t('chat.reference.addReference')">
    <!-- Command/skill chip -->
    <div v-if="command" class="ref-chip ref-chip--command" role="listitem">
      <svg class="ref-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
      <span class="ref-chip__label" :title="command.name">{{ command.name }}</span>
      <button
        type="button"
        class="ref-chip__dismiss"
        @click="emit('clearCommand')"
        :aria-label="t('chat.file.remove')"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>
    </div>

    <!-- File / symbol chips -->
    <div
      v-for="(ref, idx) in references"
      :key="`ref-${idx}`"
      class="ref-chip"
      role="listitem"
    >
      <!-- File icon -->
      <svg v-if="ref.source.type === 'file'" class="ref-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
      <!-- Symbol icon -->
      <svg v-else class="ref-chip__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>

      <span class="ref-chip__label" :title="ref.filename">{{ displayName(ref) }}</span>
      <span class="ref-chip__badge">{{ sourceLabel(ref) }}</span>

      <button
        type="button"
        class="ref-chip__dismiss"
        @click="emit('removeReference', idx)"
        :aria-label="t('chat.file.remove')"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ref-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 14px 2px;
}

.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 6px 0 8px;
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand) 22%, transparent);
  font: var(--fw-medium) 11px / 1 var(--font);
  color: var(--text-1);
  max-width: 220px;
  transition: background var(--speed-quick) var(--ease);
}

.ref-chip:hover {
  background: color-mix(in srgb, var(--brand) 16%, transparent);
}

.ref-chip--command {
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-warning, #f59e0b) 25%, transparent);
}

.ref-chip--command:hover {
  background: color-mix(in srgb, var(--color-warning, #f59e0b) 18%, transparent);
}

.ref-chip__icon {
  flex-shrink: 0;
  color: var(--brand);
  font-size: 11px;
}

.ref-chip--command .ref-chip__icon {
  color: var(--color-warning, #f59e0b);
}

.ref-chip__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-chip__badge {
  font: 9px / 1 var(--font-mono);
  color: var(--text-3);
  padding: 1px 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-3) 8%, transparent);
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ref-chip__dismiss {
  width: 18px;
  height: 18px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  flex-shrink: 0;
  transition: color var(--speed-quick) var(--ease), background var(--speed-quick) var(--ease);
}

.ref-chip__dismiss:hover {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
}
</style>
