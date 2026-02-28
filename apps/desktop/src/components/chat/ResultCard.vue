<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string
    subtitle: string
    success?: boolean
  }>(),
  {
    success: true,
  },
)
</script>

<template>
  <article class="result-card" :class="{ 'is-failed': !props.success }">
    <span class="rc-icon" aria-hidden="true">
      <svg
        v-if="props.success"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--brand)"
        stroke-width="2"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>

      <svg
        v-else
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    </span>

    <div class="rc-text">
      <div class="rc-title">{{ props.title }}</div>
      <div class="rc-sub">{{ props.subtitle }}</div>
    </div>
  </article>
</template>

<style scoped>
.result-card {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 1.5);
  padding: 12px 16px;
  border-radius: var(--r-lg);
  background: var(--brand-subtle);
  margin-top: calc(var(--sp) * 2);
}

.rc-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.rc-text {
  flex: 1;
}

.rc-title {
  font-size: var(--text-mini);
  font-weight: var(--fw-semibold);
  color: var(--brand);
}

.rc-sub {
  font-size: var(--text-micro);
  color: var(--text-2);
  margin-top: 2px;
}

.result-card.is-failed {
  background: var(--surface-active);
}

.result-card.is-failed .rc-icon,
.result-card.is-failed .rc-title {
  color: var(--text-2);
}
</style>
