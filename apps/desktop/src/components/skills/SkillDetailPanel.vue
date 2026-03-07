<script setup lang="ts">
import { computed } from 'vue'

import { useI18n } from '../../i18n'
import { AppButton } from '../ui'
import PermissionBadge from './PermissionBadge.vue'
import SkillAuditBadge from './SkillAuditBadge.vue'
import { normalizePermissions, type SkillActivationScope, type SkillDetailSelection } from './types'

const props = defineProps<{
  selection: SkillDetailSelection | null
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

const { t } = useI18n()

const skill = computed(() => props.selection?.skill ?? null)
const kind = computed(() => props.selection?.kind ?? null)

const summaryText = computed(() => {
  if (!skill.value) return ''
  const preview = 'preview' in skill.value ? skill.value.preview : ''
  return preview || skill.value.summary || ''
})

const permissions = computed(() => (skill.value ? normalizePermissions(skill.value) : []))
const triggers = computed(() => skill.value?.triggers?.keywords ?? [])

const marketRisk = computed<'info' | 'low' | 'medium' | 'high' | 'critical'>(() => {
  if (kind.value !== 'marketplace' || !props.selection) return 'low'
  const s = props.selection.skill
  if ('permissions' in s) {
    if (s.permissions.shell === 'full') return 'high'
    if (s.permissions.shell === 'restricted' || (s.permissions.fs ?? []).includes('write')) return 'medium'
    if ((s.permissions.network ?? []).length) return 'info'
  }
  return 'low'
})

const auditBadge = computed(() => {
  if (!props.selection) return null
  if (props.selection.kind === 'staged') return props.selection.skill.audit ?? null
  if (props.selection.kind === 'installed') return props.selection.skill.audit ?? null
  return null
})

const showUpdate = computed(
  () => props.selection?.kind === 'installed' && props.selection.skill.update?.available,
)

const installedActivation = computed(() => {
  if (props.selection?.kind !== 'installed') return null
  return props.selection.skill.activation
})

const stagedAudit = computed(() => {
  if (props.selection?.kind !== 'staged') return null
  return props.selection.skill.audit ?? null
})

const stagedInstallAllowed = computed(() => stagedAudit.value?.installAllowed ?? false)
</script>

<template>
  <!-- Empty state: no selection -->
  <div v-if="!selection" class="detail-empty">
    <svg class="detail-empty__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
    <p>{{ t('skills.selectPrompt') }}</p>
  </div>

  <!-- Detail content -->
  <article v-else class="detail" :aria-label="t('skills.detailLabel')">
    <header class="detail__header">
      <div class="detail__title-block">
        <p class="detail__eyebrow">{{
          kind === 'staged' ? t('skills.staging.awaiting')
          : kind === 'marketplace' ? t('skills.tabs.explore')
          : t('skills.tabs.installed')
        }}</p>
        <h2 class="detail__title">{{ skill!.displayName }}</h2>
        <p class="detail__version">{{ skill!.publisher }} · v{{ skill!.version }}</p>
      </div>
      <SkillAuditBadge v-if="kind === 'marketplace'" :severity="marketRisk" />
      <SkillAuditBadge v-else-if="auditBadge" :severity="auditBadge.severity" :status="auditBadge.status" />
    </header>

    <!-- Activation toggles -->
    <section v-if="kind === 'installed' && installedActivation" class="detail__activation">
      <button
        class="scope-toggle"
        :class="{ 'is-active': installedActivation.global }"
        :disabled="actionBusy"
        @click="installedActivation.global ? emit('deactivate', 'global') : emit('activate', 'global')"
      >
        {{ t('skills.activation.global') }}
      </button>
      <button
        class="scope-toggle"
        :class="{ 'is-active': installedActivation.workspace }"
        :disabled="actionBusy"
        @click="installedActivation.workspace ? emit('deactivate', 'workspace') : emit('activate', 'workspace')"
      >
        {{ t('skills.activation.workspace') }}
      </button>
    </section>

    <!-- Summary -->
    <section v-if="summaryText" class="detail__section">
      <h3 class="detail__section-title">{{ t('skills.detail.sectionDescription') }}</h3>
      <p class="detail__text">{{ summaryText }}</p>
    </section>

    <!-- Permissions -->
    <section v-if="permissions.length" class="detail__section">
      <h3 class="detail__section-title">{{ t('skills.detail.sectionPermissions') }}</h3>
      <div class="detail__tokens">
        <PermissionBadge v-for="perm in permissions" :key="perm.key" :type="perm.type" :value="perm.value" />
      </div>
    </section>

    <!-- Triggers -->
    <section v-if="triggers.length" class="detail__section">
      <h3 class="detail__section-title">{{ t('skills.detail.sectionTriggers') }}</h3>
      <div class="detail__tokens">
        <span v-for="kw in triggers" :key="kw" class="detail__trigger">{{ kw }}</span>
      </div>
    </section>

    <!-- Release notes -->
    <section v-if="'releaseNotes' in selection.skill && selection.skill.releaseNotes" class="detail__section">
      <h3 class="detail__section-title">{{ t('skills.detail.sectionReleaseNotes') }}</h3>
      <p class="detail__text">{{ selection.skill.releaseNotes }}</p>
    </section>

    <!-- Audit summary -->
    <section v-if="auditBadge" class="detail__section">
      <h3 class="detail__section-title">{{ t('skills.detail.sectionAudit') }}</h3>
      <p class="detail__text">{{ auditBadge.summary }}</p>
    </section>

    <!-- Actions -->
    <footer class="detail__actions">
      <AppButton v-if="kind === 'marketplace'" variant="brand" :disabled="actionBusy" @click="emit('stageMarketplace')">
        {{ t('skills.import.action') }}
      </AppButton>

      <AppButton v-if="showUpdate" variant="brand" :disabled="actionBusy" @click="emit('updateMarketplace')">
        {{ t('common.update') }}
      </AppButton>

      <AppButton v-if="kind === 'staged'" variant="brand" :disabled="auditBusy" @click="emit('runAudit')">
        {{ stagedAudit ? t('common.retry') : t('skills.detail.sectionAuditRun') }}
      </AppButton>

      <AppButton
        v-if="kind === 'staged'"
        variant="subtle"
        :disabled="installBusy || !stagedInstallAllowed"
        @click="emit('installStaged')"
      >
        {{ t('common.install') }}
      </AppButton>

      <AppButton v-if="kind === 'staged'" variant="ghost" :disabled="actionBusy" @click="emit('dismissStaged')">
        {{ t('skills.staging.dismiss') }}
      </AppButton>

      <AppButton v-if="kind !== 'marketplace' && auditBadge" variant="subtle" @click="emit('viewReport')">
        {{ t('skills.detail.inspectAction') }}
      </AppButton>

      <AppButton v-if="kind === 'installed'" variant="ghost" :disabled="actionBusy" @click="emit('remove')">
        {{ t('skills.detail.removeAction') }}
      </AppButton>
    </footer>
  </article>
</template>

<style scoped>
.detail-empty {
  display: grid;
  place-items: center;
  gap: calc(var(--sp) * 1.5);
  height: 100%;
  min-height: 100%;
  color: var(--text-3);
  font-size: var(--text-small);
  border: 1px dashed var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
}

.detail-empty__icon {
  width: 40px;
  height: 40px;
  opacity: 0.2;
}

.detail {
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
  padding: calc(var(--sp) * 2.5);
  display: grid;
  gap: calc(var(--sp) * 1.5);
  align-content: start;
  overflow-y: auto;
}

.detail__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: calc(var(--sp) * 1.5);
}

