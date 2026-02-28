<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../../i18n'

import type { TokenInfo } from '../../../stores/session'

const props = defineProps<{
  tokens?: TokenInfo
  cost?: number
}>()

const { t } = useI18n()

function fmtTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function fmtCost(n: number): string {
  if (n < 0.001) return `<$0.001`
  return `$${n.toFixed(4)}`
}

const totalInput = computed(() => props.tokens ? props.tokens.input : 0)
const totalOutput = computed(() => props.tokens ? props.tokens.output : 0)
const cacheRead = computed(() => props.tokens?.cache.read ?? 0)
const hasReasoning = computed(() => (props.tokens?.reasoning ?? 0) > 0)
const hasData = computed(() => totalInput.value > 0 || totalOutput.value > 0)
</script>

<template>
  <div v-if="hasData" class="token-stats">
    <span class="ts-item" :title="t('chat.tokens.input')">
      <svg class="ts-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ fmtTokenCount(totalInput) }}
    </span>
    <span class="ts-item" :title="t('chat.tokens.output')">
      <svg class="ts-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M12 5v14M5 12l7 7 7-7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ fmtTokenCount(totalOutput) }}
    </span>
    <span v-if="cacheRead > 0" class="ts-item ts-cache" :title="t('chat.tokens.cache')">
      <svg class="ts-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
      {{ fmtTokenCount(cacheRead) }}
    </span>
    <span v-if="hasReasoning" class="ts-item ts-reasoning" :title="t('chat.tokens.reasoning')">
      <svg class="ts-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
        <line x1="9" y1="21" x2="15" y2="21" />
        <line x1="10" y1="24" x2="14" y2="24" />
      </svg>
      {{ fmtTokenCount(tokens!.reasoning) }}
    </span>
    <span v-if="cost !== undefined && cost > 0" class="ts-item ts-cost">
      {{ fmtCost(cost) }}
    </span>
  </div>
</template>

<style scoped>
.token-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  margin-top: calc(var(--sp) * 1.5);
}

.ts-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-3);
}

.ts-icon {
  flex-shrink: 0;
  opacity: 0.6;
}

.ts-cache {
  color: color-mix(in srgb, var(--brand) 80%, var(--text-3));
}

.ts-reasoning {
  color: color-mix(in srgb, #a78bfa 80%, var(--text-3));
}

.ts-cost {
  font-weight: var(--fw-semibold);
  color: var(--text-2);
}
</style>
