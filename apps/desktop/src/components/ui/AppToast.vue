<script setup lang="ts">
import { useToast } from '../../composables/useToast'
import { useI18n } from '../../i18n'

const { toasts, removeToast } = useToast()
const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-container" aria-live="polite">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="[`toast-${toast.type}`]"
        role="status"
        @click="removeToast(toast.id)"
      >
        <span class="toast-icon">
          <svg v-if="toast.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg v-else-if="toast.type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </span>
        <span class="toast-message">{{ toast.message }}</span>
        <button type="button" class="toast-close" :aria-label="t('common.close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: calc(var(--header-h) + var(--sp) * 2);
  right: calc(var(--sp) * 4);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: calc(var(--sp) * 1.5);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1.5);
  background: var(--surface-card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xl);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: calc(var(--sp) * 1.5) calc(var(--sp) * 2);
  border-radius: var(--r-xl);
  color: var(--text-1);
  font: var(--text-small) var(--font);
  pointer-events: auto;
  cursor: pointer;
  max-width: 400px;
  min-width: 260px;
  transform-origin: top right;
}

.toast:hover {
  background: var(--surface-hover);
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.toast-icon svg {
  width: 18px;
  height: 18px;
}

.toast-success .toast-icon { color: var(--brand); }
.toast-error .toast-icon { color: var(--color-error); }
.toast-info .toast-icon { color: var(--text-3); }

.toast-message {
  flex: 1;
  line-height: var(--lh-normal);
}

.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  border-radius: var(--r-sm);
  transition: color var(--speed-quick);
  padding: 0;
}

.toast-close svg { width: 14px; height: 14px; }
.toast:hover .toast-close { color: var(--text-2); }
.toast-close:hover { color: var(--text-1) !important; background: var(--surface-active); }

/* Spring-like enter/leave specific for Toast */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9) !important;
}

.toast-leave-active {
  position: absolute;
  transition: all 0.3s cubic-bezier(0.55, 0.085, 0.68, 0.53);
}
</style>
