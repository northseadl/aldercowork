<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const pickerRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const activeLabel = computed(() => workspaceStore.activeLabel)
const activePath = computed(() => workspaceStore.activePath)
const recentWorkspaces = computed(() => workspaceStore.recentWorkspaces)

function toggle() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function selectWorkspace(id: string) {
  workspaceStore.switchWorkspace(id)
  close()
}

function handleWorkspaceKeydown(event: KeyboardEvent, workspaceId: string) {
  if (event.currentTarget !== event.target) {
    return
  }

  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }

  event.preventDefault()
  selectWorkspace(workspaceId)
}

async function openFolder() {
  await workspaceStore.openProjectFolder()
  close()
}

function removeWorkspace(id: string) {
  workspaceStore.removeWorkspace(id)
}

function onDocumentClick(e: MouseEvent) {
  if (pickerRef.value && !pickerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <div ref="pickerRef" class="ws-picker">
    <button type="button" class="ws-trigger" :title="activePath ?? ''" @click="toggle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <span class="ws-name">{{ activeLabel }}</span>
      <svg class="ws-chevron" :class="{ open: isOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <Transition name="dropdown">
      <div v-if="isOpen" class="ws-dropdown">
        <div class="ws-section-label">{{ t('workspace.recent') }}</div>

        <div
          v-for="ws in recentWorkspaces"
          :key="ws.id"
          role="button"
          tabindex="0"
          class="ws-option"
          :class="{ active: ws.id === workspaceStore.activeWorkspace?.id }"
          @click="selectWorkspace(ws.id)"
          @keydown="handleWorkspaceKeydown($event, ws.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <div class="ws-option-text">
            <span class="ws-option-label">{{ ws.label }}</span>
            <span class="ws-option-path">{{ ws.path }}</span>
          </div>
          <button
            v-if="ws.id !== 'default'"
            type="button"
            class="ws-option-remove"
            :title="t('workspace.remove')"
            @click.stop="removeWorkspace(ws.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="ws-divider" />

        <button type="button" class="ws-option ws-open" @click="openFolder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <span class="ws-option-label">{{ t('workspace.openFolder') }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ws-picker {
  position: relative;
}

.ws-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: var(--fw-medium) var(--text-mini) / 1 var(--font);
  padding: 6px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background var(--speed-quick), color var(--speed-quick);
  max-width: 200px;
}

.ws-trigger:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.ws-trigger > svg:first-child {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-3);
}

.ws-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-chevron {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--text-4);
  transition: transform var(--speed-quick);
}

.ws-chevron.open {
  transform: rotate(180deg);
}

/* Dropdown */
.ws-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  max-width: 360px;
  background: var(--content);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  padding: 6px;
  z-index: 100;
}

.ws-section-label {
  font: var(--fw-medium) var(--text-micro) / 1 var(--font);
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 10px 4px;
}

.ws-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: var(--fw-normal) var(--text-mini) / 1.3 var(--font);
  padding: 8px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  text-align: left;
  transition: background var(--speed-quick), color var(--speed-quick);
}

.ws-option:hover {
  background: var(--surface-hover);
  color: var(--text-1);
}

.ws-option.active {
  background: var(--brand-subtle);
  color: var(--text-1);
}

.ws-option:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.ws-option > svg:first-child {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-3);
}

.ws-option.active > svg:first-child {
  color: var(--brand);
}

.ws-option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ws-option-label {
  font-weight: var(--fw-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-option-path {
  font-size: 10px;
  color: var(--text-4);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-option-remove {
  width: 20px;
  height: 20px;
  border: 0;
  background: transparent;
  color: var(--text-4);
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--speed-quick), color var(--speed-quick);
}

.ws-option:hover .ws-option-remove {
  opacity: 1;
}

.ws-option:focus-within .ws-option-remove {
  opacity: 1;
}

.ws-option-remove svg {
  width: 12px;
  height: 12px;
}

.ws-option-remove:hover {
  color: var(--color-error);
}

.ws-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 6px;
}

.ws-open > svg:first-child {
  color: var(--brand);
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity var(--speed-quick), transform var(--speed-quick);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
