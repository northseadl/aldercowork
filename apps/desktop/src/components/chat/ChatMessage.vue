<script setup lang="ts">
import ChatAvatar from './ChatAvatar.vue'

import type { ChatRole } from './types'

const props = defineProps<{
  role: ChatRole
  author: string
  timestamp: string
  avatar?: string
  modelLabel?: string
}>()
</script>

<template>
  <article class="entry" :class="role">
    <ChatAvatar :role="props.role" :letter="props.avatar" />

    <div class="entry-content">
      <header class="entry-head">
        <span class="entry-role" :class="{ ai: props.role === 'ai' }">{{ props.author }}</span>
        <span v-if="props.modelLabel" class="entry-model">{{ props.modelLabel }}</span>
        <span class="entry-ts">{{ props.timestamp }}</span>
      </header>

      <div class="entry-body">
        <slot />
      </div>
    </div>
  </article>
</template>

<style scoped>
.entry {
  padding: calc(var(--sp) * 3) 0;
  display: flex;
  gap: calc(var(--sp) * 1.5);
}

/* AI messages get a subtle card-like treatment for clear role separation */
.entry.ai {
  background: var(--surface-card);
  border-radius: var(--r-lg);
  padding: calc(var(--sp) * 2.5) calc(var(--sp) * 2);
  margin: calc(var(--sp) * 0.5) calc(var(--sp) * -2);
}

.entry-content {
  flex: 1;
  min-width: 0;
}

.entry-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.entry-role {
  font-size: var(--text-mini);
  font-weight: var(--fw-semibold);
  color: var(--text-1);
}

.entry-role.ai {
  color: var(--brand);
}

.entry-model {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-3);
  padding: 1px 6px;
  border-radius: var(--r-sm);
  background: var(--surface-active);
  white-space: nowrap;
}

.entry-ts {
  font-size: 10px;
  color: var(--text-3);
  font-family: var(--font-mono);
}

.entry-body {
  font-size: var(--text-regular);
  line-height: var(--lh-relaxed);
  letter-spacing: var(--ls-normal);
  color: var(--text-1);
}

.entry-body :deep(p) {
  margin-bottom: calc(var(--sp) * 1.5);
}

.entry-body :deep(p:last-child) {
  margin-bottom: 0;
}

.entry-body :deep(strong) {
  font-weight: var(--fw-semibold);
}

.entry-body :deep(code) {
  font: var(--text-micro) var(--font-mono);
  background: var(--surface-active);
  padding: 2px 6px;
  border-radius: var(--r-sm);
}

.entry-body :deep(ol),
.entry-body :deep(ul) {
  padding-left: 20px;
  margin-bottom: calc(var(--sp) * 1.5);
}

.entry-body :deep(li) {
  margin-bottom: 4px;
  line-height: var(--lh-relaxed);
}
</style>
