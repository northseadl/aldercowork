<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { SkillDetail, SkillImportDialog, SkillInspectOverlay, SkillListItem } from '../components/skills'
import type { SkillActivationScope } from '../components/skills'
import { useI18n } from '../i18n'
import { useToast } from '../composables'
import { useSkillStore } from '../stores/skill'

const { t } = useI18n()
const toast = useToast()
const skillStore = useSkillStore()

const {
  filteredSkills,
  inspectVisible,
  searchKeyword,
  selectedSkill,
  selectedSkillId,
  toolsToCall,
  scanning,
  importing,
  importError,
  loaded,
  loadError,
  skills,
  activating,
} = storeToRefs(skillStore)

const importDialogVisible = ref(false)

const selectSkill = (id: string) => {
  skillStore.selectSkill(id)
}

const openInspect = () => {
  skillStore.openInspect()
}

const closeInspect = () => {
  skillStore.closeInspect()
}

const confirmInspect = () => {
  skillStore.confirmInspect()
}

const openImportDialog = () => {
  importDialogVisible.value = true
}

const closeImportDialog = () => {
  importDialogVisible.value = false
}

const handleImportArchive = async () => {
  try {
    const name = await skillStore.importArchive()
    if (name) {
      toast.info(t('skills.import.successArchive').replace('{name}', name))
      importDialogVisible.value = false
    }
  } catch {
    // Error is shown in dialog via importError
  }
}

const handleImportGit = async (url: string) => {
  try {
    const name = await skillStore.importGit(url)
    toast.info(t('skills.import.successGit').replace('{name}', name))
    importDialogVisible.value = false
  } catch {
    // Error is shown in dialog via importError
  }
}

const handleRemoveSkill = async (skillId: string) => {
  const confirmed = window.confirm(
    t('skills.removeConfirm').replace('{name}', skillId),
  )
  if (!confirmed) return

  try {
    await skillStore.removeSkill(skillId)
    toast.info(t('skills.import.removed').replace('{name}', skillId))
  } catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function handleActivateSkill(scope: SkillActivationScope) {
  if (!selectedSkill.value) return
  try {
    await skillStore.activateSkill(selectedSkill.value.id, scope)
    toast.info(t('skills.activation.activated'))
  } catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function handleDeactivateSkill(scope: SkillActivationScope) {
  if (!selectedSkill.value) return
  try {
    await skillStore.deactivateSkill(selectedSkill.value.id, scope)
    toast.info(t('skills.activation.deactivated'))
  } catch (error: unknown) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

function clearSearch() {
  searchKeyword.value = ''
}

/** True when user has typed a search query but no results match */
const isSearchEmpty = ref(false)

/** True when there are genuinely no skills installed */
const isNoSkillsInstalled = ref(false)

// Computed via watchers to avoid reactivity issues with storeToRefs
import { watchEffect } from 'vue'

watchEffect(() => {
  const hasKeyword = searchKeyword.value.trim().length > 0
  isSearchEmpty.value = loaded.value && !scanning.value && hasKeyword && filteredSkills.value.length === 0
  isNoSkillsInstalled.value = loaded.value && !scanning.value && !hasKeyword && skills.value.length === 0
})

onMounted(() => {
  if (!loaded.value) {
    skillStore.loadSkills()
  }
})
</script>

<template>
  <section class="skills-view">
    <header class="skills-view__toolbar">
      <div>
        <h1 class="skills-view__title">{{ t('skills.panelTitle') }}</h1>
        <p class="skills-view__subtitle">{{ t('skills.panelSubtitle') }}</p>
      </div>

      <div class="skills-view__toolbar-actions">
        <button
          type="button"
          class="skills-view__import-btn"
          :title="t('skills.import.title')"
          @click="openImportDialog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="skills-view__import-icon">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          {{ t('skills.import.action') }}
        </button>

        <label class="skills-view__search" for="skills-search">
          <span class="skills-view__search-label">{{ t('skills.searchLabel') }}</span>
          <div class="skills-view__search-wrapper">
            <input
              id="skills-search"
              v-model="searchKeyword"
              type="search"
              class="skills-view__search-input"
              :placeholder="t('skills.searchPlaceholder')"
            />
            <button
              v-if="searchKeyword.trim()"
              type="button"
              class="skills-view__search-clear"
              :aria-label="t('common.clear')"
              @click="clearSearch"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </label>
      </div>
    </header>

    <div class="skills-view__layout">
      <aside class="skills-view__list-pane" :aria-label="t('skills.listLabel')">
        <p class="skills-view__result-count">
          <span v-if="scanning" class="skills-view__scanning">{{ t('skills.scanning') }}</span>
          <span v-else>{{ t('skills.resultCount').replace('{count}', String(filteredSkills.length)) }}</span>
        </p>

        <p v-if="loadError" class="skills-view__load-error" role="alert">{{ loadError }}</p>

        <div v-if="filteredSkills.length" class="skills-view__list">
          <SkillListItem
            v-for="skill in filteredSkills"
            :key="skill.id"
            :skill="skill"
            :selected="skill.id === selectedSkillId"
            @select="selectSkill"
          />
        </div>

        <!-- Empty: search returned no results -->
        <div v-else-if="isSearchEmpty" class="skills-view__empty-list">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p>{{ t('skills.searchNoResults') }}</p>
          <button type="button" class="skills-view__empty-action-btn" @click="clearSearch">
            {{ t('skills.clearSearch') }}
          </button>
        </div>

        <!-- Empty: no skills installed at all -->
        <div v-else-if="isNoSkillsInstalled" class="skills-view__empty-list">
          <p>{{ t('skills.noSkillsInstalled') }}</p>
          <button type="button" class="skills-view__empty-action-btn" @click="openImportDialog">
            {{ t('skills.import.action') }}
          </button>
        </div>
      </aside>

      <section class="skills-view__detail-pane" :aria-label="t('skills.detailLabel')">
        <SkillDetail
          v-if="selectedSkill"
          :skill="selectedSkill"
          :activating="activating"
          @inspect="openInspect"
          @activate="handleActivateSkill"
          @deactivate="handleDeactivateSkill"
          @remove="handleRemoveSkill(selectedSkill.id)"
        />

        <div v-else class="skills-view__detail-empty">
          <p>{{ t('skills.selectPrompt') }}</p>
        </div>
      </section>
    </div>

    <SkillInspectOverlay
      v-if="selectedSkill"
      :skill="selectedSkill"
      :tools-to-call="toolsToCall"
      :visible="inspectVisible"
      @cancel="closeInspect"
      @confirm="confirmInspect"
    />

    <SkillImportDialog
      :visible="importDialogVisible"
      :importing="importing"
      :import-error="importError"
      @cancel="closeImportDialog"
      @import-archive="handleImportArchive"
      @import-git="handleImportGit"
    />
  </section>
</template>

<style scoped>
.skills-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--content);
}

.skills-view__toolbar {
  padding: calc(var(--sp) * 2.5) calc(var(--sp) * 3);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: calc(var(--sp) * 2);
}

.skills-view__title {
  margin: 0;
  font: var(--fw-semibold) 1.125rem / var(--lh-tight) var(--font-mono);
  color: var(--text-1);
}

.skills-view__subtitle {
  margin: calc(var(--sp) * 0.5) 0 0;
  color: var(--text-3);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.skills-view__toolbar-actions {
  display: flex;
  align-items: flex-end;
  gap: calc(var(--sp) * 1.5);
}

.skills-view__import-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 calc(var(--sp) * 1.5);
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand-subtle);
  color: var(--brand);
  font: var(--fw-semibold) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--speed-regular) var(--ease),
    color var(--speed-regular) var(--ease);
}