.detail__title-block {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.detail__eyebrow {
  margin: 0;
  color: var(--text-3);
  text-transform: uppercase;
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  letter-spacing: 0.04em;
}

.detail__title {
  margin: 0;
  font: var(--fw-semibold) 1.1rem / var(--lh-tight) var(--font-mono);
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail__version {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
}

.detail__activation {
  display: flex;
  gap: calc(var(--sp) * 0.75);
}

.scope-toggle {
  flex: 1;
  min-height: 36px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  transition: all var(--speed-quick) var(--ease);
}

.scope-toggle:hover {
  border-color: var(--text-3);
  color: var(--text-1);
}

.scope-toggle.is-active {
  border-color: var(--brand);
  background: var(--brand-subtle);
  color: var(--brand);
}

.detail__section {
  display: grid;
  gap: calc(var(--sp) * 0.5);
  padding-top: calc(var(--sp) * 1.25);
  border-top: 1px solid var(--border);
}

.detail__section-title {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.detail__text {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.detail__tokens {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 0.5);
}

.detail__trigger {
  border-radius: var(--r-full);
  padding: 3px 10px;
  background: var(--surface-active);
  color: var(--text-2);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
}

.detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 0.75);
  padding-top: calc(var(--sp) * 1.25);
  border-top: 1px solid var(--border);
}
</style>
