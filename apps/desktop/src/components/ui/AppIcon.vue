<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number | string
    viewBox?: string
    strokeWidth?: number | string
    title?: string
  }>(),
  {
    size: 16,
    viewBox: '0 0 24 24',
    strokeWidth: 2,
    title: undefined,
  },
)
</script>

<template>
  <svg
    class="app-icon"
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    :viewBox="viewBox"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    role="img"
    :aria-hidden="title ? undefined : true"
    :aria-label="title"
  >
    <title v-if="title">{{ title }}</title>
    <slot />
  </svg>
</template>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}
</style>
