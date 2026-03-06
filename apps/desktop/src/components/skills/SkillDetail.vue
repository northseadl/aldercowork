<script setup lang="ts">
import { computed } from 'vue'

import { useMarkdown } from '../../composables/useMarkdown'
import { AppButton } from '../ui'
import PermissionBadge from './PermissionBadge.vue'
import SkillAuditBadge from './SkillAuditBadge.vue'
import { normalizePermissions, type SkillActivationScope, type SkillDetailSelection } from './types'

const props = defineProps<{
  selection: SkillDetailSelection
  actionBusy?: boolean
  auditBusy?: boolean
  installBusy?: boolean
}>()

const emit = defineEmits<{
  activate: [scope: SkillActivationScope]
  deactivate: [scope: SkillActivationScope]
  remove: []
  stageMarketplace: []
  updateMarketplace: []
  runAudit: []
  installStaged: []
  dismissStaged: []
  viewReport: []
}>()

const { render } = useMarkdown()

const runtime = computed(() => props.selection.skill)
const renderedPreview = computed(() =>
  render(('preview' in runtime.value ? runtime.value.preview : '') || runtime.value.summary || ''),
)
const permissions = computed(() => normalizePermissions(runtime.value))
const triggers = computed(() => runtime.value.triggers?.keywords ?? [])
const marketRisk = computed<'info' | 'low' | 'medium' | 'high' | 'critical'>(() => {
  if (props.selection.kind !== 'marketplace') return 'low'
  if (props.selection.skill.permissions.shell === 'full') return 'high'
  if (
    props.selection.skill.permissions.shell === 'restricted'
    || (props.selection.skill.permissions.fs ?? []).includes('write')
  ) {
    return 'medium'
  }
  if ((props.selection.skill.permissions.network ?? []).length) return 'info'
  return 'low'
})
const auditBadge = computed(() => {
  if (props.selection.kind === 'staged') return props.selection.skill.audit ?? null
  if (props.selection.kind === 'installed') return props.selection.skill.audit ?? null
  return null
})
const showUpdateAction = computed(
  () => props.selection.kind === 'installed' && props.selection.skill.update?.available,
)
</script>

