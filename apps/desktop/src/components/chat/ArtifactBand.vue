<script setup lang="ts">
import FileOutcomeCard from './parts/FileOutcomeCard.vue'

import { useI18n } from '../../i18n'

import type { TurnArtifactSummary } from './types'

const props = defineProps<{
  summary: TurnArtifactSummary
}>()

const { t } = useI18n()
</script>

<template>
  <section v-if="props.summary.files.length > 0" class="artifact-band" :aria-label="t('chat.artifacts.bandTitle')">
    <header class="artifact-band__head">
      <span class="artifact-band__title">{{ t('chat.artifacts.bandTitle') }}</span>
      <span class="artifact-band__count">
        {{ t('chat.artifacts.filesCount').replace('{count}', String(props.summary.files.length)) }}
      </span>
    </header>

    <div class="artifact-band__list">
      <FileOutcomeCard
        v-for="file in props.summary.files"
        :key="`${props.summary.turnId}:${file.path}`"
        :file="file"
        context="turn"
      />
    </div>
  </section>
</template>

<style scoped>
.artifact-band {
  margin-top: calc(var(--sp) * 2);
  padding-top: calc(var(--sp) * 1.5);
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}

.artifact-band__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: calc(var(--sp) * 1.25);
}

.artifact-band__title,
.artifact-band__count {
  font-size: var(--text-micro);
  color: var(--text-3);
}

.artifact-band__title {
  font-weight: var(--fw-semibold);
  letter-spacing: .04em;
  text-transform: uppercase;
}

.artifact-band__count {
  font-family: var(--font-mono);
}

.artifact-band__list {
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp) * 1);
}
</style>
