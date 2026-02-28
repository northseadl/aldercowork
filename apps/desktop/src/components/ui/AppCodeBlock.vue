<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title?: string
    copyLabel?: string
    copyable?: boolean
  }>(),
  {
    title: undefined,
    copyLabel: 'Copy',
    copyable: false,
  },
)

const emit = defineEmits<{
  (event: 'copy'): void
}>()
</script>

<template>
  <figure class="app-code-block">
    <figcaption v-if="props.title || props.copyable || $slots.header" class="app-code-block__head">
      <slot name="header">
        <span v-if="props.title" class="app-code-block__title">{{ props.title }}</span>
      </slot>

      <slot name="actions">
        <button
          v-if="props.copyable"
          type="button"
          class="app-code-block__copy"
          @click="emit('copy')"
        >
          {{ props.copyLabel }}
        </button>
      </slot>
    </figcaption>

    <pre class="app-code-block__pre"><code><slot /></code></pre>
  </figure>
</template>

<style scoped>
.app-code-block {
  border-radius: var(--r-lg);
  overflow: hidden;
  margin: calc(var(--sp) * 2) 0;
  background: var(--code-bg);
  box-shadow: var(--shadow-card);
}

.app-code-block__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sp);
  padding: 8px 14px;
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  color: var(--text-3);
  background: var(--surface-card);
}

.app-code-block__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-code-block__copy {
  font: var(--text-micro) var(--font);
  color: var(--text-3);
  background: transparent;
  border: 0;
  padding: 3px 8px;
  border-radius: var(--r-sm);
  transition: background var(--speed-quick) var(--ease), color var(--speed-quick) var(--ease);
}

.app-code-block__copy:hover {
  background: var(--surface-hover);
  color: var(--text-2);
}

.app-code-block__pre {
  padding: calc(var(--sp) * 2);
  font: var(--text-mini) / var(--lh-relaxed) var(--font-mono);
  color: var(--text-1);
  overflow-x: auto;
}

.app-code-block :deep(.kw),
.app-code-block :deep(.token-keyword) {
  color: var(--brand);
}

.app-code-block :deep(.str),
.app-code-block :deep(.token-string) {
  color: var(--text-2);
}

.app-code-block :deep(.fn),
.app-code-block :deep(.token-function) {
  color: var(--brand-hover);
}

.app-code-block :deep(.cm),
.app-code-block :deep(.token-comment) {
  color: var(--text-3);
}
</style>
