<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'

import { useI18n } from '../i18n'
import {
  SkillDetailPanel,
  SkillImportDialog,
  SkillInspectOverlay,
  SkillList,
  SkillStagingBanner,
  type SkillDetailSelection,
} from '../components/skills'
import { useConfirm, useToast } from '../composables'
import { useInstalledSkillStore } from '../stores/installedSkill'
import { useMarketplaceSkillStore } from '../stores/marketplaceSkill'
import { useSkillAuditStore } from '../stores/skillAudit'

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()

const installedStore = useInstalledSkillStore()
const marketplaceStore = useMarketplaceSkillStore()
const auditStore = useSkillAuditStore()

const { skills, loading: installedLoading, updating, loadError: installedError } = storeToRefs(installedStore)
const { items: marketplaceItems, loading: marketplaceLoading, loadError: marketplaceError } = storeToRefs(marketplaceStore)
const { stagedSkill, activeReport, reportVisible, staging, auditing, installing, error: auditError } = storeToRefs(auditStore)

/* ── State ── */
type Mode = 'installed' | 'explore'
const mode = ref<Mode>('installed')
const selectedId = ref('')
const selectedKind = ref<'installed' | 'marketplace' | 'staged'>('installed')
const importDialogVisible = ref(false)
const filterText = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | null = null

/* ── Computed ── */
const selectedInstalled = computed(() => skills.value.find((s) => s.id === selectedId.value) ?? null)

const selectedMarketplaceDetail = computed(() => {
  if (selectedKind.value !== 'marketplace') return null
  const cacheKey = `${selectedId.value}:latest`
  return marketplaceStore.details[cacheKey] ?? null
})

const detailSelection = computed<SkillDetailSelection | null>(() => {
  if (stagedSkill.value && selectedKind.value === 'staged') {
    return { kind: 'staged', skill: stagedSkill.value }
  }
  if (selectedKind.value === 'marketplace' && selectedMarketplaceDetail.value) {
    return { kind: 'marketplace', skill: selectedMarketplaceDetail.value }
  }
  if (selectedInstalled.value) return { kind: 'installed', skill: selectedInstalled.value }
  return null
})

