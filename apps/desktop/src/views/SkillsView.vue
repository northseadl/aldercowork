<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import {
  SkillDetail,
  SkillImportDialog,
  SkillInspectOverlay,
  SkillListItem,
  SkillMarketplaceItem,
  type SkillDetailSelection,
} from '../components/skills'
import type { StagedSkillRecord } from '@aldercowork/skill-schema'
import { useConfirm, useToast } from '../composables'
import { useInstalledSkillStore } from '../stores/installedSkill'
import { useMarketplaceSkillStore } from '../stores/marketplaceSkill'
import { useSkillAuditStore } from '../stores/skillAudit'
import { useWorkspaceStore } from '../stores/workspace'

const toast = useToast()
const { confirm } = useConfirm()

const installedStore = useInstalledSkillStore()
const marketplaceStore = useMarketplaceSkillStore()
const auditStore = useSkillAuditStore()
const workspaceStore = useWorkspaceStore()

const { skills, loading: installedLoading, updating, loadError: installedError } = storeToRefs(installedStore)
const { items: marketplaceItems, loading: marketplaceLoading, loadingDetail, loadError: marketplaceError, query, sourceLabel, details } = storeToRefs(marketplaceStore)
const { stagedSkill, activeReport, reportVisible, staging, auditing, installing, error: auditError } = storeToRefs(auditStore)
const { activePath } = storeToRefs(workspaceStore)

const selectedInstalledId = ref('')
const selectedMarketplaceId = ref('')
const selectedKind = ref<'installed' | 'marketplace' | 'staged'>('installed')
const importDialogVisible = ref(false)
let searchDebounce: ReturnType<typeof setTimeout> | null = null

const selectedInstalled = computed(() => skills.value.find((skill) => skill.id === selectedInstalledId.value) ?? null)
const selectedMarketplaceKey = computed(() => (selectedMarketplaceId.value ? `${selectedMarketplaceId.value}:latest` : ''))
const selectedMarketplaceDetail = computed(() => details.value[selectedMarketplaceKey.value] ?? null)

const detailSelection = computed<SkillDetailSelection | null>(() => {
  if (selectedKind.value === 'staged' && stagedSkill.value) {
    return { kind: 'staged', skill: stagedSkill.value }
  }
  if (selectedKind.value === 'marketplace' && selectedMarketplaceDetail.value) {
    return { kind: 'marketplace', skill: selectedMarketplaceDetail.value }
  }
  if (selectedInstalled.value) {
    return { kind: 'installed', skill: selectedInstalled.value }
  }
  return null
})

async function selectMarketplace(skillId: string) {
  selectedMarketplaceId.value = skillId
  selectedKind.value = 'marketplace'
  await marketplaceStore.loadSkillDetail(skillId)
}

function selectInstalled(skillId: string) {
  selectedInstalledId.value = skillId
  selectedKind.value = 'installed'
}

async function refreshAll() {
  await Promise.all([
    installedStore.loadAll(),
    marketplaceStore.searchSkills(query.value),
  ])
}

async function stageAndAudit(task: Promise<StagedSkillRecord>) {
  const staged = await task
  await auditStore.setMarketplaceStage(staged)
  selectedKind.value = 'staged'
  const report = await auditStore.runAudit(staged.stagedId)
  auditStore.openReport(report)
  toast.info(report.summary)
}

async function handleStageMarketplace() {
  if (!selectedMarketplaceDetail.value) return
  await stageAndAudit(marketplaceStore.downloadSkill(selectedMarketplaceDetail.value.id, selectedMarketplaceDetail.value.version))
}

async function handleStageUpdate() {
  if (!selectedInstalled.value) return
  await stageAndAudit(marketplaceStore.stageUpdate(selectedInstalled.value.id, activePath.value ?? undefined))
}

async function handleArchiveImport() {
  const staged = await auditStore.stageArchive()
  importDialogVisible.value = false
  if (!staged) return
  selectedKind.value = 'staged'
  const report = await auditStore.runAudit(staged.stagedId)
  auditStore.openReport(report)
}

async function handleGitImport(url: string) {
  const staged = await auditStore.stageGit(url)
  importDialogVisible.value = false
  selectedKind.value = 'staged'
  const report = await auditStore.runAudit(staged.stagedId)
  auditStore.openReport(report)
}

