<script setup lang="ts">
import { computed, ref } from 'vue'

import type { SkillAuditReport } from '@aldercowork/skill-schema'

import { useDialogA11y } from '../../composables/useDialogA11y'
import { useI18n } from '../../i18n'
import { AppButton } from '../ui'
import SkillAuditBadge from './SkillAuditBadge.vue'

const props = defineProps<{
  visible: boolean
  report: SkillAuditReport | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)

useDialogA11y({
  open: computed(() => props.visible),
  containerRef: dialogRef,
  onEscape: () => emit('close'),
})
</script>

<template>
  <Transition name="inspect-overlay">
    <div v-if="visible && report" class="inspect-overlay" role="presentation" @click.self="emit('close')">
      <section
        ref="dialogRef"
        class="inspect-overlay__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-report-title"
        tabindex="-1"
      >
        <header class="inspect-overlay__header">
          <div>
            <p class="inspect-overlay__eyebrow">{{ t('skills.inspect.reportTitle') }}</p>
            <h2 id="audit-report-title" class="inspect-overlay__title">{{ report.skillId }} · v{{ report.version }}</h2>
          </div>
          <SkillAuditBadge :severity="report.severity" :status="report.status" />
        </header>

        <section class="inspect-overlay__section">
          <h3 class="inspect-overlay__section-title">{{ t('skills.inspect.sectionSummary') }}</h3>
          <p class="inspect-overlay__copy">{{ report.summary }}</p>
        </section>

        <section v-if="report.recommendedActions.length" class="inspect-overlay__section">
          <h3 class="inspect-overlay__section-title">{{ t('skills.inspect.sectionRecommended') }}</h3>
          <ul class="inspect-overlay__list">
            <li v-for="action in report.recommendedActions" :key="action">{{ action }}</li>
          </ul>
        </section>

        <section v-if="report.findings.length" class="inspect-overlay__section">
          <h3 class="inspect-overlay__section-title">{{ t('skills.inspect.sectionFindings') }}</h3>
          <div class="inspect-overlay__finding-list">
            <article v-for="finding in report.findings" :key="`${finding.code}-${finding.file ?? 'global'}`" class="inspect-overlay__finding">
              <div class="inspect-overlay__finding-header">
                <SkillAuditBadge :severity="finding.severity" />
                <strong>{{ finding.title }}</strong>
              </div>
              <p class="inspect-overlay__copy">{{ finding.detail }}</p>
              <code v-if="finding.file" class="inspect-overlay__file">{{ finding.file }}</code>
            </article>
          </div>
        </section>

        <section v-if="report.toolCalls.length || report.suspiciousFiles.length" class="inspect-overlay__section">
          <h3 class="inspect-overlay__section-title">{{ t('skills.inspect.sectionSignals') }}</h3>
          <div class="inspect-overlay__signal-grid">
            <div>
              <p class="inspect-overlay__subhead">{{ t('skills.inspect.toolCalls') }}</p>
              <ul class="inspect-overlay__list">
                <li v-for="tool in report.toolCalls" :key="tool">{{ tool }}</li>
                <li v-if="!report.toolCalls.length">{{ t('skills.inspect.noToolCallHints') }}</li>
              </ul>
            </div>
            <div>
              <p class="inspect-overlay__subhead">{{ t('skills.inspect.suspiciousFiles') }}</p>
              <ul class="inspect-overlay__list">
                <li v-for="file in report.suspiciousFiles" :key="file">{{ file }}</li>
                <li v-if="!report.suspiciousFiles.length">{{ t('skills.inspect.noSuspiciousFiles') }}</li>
              </ul>
            </div>
          </div>
        </section>

        <footer class="inspect-overlay__actions">
          <AppButton variant="ghost" @click="emit('close')">{{ t('common.close') }}</AppButton>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.inspect-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: calc(var(--sp) * 2);
  background: color-mix(in srgb, var(--shell) 75%, transparent);
  backdrop-filter: blur(4px);
}

.inspect-overlay__card {
  width: min(100%, 760px);
  max-height: min(88vh, 860px);
  overflow: auto;
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background: var(--content-warm);
  box-shadow: var(--shadow-card);
  padding: calc(var(--sp) * 2.5);
  display: grid;
  gap: calc(var(--sp) * 1.5);
}

.inspect-overlay__header {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--sp) * 1.5);
  align-items: flex-start;
}

.inspect-overlay__eyebrow {
  margin: 0 0 4px;
  color: var(--text-3);
  text-transform: uppercase;
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
}

.inspect-overlay__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font-mono);
}

.inspect-overlay__section {
  display: grid;
  gap: calc(var(--sp) * 0.75);
  padding-top: calc(var(--sp) * 1);
  border-top: 1px solid var(--border);
}

.inspect-overlay__section-title,
.inspect-overlay__subhead {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase;
}

.inspect-overlay__copy {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.inspect-overlay__finding-list {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.inspect-overlay__finding {
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--content);
  padding: calc(var(--sp) * 1.25);
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.inspect-overlay__finding-header {
  display: flex;
  align-items: center;
  gap: calc(var(--sp) * 0.75);
}

.inspect-overlay__signal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--sp) * 1.5);
}

.inspect-overlay__list {
  margin: 0;
  padding-left: 1.25rem;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.inspect-overlay__file {
  width: fit-content;
  border-radius: var(--r-sm);
  padding: 3px 6px;
  background: var(--surface-active);
  color: var(--text-2);
}

.inspect-overlay__actions {
  display: flex;
  justify-content: flex-end;
}

.inspect-overlay-enter-active,
.inspect-overlay-leave-active {
  transition: opacity var(--speed-regular) var(--ease);
}

.inspect-overlay-enter-from,
.inspect-overlay-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .inspect-overlay__signal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