const listItems = computed(() => {
  const source = mode.value === 'installed' ? skills.value : marketplaceItems.value
  if (!filterText.value.trim()) return source
  const q = filterText.value.toLowerCase()
  return source.filter((s) => s.displayName.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
})

const listKind = computed(() => (mode.value === 'installed' ? 'installed' : 'marketplace') as 'installed' | 'marketplace')
const listLoading = computed(() => mode.value === 'installed' ? installedLoading.value : marketplaceLoading.value)
const listError = computed(() => mode.value === 'installed' ? installedError.value : marketplaceError.value)

/* ── Actions ── */
function selectSkill(id: string) {
  selectedId.value = id
  selectedKind.value = listKind.value
  if (mode.value === 'explore') {
    void marketplaceStore.loadSkillDetail(id)
  }
}

function clearSearch() {
  filterText.value = ''
}

async function refreshAll() {
  await installedStore.loadAll()
  if (mode.value === 'explore') void marketplaceStore.searchSkills('')
}

async function autoInstallStaged(stagedId: string, successKey: string, name: string) {
  const installed = await auditStore.approveInstall(stagedId)
  installedStore.upsertInstalledSkill(installed)
  await installedStore.loadAll()
  selectedId.value = installed.id
  selectedKind.value = 'installed'
  mode.value = 'installed'
  toast.info(t(successKey).replace('{name}', name))
}

async function handleArchiveImport() {
  const staged = await auditStore.stageArchive()
  importDialogVisible.value = false
  if (!staged) return
  await autoInstallStaged(staged.stagedId, 'skills.import.successArchive', staged.displayName)
}

async function handleGitImport(url: string) {
  const staged = await auditStore.stageGit(url)
  importDialogVisible.value = false
  await autoInstallStaged(staged.stagedId, 'skills.import.successGit', staged.displayName)
}

async function handleStageMarketplace() {
  if (!selectedMarketplaceDetail.value) return
  const staged = await marketplaceStore.downloadSkill(selectedId.value)
  await auditStore.setMarketplaceStage(staged)
  await autoInstallStaged(staged.stagedId, 'skills.import.successArchive', staged.displayName)
}

async function handleInstallStaged() {
  const staged = auditStore.stagedSkill
  if (!staged) return
  await autoInstallStaged(staged.stagedId, 'skills.import.successArchive', staged.displayName)
}

async function handleActivate(scope: 'global' | 'workspace') {
  if (!selectedInstalled.value) return
  await installedStore.activateSkill(selectedInstalled.value.id, scope)
}

async function handleDeactivate(scope: 'global' | 'workspace') {
  if (!selectedInstalled.value) return
  await installedStore.deactivateSkill(selectedInstalled.value.id, scope)
}

async function handleRemove() {
  if (!selectedInstalled.value) return
  const decision = await confirm({
    title: t('skills.removeConfirmTitle'),
    message: `${t('skills.removeConfirmTitle')}: ${selectedInstalled.value.displayName}`,
    confirmLabel: t('skills.detail.removeAction'),
    variant: 'danger',
  })
  if (decision !== 'confirm') return
  await installedStore.removeSkill(selectedInstalled.value.id)
  selectedId.value = skills.value[0]?.id ?? ''
}

async function handleViewReport() {
  if (stagedSkill.value && selectedKind.value === 'staged') {
    const report = stagedSkill.value.audit ?? await auditStore.loadStagedReport(stagedSkill.value.stagedId)
    auditStore.openReport(report)
    return
  }
  if (selectedInstalled.value) {
    const report = await auditStore.loadInstalledReport(selectedInstalled.value.id, selectedInstalled.value.version)
    auditStore.openReport(report)
  }
}

function handleStagingReview() {
  if (stagedSkill.value) {
    selectedId.value = stagedSkill.value.id
    selectedKind.value = 'staged'
  }
}

/* ── Lifecycle ── */
onMounted(refreshAll)

watch(filterText, (next) => {
  if (mode.value === 'explore') {
    if (searchDebounce) clearTimeout(searchDebounce)
    searchDebounce = setTimeout(() => { void marketplaceStore.searchSkills(next) }, 220)
  }
})

watch(mode, () => {
  filterText.value = ''
  selectedId.value = ''
  if (mode.value === 'installed' && skills.value.length) {
    selectedId.value = skills.value[0].id
    selectedKind.value = 'installed'
  }
  if (mode.value === 'explore') {
    void marketplaceStore.searchSkills('')
    if (marketplaceItems.value.length) {
      selectedId.value = marketplaceItems.value[0].id
      selectedKind.value = 'marketplace'
      void marketplaceStore.loadSkillDetail(selectedId.value)
    }
  }
})

watchEffect(() => {
  if (!selectedId.value) {
    if (mode.value === 'installed' && skills.value.length) {
      selectedId.value = skills.value[0].id
      selectedKind.value = 'installed'
    }
    if (mode.value === 'explore' && marketplaceItems.value.length) {
      selectedId.value = marketplaceItems.value[0].id
      selectedKind.value = 'marketplace'
    }
  }
})
</script>

<template>
  <section class="skills-view">
    <!-- Header -->
    <header class="skills-view__toolbar">
      <div>
        <h1 class="skills-view__title">{{ t('skills.panelTitle') }}</h1>
        <p class="skills-view__subtitle">{{ t('skills.panelSubtitle') }}</p>
      </div>

      <div class="skills-view__toolbar-actions">
        <!-- Mode tabs -->
        <nav class="skills-view__tabs">
          <button
            type="button"
            class="skills-view__tab"
            :class="{ 'is-active': mode === 'installed' }"
            @click="mode = 'installed'"
          >
            {{ t('skills.tabs.installed') }}
            <span v-if="skills.length" class="skills-view__tab-count">{{ skills.length }}</span>
          </button>
          <button
            type="button"
            class="skills-view__tab"
            :class="{ 'is-active': mode === 'explore' }"
            @click="mode = 'explore'"
          >
            {{ t('skills.tabs.explore') }}
          </button>
        </nav>

        <button
          type="button"
          class="skills-view__import-btn"
          @click="importDialogVisible = true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="skills-view__btn-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {{ t('skills.import.action') }}
        </button>

        <button
          type="button"
          class="skills-view__import-btn skills-view__import-btn--icon"
          :aria-label="t('common.refresh')"
          @click="refreshAll"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="skills-view__btn-icon">
            <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Staging banner — conditional -->
    <SkillStagingBanner
      v-if="stagedSkill"
      :staged="stagedSkill"
      class="skills-view__staging"
      @review="handleStagingReview"
      @dismiss="auditStore.dismissStage()"
    />

    <!-- Master-Detail layout -->
    <div class="skills-view__layout">
      <!-- List pane -->
      <aside class="skills-view__list-pane" :aria-label="t('skills.listLabel')">
        <!-- Search -->
        <div class="skills-view__list-header">
          <div class="skills-view__search-wrapper">
            <svg class="skills-view__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              v-model="filterText"
              type="search"
              class="skills-view__search-input"
              :placeholder="t('skills.searchPlaceholder')"
            />
            <button
              v-if="filterText.trim()"
              type="button"
              class="skills-view__search-clear"
              :aria-label="t('common.clear')"
              @click="clearSearch"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <p class="skills-view__result-count">{{ listItems.length }} {{ mode === 'installed' ? t('skills.tabs.installed') : t('skills.tabs.explore') }}</p>
        </div>

        <SkillList
          :items="listItems"
          :kind="listKind"
          :selected-id="selectedId"
          :loading="listLoading"
          :error="listError"
          :filter-text="filterText"
          :show-filter="false"
          @select="selectSkill"
          @retry="refreshAll"
          @update:filter-text="filterText = $event"
        />
      </aside>

      <!-- Detail pane -->
      <section class="skills-view__detail-pane" :aria-label="t('skills.detailLabel')">
        <SkillDetailPanel
          :selection="detailSelection"
          :action-busy="staging || updating"
          :audit-busy="auditing"
          :install-busy="installing"
          @activate="handleActivate"
          @deactivate="handleDeactivate"
          @remove="handleRemove"
          @stage-marketplace="handleStageMarketplace"
          @update-marketplace="handleStageMarketplace"
          @run-audit="auditStore.runAudit()"
          @install-staged="handleInstallStaged"
          @dismiss-staged="auditStore.dismissStage()"
          @view-report="handleViewReport"
        />
      </section>
    </div>

    <!-- Dialogs -->
    <SkillImportDialog
      :visible="importDialogVisible"
      :busy="staging"
      :error="auditError"
      @cancel="importDialogVisible = false"
      @import-archive="handleArchiveImport"
      @import-git="handleGitImport"
    />

    <SkillInspectOverlay
      :visible="reportVisible"
      :report="activeReport"
      @close="auditStore.closeReport()"
    />
  </section>
</template>

<style scoped>
/* ═══ Page Shell ═══ */
.skills-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--content);
}

