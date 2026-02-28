<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../i18n'
import type { ChatRole } from './types'

const { t } = useI18n()

const props = defineProps<{
  role: ChatRole
  letter?: string
}>()

const displayLetter = computed(() => {
  if (props.role !== 'user') {
    return ''
  }

  const fallbackLetter = 'Y'
  const initial = props.letter?.trim().charAt(0)

  return (initial || fallbackLetter).toUpperCase()
})
</script>

<template>
  <div class="avatar" :class="props.role">
    <template v-if="props.role === 'user'">
      {{ displayLetter }}
    </template>

    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      :aria-label="t('chat.authorAssistant')"
      role="img"
    >
      <rect x="0" y="0" width="19.5" height="19.5" rx="4.5" fill="currentColor" opacity=".45" />
      <rect x="4.5" y="4.5" width="19.5" height="19.5" rx="4.5" fill="currentColor" opacity=".75" />
    </svg>
  </div>
</template>

<style scoped>
.avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--r-md);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: var(--fw-semibold);
  margin-top: 2px;
}

.avatar.user {
  background: var(--surface-active);
  color: var(--text-2);
}

.avatar.ai {
  background: var(--brand-subtle);
  color: var(--brand);
}

.avatar.ai svg {
  width: 14px;
  height: 14px;
}
</style>