<template>
  <article class="skill-detail">
    <header class="skill-detail__header">
      <div class="skill-detail__title-block">
        <p class="skill-detail__eyebrow">{{ selection.kind }}</p>
        <h2 class="skill-detail__title">{{ selection.skill.displayName }}</h2>
        <p class="skill-detail__version">
          {{ selection.skill.publisher }} · v{{ selection.skill.version }}
        </p>
      </div>

      <div class="skill-detail__badges">
        <SkillAuditBadge
          v-if="selection.kind === 'marketplace'"
          :severity="marketRisk"
        />
        <SkillAuditBadge
          v-else-if="auditBadge"
          :severity="auditBadge.severity"
          :status="auditBadge.status"
        />
      </div>
    </header>

    <section v-if="selection.kind === 'installed'" class="skill-detail__activation">
      <button
        class="scope-toggle"
        :class="{ 'is-active': selection.skill.activation.global }"
        :disabled="actionBusy"
        @click="selection.skill.activation.global ? emit('deactivate', 'global') : emit('activate', 'global')"
      >
        Global
      </button>
      <button
        class="scope-toggle"
        :class="{ 'is-active': selection.skill.activation.workspace }"
        :disabled="actionBusy"
        @click="selection.skill.activation.workspace ? emit('deactivate', 'workspace') : emit('activate', 'workspace')"
      >
        Workspace
      </button>
    </section>

    <section class="skill-detail__section">
      <h3 class="skill-detail__section-title">Summary</h3>
      <div class="skill-detail__summary markdown-body" v-html="renderedPreview" />
    </section>

    <section v-if="permissions.length" class="skill-detail__section">
      <h3 class="skill-detail__section-title">Permissions</h3>
      <div class="skill-detail__token-list">
        <PermissionBadge
          v-for="permission in permissions"
          :key="permission.key"
          :type="permission.type"
          :value="permission.value"
        />
      </div>
    </section>

    <section v-if="triggers.length" class="skill-detail__section">
      <h3 class="skill-detail__section-title">Triggers</h3>
      <div class="skill-detail__token-list">
        <span v-for="trigger in triggers" :key="trigger" class="skill-detail__trigger">{{ trigger }}</span>
      </div>
    </section>

    <section v-if="'releaseNotes' in selection.skill && selection.skill.releaseNotes" class="skill-detail__section">
      <h3 class="skill-detail__section-title">Release Notes</h3>
      <p class="skill-detail__plain">{{ selection.skill.releaseNotes }}</p>
    </section>

    <section v-if="auditBadge" class="skill-detail__section">
      <h3 class="skill-detail__section-title">Audit</h3>
      <p class="skill-detail__plain">{{ auditBadge.summary }}</p>
    </section>

    <footer class="skill-detail__actions">
      <AppButton
        v-if="selection.kind === 'marketplace'"
        variant="brand"
        :disabled="actionBusy"
        @click="emit('stageMarketplace')"
      >
        Install via Audit
      </AppButton>

      <AppButton
        v-if="showUpdateAction"
        variant="brand"
        :disabled="actionBusy"
        @click="emit('updateMarketplace')"
      >
        Stage Update
      </AppButton>

      <AppButton
        v-if="selection.kind === 'staged'"
        variant="brand"
        :disabled="auditBusy"
        @click="emit('runAudit')"
      >
        {{ selection.skill.audit ? 'Re-run Audit' : 'Run Audit' }}
      </AppButton>

      <AppButton
        v-if="selection.kind === 'staged'"
        variant="subtle"
        :disabled="installBusy || !selection.skill.audit?.installAllowed"
        @click="emit('installStaged')"
      >
        Install
      </AppButton>

      <AppButton
        v-if="selection.kind === 'staged'"
        variant="ghost"
        :disabled="actionBusy"
        @click="emit('dismissStaged')"
      >
        Dismiss
      </AppButton>

      <AppButton
        v-if="selection.kind !== 'marketplace' && auditBadge"
        variant="subtle"
        @click="emit('viewReport')"
      >
        View Report
      </AppButton>

      <AppButton
        v-if="selection.kind === 'installed'"
        variant="ghost"
        :disabled="actionBusy"
        @click="emit('remove')"
      >
        Remove
      </AppButton>
    </footer>
  </article>
</template>

<style scoped>
.skill-detail {
  height: 100%;
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
  padding: calc(var(--sp) * 2.5);
  display: grid;
  gap: calc(var(--sp) * 1.5);
  align-content: start;
}

.skill-detail__header {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--sp) * 2);
}

.skill-detail__title-block {
  display: grid;
  gap: 4px;
}

.skill-detail__eyebrow {
  margin: 0;
  color: var(--text-3);
  text-transform: uppercase;
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  letter-spacing: .04em;
}

.skill-detail__title {
  margin: 0;
  font: var(--fw-semibold) 1.3rem / var(--lh-tight) var(--font-mono);
  color: var(--text-1);
}

.skill-detail__version {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
}

.skill-detail__activation {
  display: flex;
  gap: calc(var(--sp) * 1);
}

.scope-toggle {
  flex: 1;
  min-height: 38px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
}

.scope-toggle.is-active {
  border-color: var(--brand);
  background: var(--brand-subtle);
  color: var(--brand);
}

.skill-detail__section {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.skill-detail__section-title {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  letter-spacing: .04em;
  text-transform: uppercase;
}

.skill-detail__summary {
  font-size: var(--text-small);
  color: var(--text-1);
  line-height: var(--lh-normal);
  max-height: 240px;
  overflow: auto;
}

.skill-detail__summary :deep(p) {
  margin: 0.4em 0;
}

.skill-detail__summary :deep(ul) {
  padding-left: 1.25em;
}

.skill-detail__token-list {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 0.75);
}

.skill-detail__trigger {
  border-radius: var(--r-full);
  padding: 4px 10px;
  background: var(--surface-active);
  color: var(--text-2);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
}

.skill-detail__plain {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.skill-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 0.75);
}
</style>