async function handleInstallStaged() {
  const installed = await auditStore.approveInstall()
  installedStore.upsertInstalledSkill(installed)
  await installedStore.loadAll()
  selectedInstalledId.value = installed.id
  selectedKind.value = 'installed'
  toast.info(`Installed ${installed.displayName}`)
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
    title: 'Remove Skill',
    message: `Remove ${selectedInstalled.value.displayName}? This cannot be undone.`,
    confirmLabel: 'Remove',
    variant: 'danger',
  })
  if (decision !== 'confirm') return
  await installedStore.removeSkill(selectedInstalled.value.id)
  selectedInstalledId.value = skills.value[0]?.id ?? ''
}

async function handleViewReport() {
  if (selectedKind.value === 'staged' && stagedSkill.value) {
    const report = stagedSkill.value.audit ?? await auditStore.loadStagedReport(stagedSkill.value.stagedId)
    auditStore.openReport(report)
    return
  }

  if (selectedInstalled.value) {
    const report = await auditStore.loadInstalledReport(selectedInstalled.value.id, selectedInstalled.value.version)
    auditStore.openReport(report)
  }
}

onMounted(async () => {
  await refreshAll()
})

watch(query, (nextQuery) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    void marketplaceStore.searchSkills(nextQuery)
  }, 220)
})