.skills-view__import-btn:hover {
  background: var(--brand);
  color: var(--text-on-brand, #fff);
}

.skills-view__import-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.skills-view__search {
  display: grid;
  gap: calc(var(--sp) * 0.75);
  min-width: min(320px, 100%);
}

.skills-view__search-label {
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.skills-view__search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.skills-view__search-input {
  width: 100%;
  height: 36px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--content-warm);
  color: var(--text-1);
  font-size: var(--text-small);
  padding: 0 calc(var(--sp) * 3) 0 calc(var(--sp) * 1.25);
  outline: none;
  transition:
    border-color var(--speed-regular) var(--ease),
    box-shadow var(--speed-regular) var(--ease),
    background var(--speed-regular) var(--ease);
}

.skills-view__search-input::placeholder {
  color: var(--text-3);
}

.skills-view__search-input:focus-visible {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.skills-view__search-clear {
  position: absolute;
  right: 6px;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--speed-quick), background var(--speed-quick);
}

.skills-view__search-clear:hover {
  color: var(--text-1);
  background: var(--surface-hover);
}

.skills-view__layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 380px) minmax(0, 1fr);
}

.skills-view__list-pane {
  min-height: 0;
  border-right: 1px solid var(--border);
  padding: calc(var(--sp) * 2);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: calc(var(--sp) * 1.5);
}

.skills-view__result-count {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-mini) / 1 var(--font-mono);
}

.skills-view__scanning {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.skills-view__scanning::before {
  content: '';
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--brand);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.skills-view__list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: calc(var(--sp) * 1);
  padding-right: calc(var(--sp) * 0.5);
}

.skills-view__empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--sp) * 1.5);
  text-align: center;
  color: var(--text-3);
  font-size: var(--text-small);
  padding: calc(var(--sp) * 4) 0;
}

.skills-view__empty-action-btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--brand);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  transition:
    border-color var(--speed-regular) var(--ease),
    background var(--speed-regular) var(--ease);
}

.skills-view__empty-action-btn:hover {
  border-color: var(--brand);
  background: var(--brand-subtle);
}

.skills-view__load-error {
  margin: 0;
  padding: calc(var(--sp) * 1);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--syntax-string) 12%, transparent);
  color: color-mix(in srgb, var(--syntax-string) 70%, var(--text-1));
  font-size: var(--text-small);
}

.skills-view__detail-pane {
  min-height: 0;
  padding: calc(var(--sp) * 2);
}

.skills-view__detail-empty {
  height: 100%;
  border: 1px dashed var(--border);
  border-radius: var(--r-xl);
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: var(--text-small);
  background: var(--content-warm);
}

@media (max-width: 1024px) {
  .skills-view__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .skills-view__toolbar-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .skills-view__search {
    min-width: 0;
  }

  .skills-view__layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, 1fr) minmax(320px, 1fr);
  }

  .skills-view__list-pane {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
}
</style>
