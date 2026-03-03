<script setup lang="ts">
import { computed, ref } from 'vue'

import { useConfirm } from '../../composables/useConfirm'
import { useDialogA11y } from '../../composables/useDialogA11y'
import { useI18n } from '../../i18n'

const { t } = useI18n()
const { pendingPermission, resolvePermission } = useConfirm()

const dialogRef = ref<HTMLElement | null>(null)
const isOpen = computed(() => pendingPermission.value !== null)

useDialogA11y({
  open: isOpen,
  containerRef: dialogRef,
  onEscape: () => resolvePermission('reject'),
})

function formatPattern(pattern?: string | string[]): string {
  if (!pattern) return '—'
  return Array.isArray(pattern) ? pattern.join(', ') : pattern
}
</script>

<template>
  <Teleport to="body">
    <div v-if="pendingPermission" class="perm-overlay" role="presentation" @click.self="resolvePermission('reject')">
      <div
        ref="dialogRef"
        class="perm-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-label="t('chat.permission.requestTitle')"
        tabindex="-1"
      >
        <div class="perm-header">
          <svg class="perm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h2 class="perm-title">{{ t('chat.permission.requestTitle') }}</h2>
        </div>

        <dl class="perm-details">
          <div class="perm-row">
            <dt>{{ t('chat.permission.permission') }}</dt>
            <dd>{{ pendingPermission.request.title }}</dd>
          </div>
          <div class="perm-row">
            <dt>{{ t('chat.permission.type') }}</dt>
            <dd><code>{{ pendingPermission.request.type }}</code></dd>
          </div>
          <div class="perm-row">
            <dt>{{ t('chat.permission.pattern') }}</dt>
            <dd><code>{{ formatPattern(pendingPermission.request.pattern) }}</code></dd>
          </div>
        </dl>

        <div class="perm-actions">
          <button
            type="button"
            class="perm-btn perm-btn--reject"
            @click="resolvePermission('reject')"
          >
            {{ t('chat.permission.reject') }}
          </button>
          <button
            type="button"
            class="perm-btn perm-btn--once"
            @click="resolvePermission('once')"
          >
            {{ t('chat.permission.allowOnce') }}
          </button>
          <button
            type="button"
            class="perm-btn perm-btn--always"
            @click="resolvePermission('always')"
          >
            {{ t('chat.permission.allowAlways') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.perm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: perm-fade-in var(--speed-regular) var(--ease);
}

.perm-dialog {
  width: min(100%, 440px);
  background: var(--content-warm);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-card);
  padding: calc(var(--sp) * 3);
  display: grid;
  gap: calc(var(--sp) * 2.5);
  animation: perm-slide-in var(--speed-regular) var(--ease);
}

.perm-header {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1.25);
}

.perm-icon {
  width: 20px;
  height: 20px;
  color: var(--color-warning);
  flex-shrink: 0;
}

.perm-title {
  margin: 0;
  font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font);
  color: var(--text-1);
}

.perm-details {
  margin: 0;
  display: grid;
  gap: calc(var(--sp) * 1);
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: calc(var(--sp) * 2);
}

.perm-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: calc(var(--sp) * 2);
}

.perm-row dt {
  font-size: var(--text-mini);
  font-weight: var(--fw-medium);
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.perm-row dd {
  font-size: var(--text-small);
  color: var(--text-1);
  text-align: right;
  overflow-wrap: anywhere;
}

.perm-row dd code {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  background: var(--surface-active);
  padding: 2px 6px;
  border-radius: var(--r-sm);
}

.perm-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--sp) * 1);
  flex-wrap: wrap;
}

.perm-btn {
  min-height: 36px;
  padding: 0 calc(var(--sp) * 2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer;
  transition:
    background var(--speed-quick) var(--ease),
    color var(--speed-quick) var(--ease),
    border-color var(--speed-quick) var(--ease),
    transform var(--speed-quick) var(--ease);
}

.perm-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.perm-btn--reject {
  background: var(--surface-card);
  color: var(--text-2);
}

.perm-btn--reject:hover {
  background: var(--surface-hover);
  color: var(--color-error);
  border-color: var(--color-error);
}

.perm-btn--once {
  background: var(--surface-card);
  color: var(--text-1);
}

.perm-btn--once:hover {
  background: var(--surface-hover);
  color: var(--text-1);
  border-color: var(--text-3);
}

.perm-btn--always {
  background: var(--brand);
  color: var(--content);
  border-color: var(--brand);
}

.perm-btn--always:hover {
  background: var(--brand-hover);
}

.perm-btn--always:active {
  transform: scale(0.97);
}

@keyframes perm-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes perm-slide-in {
  from { opacity: 0; transform: translateY(-12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
