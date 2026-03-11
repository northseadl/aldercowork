import { defineStore } from 'pinia'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'

import type { InstalledSkillRecord, SkillAuditReport, StagedSkillRecord } from '@aldercowork/skill-schema'

import {
  approveStagedSkillInstall,
  auditStagedSkill,
  dismissStagedSkill,
  getAuditReport,
  stageArchiveImport,
  stageGitImport,
} from '../services/skill'
import { useWorkspaceStore } from './workspace'

export const useSkillAuditStore = defineStore('skill-audit', () => {
  const workspaceStore = useWorkspaceStore()
  const { activePath } = storeToRefs(workspaceStore)

  const stagedSkill = ref<StagedSkillRecord | null>(null)
  const activeReport = ref<SkillAuditReport | null>(null)
  const reportVisible = ref(false)
  const staging = ref(false)
  const auditing = ref(false)
  const installing = ref(false)
  const error = ref<string | null>(null)

  function openReport(report?: SkillAuditReport | null) {
    activeReport.value = report ?? activeReport.value
    reportVisible.value = true
  }

  function closeReport() {
    reportVisible.value = false
  }

  async function stageArchive() {
    staging.value = true
    error.value = null
    try {
      const staged = await stageArchiveImport()
      stagedSkill.value = staged
      activeReport.value = null
      return staged
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      staging.value = false
    }
  }

  async function stageGit(url: string) {
    staging.value = true
    error.value = null
    try {
      const staged = await stageGitImport(url)
      stagedSkill.value = staged
      activeReport.value = null
      return staged
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      staging.value = false
    }
  }

  async function setMarketplaceStage(stage: StagedSkillRecord) {
    stagedSkill.value = stage
    activeReport.value = null
  }

  async function runAudit(stagedId = stagedSkill.value?.stagedId) {
    if (!stagedId) throw new Error('No staged skill to audit')
    auditing.value = true
    error.value = null
    try {
      const report = await auditStagedSkill(stagedId)
      activeReport.value = report
      if (stagedSkill.value?.stagedId === stagedId) {
        stagedSkill.value = {
          ...stagedSkill.value,
          audit: report,
        }
      }
      return report
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      auditing.value = false
    }
  }

  async function approveInstall(stagedId = stagedSkill.value?.stagedId): Promise<InstalledSkillRecord> {
    if (!stagedId) throw new Error('No staged skill to install')
    installing.value = true
    error.value = null
    try {
      const installed = await approveStagedSkillInstall(stagedId, activePath.value ?? undefined)
      stagedSkill.value = null
      return installed
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      installing.value = false
    }
  }

  async function dismissStage(stagedId = stagedSkill.value?.stagedId) {
    if (!stagedId) return
    await dismissStagedSkill(stagedId)
    if (stagedSkill.value?.stagedId === stagedId) {
      stagedSkill.value = null
    }
  }

  async function loadInstalledReport(skillId: string, version: string) {
    const report = await getAuditReport({ skillId, version })
    activeReport.value = report
    return report
  }

  async function loadStagedReport(stagedId: string) {
    const report = await getAuditReport({ stagedId })
    activeReport.value = report
    return report
  }

  function resetForProfile() {
    stagedSkill.value = null
    activeReport.value = null
    reportVisible.value = false
    error.value = null
  }

  return {
    stagedSkill,
    activeReport,
    reportVisible,
    staging,
    auditing,
    installing,
    error,
    openReport,
    closeReport,
    stageArchive,
    stageGit,
    setMarketplaceStage,
    runAudit,
    approveInstall,
    dismissStage,
    loadInstalledReport,
    loadStagedReport,
    resetForProfile,
  }
})