/* ═══ Toolbar ═══ */
.skills-view__toolbar {
  padding: calc(var(--sp) * 2) calc(var(--sp) * 2) calc(var(--sp) * 1.5);
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
  align-items: center;
  gap: calc(var(--sp) * 1);
}

/* Tabs */
.skills-view__tabs { display: flex; gap: 2px; }
.skills-view__tab {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border: 0;
  border-radius: var(--r-md);
  background: transparent; color: var(--text-3);
  font: var(--fw-medium) var(--text-small) / 1 var(--font);
  cursor: pointer; transition: all var(--speed-quick);
}
.skills-view__tab:hover { color: var(--text-1); background: var(--surface-hover); }
.skills-view__tab.is-active { color: var(--text-1); background: var(--surface-active); }
.skills-view__tab-count {
  font-size: 10px; color: var(--text-3);
  font-family: var(--font-mono);
  background: var(--surface-active);
  padding: 2px 6px; border-radius: var(--r-full);
}
.skills-view__tab.is-active .skills-view__tab-count {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

/* Import button — brand outline */
.skills-view__import-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 calc(var(--sp) * 1.25);
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand-subtle);
  color: var(--brand);
  font: var(--fw-semibold) var(--text-small) / 1 var(--font-mono);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--speed-regular) var(--ease), color var(--speed-regular) var(--ease);
}

.skills-view__import-btn:hover {
  background: var(--brand);
  color: var(--on-brand, #fff);
}

.skills-view__import-btn--icon {
  padding: 0;
  width: 32px;
  justify-content: center;
}

.skills-view__btn-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* ═══ Staging banner ═══ */
.skills-view__staging {
  margin: 0 calc(var(--sp) * 1.5);
}

/* ═══ Master-Detail Layout ═══ */
.skills-view__layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: calc(var(--sp) * 1);
  padding: 0 calc(var(--sp) * 1.5) calc(var(--sp) * 1.5);
}

.skills-view__list-pane {
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--content-warm);
  padding: calc(var(--sp) * 1.5);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: calc(var(--sp) * 1);
}

.skills-view__list-header {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.skills-view__search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.skills-view__search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.skills-view__search-input {
  width: 100%;
  height: 34px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--content);
  color: var(--text-1);
  font-size: var(--text-small);
  padding: 0 calc(var(--sp) * 3) 0 calc(var(--sp) * 3.5);
  outline: none;
  transition: border-color var(--speed-regular) var(--ease), box-shadow var(--speed-regular) var(--ease);
}

.skills-view__search-input::placeholder { color: var(--text-3); }

.skills-view__search-input:focus-visible {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-subtle);
}

.skills-view__search-clear {
  position: absolute;
  right: 6px;
  width: 22px;
  height: 22px;
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

.skills-view__result-count {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-mini) / 1 var(--font-mono);
  padding-left: 2px;
}

.skills-view__detail-pane {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

/* ═══ Responsive ═══ */
@media (max-width: 1024px) {
  .skills-view__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .skills-view__toolbar-actions {
    flex-wrap: wrap;
  }

  .skills-view__layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(200px, 1fr) minmax(300px, 1fr);
  }
}
</style>