watch(
  [skills, marketplaceItems, stagedSkill],
  async () => {
    if (stagedSkill.value) {
      selectedKind.value = 'staged'
      return
    }

    if (!selectedInstalledId.value && skills.value.length) {
      selectedInstalledId.value = skills.value[0].id
    }

    if (!selectedMarketplaceId.value && marketplaceItems.value.length) {
      selectedMarketplaceId.value = marketplaceItems.value[0].id
      await marketplaceStore.loadSkillDetail(selectedMarketplaceId.value)
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="skills-view">
    <header class="skills-view__toolbar">
      <div class="skills-view__headline">
        <h1 class="skills-view__title">Skills Marketplace</h1>
        <p class="skills-view__subtitle">Search, stage, audit, install, update, and activate skills from one surface.</p>
      </div>

      <div class="skills-view__toolbar-actions">
        <span class="skills-view__source-pill">{{ sourceLabel || 'Marketplace' }}</span>
        <button type="button" class="skills-view__import-btn" @click="importDialogVisible = true">Manual Import</button>
        <button type="button" class="skills-view__refresh-btn" @click="refreshAll">Refresh</button>
      </div>
    </header>

    <label class="skills-view__search" for="skills-market-search">
      <span class="skills-view__search-label">Marketplace Search</span>
      <input
        id="skills-market-search"
        v-model="query"
        type="search"
        class="skills-view__search-input"
        placeholder="Search skills, categories, or publishers"
      />
    </label>

    <div class="skills-view__layout">
      <aside class="skills-view__sidebar">
        <section class="skills-view__panel">
          <header class="skills-view__panel-header">
            <h2>Marketplace</h2>
            <span>{{ marketplaceItems.length }}</span>
          </header>
          <p v-if="marketplaceError" class="skills-view__error">{{ marketplaceError }}</p>
          <p v-else-if="marketplaceLoading" class="skills-view__muted">Loading marketplace…</p>
          <div v-else-if="marketplaceItems.length" class="skills-view__list">
            <SkillMarketplaceItem
              v-for="skill in marketplaceItems"
              :key="skill.id"
              :skill="skill"
              :selected="selectedKind === 'marketplace' && skill.id === selectedMarketplaceId"
              @select="selectMarketplace"
            />
          </div>
          <p v-else class="skills-view__muted">No marketplace skills matched this search.</p>
        </section>

        <section class="skills-view__panel">
          <header class="skills-view__panel-header">
            <h2>Installed</h2>
            <span>{{ skills.length }}</span>
          </header>
          <p v-if="installedError" class="skills-view__error">{{ installedError }}</p>
          <p v-else-if="installedLoading" class="skills-view__muted">Loading installed skills…</p>
          <div v-else-if="skills.length" class="skills-view__list">
            <SkillListItem
              v-for="skill in skills"
              :key="skill.id"
              :skill="skill"
              :selected="selectedKind === 'installed' && skill.id === selectedInstalledId"
              @select="selectInstalled"
            />
          </div>
          <p v-else class="skills-view__muted">No skills installed yet.</p>
        </section>

        <section class="skills-view__panel skills-view__panel--stage">
          <header class="skills-view__panel-header">
            <h2>Staging</h2>
            <span>{{ stagedSkill ? '1' : '0' }}</span>
          </header>
          <div v-if="stagedSkill" class="skills-view__stage-card">
            <strong>{{ stagedSkill.displayName }}</strong>
            <p>{{ stagedSkill.summary }}</p>
            <button type="button" class="skills-view__stage-link" @click="selectedKind = 'staged'">Review staged skill</button>
          </div>
          <p v-else class="skills-view__muted">Downloads and manual imports wait here until audit completes.</p>
        </section>
      </aside>

      <section class="skills-view__detail-pane">
        <p v-if="auditError" class="skills-view__error">{{ auditError }}</p>
        <p v-if="loadingDetail" class="skills-view__muted">Loading skill detail…</p>
        <SkillDetail
          v-else-if="detailSelection"
          :selection="detailSelection"
          :action-busy="staging || updating"
          :audit-busy="auditing"
          :install-busy="installing"
          @activate="handleActivate"
          @deactivate="handleDeactivate"
          @remove="handleRemove"
          @stage-marketplace="handleStageMarketplace"
          @update-marketplace="handleStageUpdate"
          @run-audit="auditStore.runAudit()"
          @install-staged="handleInstallStaged"
          @dismiss-staged="auditStore.dismissStage()"
          @view-report="handleViewReport"
        />
        <div v-else class="skills-view__detail-empty">
          <p>Select a marketplace or installed skill to inspect its permissions, source, and audit state.</p>
        </div>
      </section>
    </div>

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
.skills-view {
  display: grid;
  gap: calc(var(--sp) * 1.5);
  min-height: 100%;
}

.skills-view__toolbar {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--sp) * 2);
  flex-wrap: wrap;
}

.skills-view__headline {
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.skills-view__title {
  margin: 0;
  font: var(--fw-semibold) 1.6rem / var(--lh-tight) var(--font-mono);
}

.skills-view__subtitle {
  margin: 0;
  color: var(--text-2);
  max-width: 56ch;
  line-height: var(--lh-normal);
}

.skills-view__toolbar-actions {
  display: flex;
  gap: calc(var(--sp) * 0.75);
  align-items: center;
  flex-wrap: wrap;
}

.skills-view__source-pill,
.skills-view__refresh-btn,
.skills-view__import-btn,
.skills-view__stage-link {
  min-height: 34px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--content);
  color: var(--text-2);
  padding: 0 calc(var(--sp) * 1.25);
  font: var(--fw-medium) var(--text-small) / 1 var(--font-mono);
}

.skills-view__source-pill {
  display: inline-flex;
  align-items: center;
  background: color-mix(in srgb, var(--syntax-function) 10%, transparent);
  color: var(--syntax-function);
}

.skills-view__search {
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.skills-view__search-label {
  color: var(--text-3);
  font: var(--fw-semibold) var(--text-micro) / 1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
}

.skills-view__search-input {
  min-height: 42px;
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--content);
  color: var(--text-1);
  padding: 0 calc(var(--sp) * 1.25);
}

.skills-view__layout {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: calc(var(--sp) * 1.5);
  min-height: 0;
}

.skills-view__sidebar {
  display: grid;
  gap: calc(var(--sp) * 1);
  align-content: start;
}

.skills-view__panel,
.skills-view__detail-pane {
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  background: var(--content);
  padding: calc(var(--sp) * 1.25);
}

.skills-view__panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: calc(var(--sp) * 1);
}

.skills-view__panel-header h2 {
  margin: 0;
  font: var(--fw-semibold) var(--text-small) / 1 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--text-3);
}

.skills-view__list {
  display: grid;
  gap: calc(var(--sp) * 0.75);
}

.skills-view__detail-pane {
  min-height: 520px;
}

.skills-view__detail-empty,
.skills-view__muted {
  margin: 0;
  color: var(--text-3);
  font-size: var(--text-small);
  line-height: var(--lh-normal);
}

.skills-view__error {
  margin: 0;
  border-radius: var(--r-md);
  background: rgba(239, 68, 68, .12);
  color: #b91c1c;
  padding: calc(var(--sp) * 1);
  font-size: var(--text-small);
}

.skills-view__stage-card {
  display: grid;
  gap: calc(var(--sp) * 0.5);
}

.skills-view__stage-card p {
  margin: 0;
  color: var(--text-2);
  font-size: var(--text-small);
}

@media (max-width: 1024px) {
  .skills-view__layout {
    grid-template-columns: 1fr;
  }
}
</style>
