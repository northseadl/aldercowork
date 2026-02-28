<script setup lang="ts">
type ButtonVariant = 'brand' | 'ghost' | 'subtle'

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    block?: boolean
  }>(),
  {
    variant: 'ghost',
    block: false,
  },
)
</script>

<template>
  <button
    type="button"
    class="app-button"
    :class="[`variant-${props.variant}`, { 'is-block': props.block }]"
    v-bind="$attrs"
  >
    <span v-if="$slots.icon" class="app-button__icon" aria-hidden="true">
      <slot name="icon" />
    </span>
    <span class="app-button__label">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.app-button {
  min-height: 30px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--sp) * 0.75);
  padding: 0 calc(var(--sp) * 1.5);
  font-size: var(--text-mini);
  font-weight: var(--fw-medium);
  line-height: 1;
  letter-spacing: var(--ls-normal);
  transition:
    background var(--speed-quick) var(--ease),
    color var(--speed-quick) var(--ease),
    border-color var(--speed-quick) var(--ease),
    opacity var(--speed-quick) var(--ease),
    transform var(--speed-quick) var(--ease);
}

.app-button:focus-visible {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
  outline: none;
}

.app-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-button.is-block {
  width: 100%;
}

.app-button__icon {
  display: inline-flex;
  align-items: center;
}

.app-button__icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.variant-brand {
  background: var(--brand);
  color: var(--content);
}

.variant-brand:hover:not(:disabled) {
  background: var(--brand-hover);
}

.variant-brand:active:not(:disabled) {
  transform: scale(0.97);
}

.variant-ghost {
  background: transparent;
  color: var(--text-3);
}

.variant-ghost:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-1);
}

.variant-subtle {
  background: var(--surface-active);
  color: var(--text-2);
}

.variant-subtle:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-1);
}
</style>
