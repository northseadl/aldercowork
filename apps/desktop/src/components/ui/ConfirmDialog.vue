<script setup lang="ts">
import { computed, ref } from 'vue'

import { useConfirm } from '../../composables/useConfirm'
import { useDialogA11y } from '../../composables/useDialogA11y'
import { useI18n } from '../../i18n'

const { t } = useI18n()
const { pendingConfirm, resolveConfirm } = useConfirm()

const dialogRef = ref<HTMLElement | null>(null)
const isOpen = computed(() => pendingConfirm.value !== null)

useDialogA11y({
  open: isOpen,
  containerRef: dialogRef,
  onEscape: () => resolveConfirm('cancel'),
})
</script>

<template>
  <Teleport to="body">
    <div v-if="pendingConfirm" class="confirm-overlay" role="presentation" @click.self="resolveConfirm('cancel')">
      <div
        ref="dialogRef"
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-label="pendingConfirm.request.title"
        tabindex="-1"
      >
        <h2 class="confirm-title">{{ pendingConfirm.request.title }}</h2>
        <p class="confirm-message">{{ pendingConfirm.request.message }}</p>

        <div class="confirm-actions">
          <button
            type="button"
            class="confirm-btn confirm-btn--cancel"
            @click="resolveConfirm('cancel')"
          >
            {{ pendingConfirm.request.cancelLabel ?? t('common.cancel') }}
          </button>
          <button
            type="button"
            class="confirm-btn"
            :class="pendingConfirm.request.variant === 'danger' ? 'confirm-btn--danger' : 'confirm-btn--primary'"
            @click="resolveConfirm('confirm')"
          >
            {{ pendingConfirm.request.confirmLabel ?? t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: confirm-fade-in var(--speed-regular) var(--ease);
}

.confirm-dialog {
  width: min(100%, 400px);
  background: var(--content-warm);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-card);
  padding: calc(var(--sp) * 3);
  display: grid;
  gap: calc(var(--sp) * 2);
  animation: confirm-slide-in var(--speed-regular) var(--ease);
}

.confirm-title {
  margin: 0;
  font: var(--fw-semibold) var(--text-regular) / var(--lh-tight) var(--font);
  color: var(--text-1);
}

.confirm-message {
  margin: 0;
  font-size: var(--text-small);
  color: var(--text-2);
  line-height: var(--lh-relaxed);
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--sp) * 1);
}

.confirm-btn {
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

.confirm-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.confirm-btn--cancel {
  background: var(--surface-card);
  color: var(--text-2);
}

.confirm-btn--cancel:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.confirm-btn--primary {
  background: var(--brand);
  color: var(--content);
  border-color: var(--brand);
}

.confirm-btn--primary:hover {
  background: var(--brand-hover);
}

.confirm-btn--primary:active {
  transform: scale(0.97);
}

.confirm-btn--danger {
  background: var(--color-error);
  color: var(--on-brand);
  border-color: var(--color-error);
}

.confirm-btn--danger:hover {
  background: var(--color-error-hover);
}

.confirm-btn--danger:active {
  transform: scale(0.97);
}

@keyframes confirm-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes confirm-slide-in {
  from { opacity: 0; transform: translateY(-12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
