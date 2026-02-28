<script setup lang="ts">
import { computed } from 'vue'

import type { SkillManifest } from '@aldercowork/skill-schema'

import { useI18n } from '../../i18n'
import { useMarkdown } from '../../composables/useMarkdown'
import { AppButton } from '../ui'
import PermissionBadge from './PermissionBadge.vue'

import type { NormalizedSkillPermission, SkillActivation, SkillActivationScope, SkillPanelSkill } from './types'

type SkillDetailModel = SkillManifest & Partial<Pick<SkillPanelSkill, 'name' | 'description' | 'preview' | 'activation'>>

const props = defineProps<{
  skill: SkillDetailModel
  activating?: boolean
}>()

const emit = defineEmits<{
  inspect: []
  remove: []
  activate: [scope: SkillActivationScope]
  deactivate: [scope: SkillActivationScope]
}>()
const { t } = useI18n()
const { render: renderMarkdown } = useMarkdown()

const displayName = computed(() => {
  return props.skill.name?.trim() || props.skill.id
})

const descriptionPreview = computed(() => {
  if (props.skill.preview?.trim()) return props.skill.preview
  if (props.skill.description?.trim()) return props.skill.description
  return t('skills.detail.noPreview')
})

const renderedPreview = computed(() => renderMarkdown(descriptionPreview.value))

const activation = computed<SkillActivation>(() => {
  return props.skill.activation ?? { global: false, workspace: false }
})

const permissions = computed<NormalizedSkillPermission[]>(() => {
  const p = props.skill.permissions
  if (!p) return []

  const result: NormalizedSkillPermission[] = []
  if (p.fs) {
    Object.entries(p.fs).forEach(([key, value]) => {
      result.push({ key, type: 'fs', value: value ?? 'default' })
    })
  }
  if (p.network) {
    Object.entries(p.network).forEach(([key, value]) => {
      result.push({ key, type: 'network', value: value ?? 'default' })
    })
  }
  if (p.shell) {
    Object.entries(p.shell).forEach(([key, value]) => {
      result.push({ key, type: 'shell', value: value ?? 'default' })
    })
  }
  return result
})

const triggerTags = computed(() => props.skill.triggers?.keywords ?? [])

function toggleScope(scope: SkillActivationScope) {
  const isActive = scope === 'global' ? activation.value.global : activation.value.workspace
  if (isActive) {
    emit('deactivate', scope)
  } else {
    emit('activate', scope)
  }
}
</script>

<template>
  <article class="skill-detail">
    <header class="skill-detail__header">
      <span class="skill-detail__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      </span>

      <div class="skill-detail__title-group">
        <h2 class="skill-detail__title">{{ displayName }}</h2>
        <span class="skill-detail__version">{{ skill.publisher }} · v{{ skill.version }}</span>
      </div>
    </header>

    <!-- Activation scope toggles -->
    <section class="skill-detail__activation">
      <button
        class="scope-toggle"
        :class="{ 'is-active': activation.global }"
        :disabled="activating"
        @click="toggleScope('global')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {{ t('skills.activation.global') }}
      </button>

      <button
        class="scope-toggle scope-toggle--workspace"
        :class="{ 'is-active': activation.workspace }"
        :disabled="activating"
        @click="toggleScope('workspace')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        {{ t('skills.activation.workspace') }}
      </button>
    </section>

    <section class="skill-detail__section skill-detail__description-section">
      <h3 class="skill-detail__section-title">{{ t('skills.detail.sectionDescription') }}</h3>
      <div class="skill-detail__description markdown-body" v-html="renderedPreview" />
    </section>

    <section v-if="permissions.length" class="skill-detail__section">
      <h3 class="skill-detail__section-title">{{ t('skills.detail.sectionPermissions') }}</h3>
      <div class="skill-detail__permissions">
        <PermissionBadge
          v-for="perm in permissions"
          :key="perm.key"
          :name="perm.key"
          :type="perm.type"
          :value="perm.value"
        />
      </div>
    </section>

    <section v-if="triggerTags.length" class="skill-detail__section">
      <h3 class="skill-detail__section-title">{{ t('skills.detail.sectionTriggers') }}</h3>
      <div class="skill-detail__trigger-cloud">
        <span v-for="tag in triggerTags" :key="tag" class="skill-detail__trigger-tag">{{ tag }}</span>
      </div>
    </section>

    <footer class="skill-detail__actions">
      <AppButton variant="subtle" @click="emit('inspect')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        {{ t('skills.detail.inspectAction') }}
      </AppButton>
      <AppButton variant="ghost" @click="emit('remove')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        {{ t('skills.detail.removeAction') }}
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
  display: flex;
  flex-direction: column;
  gap: calc(var(--sp) * 2);
}

.skill-detail__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: calc(var(--sp) * 1.5);
  align-items: center;
}

.skill-detail__icon {
  width: 46px;
  height: 46px;
  border-radius: var(--r-lg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

.skill-detail__title-group {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.skill-detail__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font-mono);
  color: var(--text-1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.skill-detail__version {
  color: var(--text-3);
  font-size: var(--text-small);
}

/* Activation scope toggles */
.skill-detail__activation {
  display: flex;
  gap: calc(var(--sp) * 1);
}

.scope-toggle {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: calc(var(--sp) * 1) calc(var(--sp) * 1.5);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  transition:
    background var(--speed-regular) var(--ease),
    border-color var(--speed-regular) var(--ease),
    color var(--speed-regular) var(--ease);
}

.scope-toggle:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--text-3);
  color: var(--text-1);
}

.scope-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scope-toggle.is-active {
  background: color-mix(in srgb, var(--syntax-function) 12%, transparent);
  border-color: var(--syntax-function);
  color: var(--syntax-function);
}

.scope-toggle--workspace.is-active {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  border-color: var(--brand);
  color: var(--brand);
}

.skill-detail__section {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.skill-detail__description-section {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.skill-detail__section-title {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  letter-spacing: .04em;
  text-transform: uppercase;
}

.skill-detail__description {
  margin: 0;
  color: var(--text-1);
  line-height: var(--lh-normal);
  font-size: var(--text-small);
  word-break: break-word;
  overflow-y: auto;
}

.skill-detail__description :deep(h1),
.skill-detail__description :deep(h2),
.skill-detail__description :deep(h3) {
  margin-top: 0.5em;
  margin-bottom: 0.25em;
  font-size: 1em;
  font-weight: var(--fw-semibold);
}

.skill-detail__description :deep(p) {
  margin: 0.25em 0;
}

.skill-detail__description :deep(ul),
.skill-detail__description :deep(ol) {
  padding-left: 1.25em;
  margin: 0.25em 0;
}

.skill-detail__description :deep(code) {
  font-size: 0.9em;
  padding: 1px 4px;
  border-radius: var(--r-sm);
  background: var(--surface-active);
}

.skill-detail__permissions {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 1);
}

.skill-detail__trigger-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 1);
}

.skill-detail__trigger-tag {
  border-radius: var(--r-full);
  border: 1px solid var(--border);
  background: var(--surface-active);
  color: var(--text-2);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  padding: 4px 9px;
}

.skill-detail__actions {
  margin-top: auto;
  padding-top: calc(var(--sp) * 1.5);
  border-top: 1px solid var(--border);
  display: flex;
  gap: calc(var(--sp) * 1);
}

.skill-detail__actions :deep(button) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
