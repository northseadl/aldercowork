<script setup lang="ts">
import { computed, ref } from 'vue'

import type { SkillManifest } from '@aldercowork/skill-schema'

import { useDialogA11y } from '../../composables/useDialogA11y'
import { useI18n } from '../../i18n'
import { AppButton } from '../ui'
import PermissionBadge from './PermissionBadge.vue'

import type { NormalizedSkillPermission } from './types'

interface Props {
  skill: SkillManifest
  toolsToCall: string[]
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
const { t } = useI18n()
const dialogRef = ref<HTMLElement | null>(null)

const permissions = computed<NormalizedSkillPermission[]>(() => {
  const normalized: NormalizedSkillPermission[] = []

  for (const fsPermission of props.skill.permissions.fs ?? []) {
    normalized.push({
      key: `fs-${fsPermission}`,
      type: 'fs',
      value: fsPermission,
    })
  }

  if (props.skill.permissions.shell) {
    normalized.push({
      key: `shell-${props.skill.permissions.shell}`,
      type: 'shell',
      value: props.skill.permissions.shell,
    })
  }

  for (const networkPermission of props.skill.permissions.network ?? []) {
    normalized.push({
      key: `network-${networkPermission}`,
      type: 'network',
      value: networkPermission,
    })
  }

  return normalized
})

const riskMeta = computed(() => {
  const hasShellFull = props.skill.permissions.shell === 'full'
  const hasShellRestricted = props.skill.permissions.shell === 'restricted'
  const hasFsWrite = (props.skill.permissions.fs ?? []).includes('write')
  const hasNetwork = (props.skill.permissions.network ?? []).length > 0

  if (hasShellFull) {
    return {
      label: t('skills.overlay.risk.high'),
      className: 'risk-high',
      hint: t('skills.overlay.risk.highHint'),
    }
  }

  if (hasFsWrite || hasShellRestricted) {
    return {
      label: t('skills.overlay.risk.medium'),
      className: 'risk-medium',
      hint: t('skills.overlay.risk.mediumHint'),
    }
  }

  if (hasNetwork) {
    return {
      label: t('skills.overlay.risk.info'),
      className: 'risk-info',
      hint: t('skills.overlay.risk.infoHint'),
    }
  }

  return {
    label: t('skills.overlay.risk.low'),
    className: 'risk-low',
    hint: t('skills.overlay.risk.lowHint'),
  }
})

const isOpen = computed(() => props.visible)

useDialogA11y({
  open: isOpen,
  containerRef: dialogRef,
  onEscape: () => emit('cancel'),
})
</script>

<template>
  <Transition name="inspect-overlay">
    <div v-if="visible" class="inspect-overlay" role="presentation" @click.self="emit('cancel')">
      <section
        ref="dialogRef"
        class="inspect-overlay__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-inspect-title"
        aria-describedby="skill-inspect-subtitle"
        tabindex="-1"
      >
        <header class="inspect-overlay__header">
          <h2 id="skill-inspect-title" class="inspect-overlay__title">{{ t('skills.overlay.title') }}</h2>
          <p id="skill-inspect-subtitle" class="inspect-overlay__subtitle">{{ skill.id }} · v{{ skill.version }}</p>
        </header>

        <section class="inspect-overlay__section">
          <h3 class="inspect-overlay__section-title">{{ t('skills.overlay.toolsToCall') }}</h3>
          <ul class="inspect-overlay__tool-list">
            <li v-for="tool in toolsToCall" :key="tool" class="inspect-overlay__tool-item">
              {{ tool }}
            </li>
            <li v-if="!toolsToCall.length" class="inspect-overlay__tool-item is-muted">{{ t('skills.overlay.noToolCalls') }}</li>
          </ul>
        </section>

        <section class="inspect-overlay__section">
          <h3 class="inspect-overlay__section-title">{{ t('skills.overlay.sectionPermissions') }}</h3>
          <div v-if="permissions.length" class="inspect-overlay__permission-list">
            <PermissionBadge
              v-for="permission in permissions"
              :key="permission.key"
              :type="permission.type"
              :value="permission.value"
            />
          </div>
          <p v-else class="inspect-overlay__muted">{{ t('skills.overlay.emptyPermissions') }}</p>
        </section>

        <section class="inspect-overlay__section">
          <h3 class="inspect-overlay__section-title">{{ t('skills.overlay.sectionRisk') }}</h3>
          <p class="inspect-overlay__risk-line">
            <span class="inspect-overlay__risk-pill" :class="riskMeta.className">{{ riskMeta.label }}</span>
            <span class="inspect-overlay__risk-hint">{{ riskMeta.hint }}</span>
          </p>
        </section>

        <footer class="inspect-overlay__actions">
          <AppButton variant="ghost" @click="emit('cancel')">{{ t('skills.overlay.cancel') }}</AppButton>
          <AppButton variant="brand" @click="emit('confirm')">{{ t('skills.overlay.confirm') }}</AppButton>
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
  width: min(100%, 440px);
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background: var(--content-warm);
  box-shadow: var(--shadow-card);
  padding: calc(var(--sp) * 2.5);
  display: grid;
  gap: calc(var(--sp) * 2);
}

.inspect-overlay__header {
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.inspect-overlay__title {
  margin: 0;
  color: var(--text-1);
  font: var(--fw-semibold) var(--text-large) / var(--lh-tight) var(--font-mono);
}

.inspect-overlay__subtitle {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-mini);
}

.inspect-overlay__section {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.inspect-overlay__section-title {
  margin: 0;
  color: var(--text-2);
  font: var(--fw-semibold) var(--text-mini) / 1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.inspect-overlay__tool-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.inspect-overlay__tool-item {
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface-active);
  color: var(--text-1);
  font: var(--fw-medium) var(--text-mini) / 1.4 var(--font-mono);
  padding: calc(var(--sp) * 0.75) calc(var(--sp) * 1);
}

.inspect-overlay__tool-item.is-muted {
  color: var(--text-3);
}

.inspect-overlay__permission-list {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 1);
}

.inspect-overlay__muted {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
}

.inspect-overlay__risk-line {
  margin: 0;
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.inspect-overlay__risk-pill {
  width: fit-content;
  border-radius: var(--r-full);
  padding: 4px 10px;
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.inspect-overlay__risk-hint {
  color: var(--text-2);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.risk-high {
  background: color-mix(in srgb, var(--syntax-string) 24%, transparent);
  color: color-mix(in srgb, var(--syntax-string) 65%, var(--text-1));
}

.risk-medium {
  background: color-mix(in srgb, var(--syntax-string) 14%, var(--brand-subtle));
  color: color-mix(in srgb, var(--syntax-string) 45%, var(--text-1));
}

.risk-info {
  background: color-mix(in srgb, var(--syntax-function) 16%, transparent);
  color: var(--syntax-function);
}

.risk-low {
  background: color-mix(in srgb, var(--brand) 16%, transparent);
  color: var(--brand);
}

.inspect-overlay__actions {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--sp) * 1);
}

.inspect-overlay-enter-active,
.inspect-overlay-leave-active {
  transition: opacity var(--speed-regular) var(--ease);
}

.inspect-overlay-enter-active .inspect-overlay__card,
.inspect-overlay-leave-active .inspect-overlay__card {
  transition: transform var(--speed-regular) var(--ease), opacity var(--speed-regular) var(--ease);
}

.inspect-overlay-enter-from,
.inspect-overlay-leave-to {
  opacity: 0;
}

.inspect-overlay-enter-from .inspect-overlay__card,
.inspect-overlay-leave-to .inspect-overlay__card {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
</style>
