import { invoke } from '@tauri-apps/api/core'

import type {
  InstalledSkillRecord,
  MarketplaceSearchResult,
  SkillActivationState,
  SkillAuditReport,
  SkillCatalogManifest,
  SkillMarketplaceSource,
  SkillUpdateState,
  StagedSkillRecord,
} from '@aldercowork/skill-schema'

import { MARKETPLACE_BUILD_CONFIG } from '../config/build'
import { getHubToken } from './kernelConfig'
import { getActiveProfile } from './profile'

export type SkillActivationScope = 'global' | 'workspace'

interface MarketplaceProviderConfig {
  source: SkillMarketplaceSource | 'enterprise'
  label: string
  catalogUrl?: string
  authToken?: string
}

interface StageSkillPackageRequest {
  source: 'local-archive' | 'git'
  sourceLabel?: string
  archivePath?: string
  gitUrl?: string
}

export interface SkillMarketplaceProvider {
  source: SkillMarketplaceSource | 'enterprise'
  label: string
  search(query: string): Promise<MarketplaceSearchResult>
  getSkill(skillId: string, version?: string): Promise<SkillCatalogManifest>
  download(skillId: string, version?: string): Promise<StagedSkillRecord>
  getLatestVersions(workspacePath?: string): Promise<Map<string, SkillUpdateState>>
  update(skillId: string, workspacePath?: string): Promise<StagedSkillRecord>
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeSkill<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`Skill operation requires Tauri runtime (${command})`)
  }
  return invoke<T>(command, args)
}

function joinUrl(base: string, path: string): string {
  if (!base) return path
  if (/^https?:\/\//.test(path)) return path
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function resolveProviderConfig(): Promise<MarketplaceProviderConfig | null> {
  const activeProfile = await getActiveProfile().catch(() => null)

  if (activeProfile?.kind === 'enterprise') {
    const enterprise = activeProfile.enterprise
    const authToken = await getHubToken().catch(() => null)
    const catalogUrl = enterprise?.hubUrl
      ? joinUrl(
        enterprise.hubUrl,
        MARKETPLACE_BUILD_CONFIG.enterpriseCatalogPath,
      )
      : undefined
    // No catalog URL = no marketplace
    if (!catalogUrl) return null
    return {
      source: 'enterprise',
      label: enterprise?.organizationName
        ? `${enterprise.organizationName} Hub`
        : 'Enterprise Hub',
      catalogUrl,
      authToken: authToken || undefined,
    }
  }

  // Standalone mode — only if a real catalog URL is configured
  const openSourceUrl = MARKETPLACE_BUILD_CONFIG.openSourceCatalogUrl
  if (!openSourceUrl) return null

  return {
    source: 'open-source',
    label: 'Open Skill Market',
    catalogUrl: openSourceUrl,
  }
}

class TauriMarketplaceProvider implements SkillMarketplaceProvider {
  constructor(private readonly config: MarketplaceProviderConfig) { }

  get source() {
    return this.config.source
  }

  get label() {
    return this.config.label
  }

  search(query: string) {
    return invokeSkill<MarketplaceSearchResult>('search_marketplace_skills', {
      provider: this.config,
      query,
    })
  }

  getSkill(skillId: string, version?: string) {
    return invokeSkill<SkillCatalogManifest>('get_marketplace_skill', {
      provider: this.config,
      skillId,
      version,
    })
  }

  download(skillId: string, version?: string) {
    return invokeSkill<StagedSkillRecord>('download_marketplace_skill', {
      provider: this.config,
      skillId,
      version,
    })
  }

  async getLatestVersions(workspacePath?: string) {
    const updates = await invokeSkill<
      Array<{ skillId: string; latestVersion: string; publishedAt: string }>
    >('check_skill_updates', {
      provider: this.config,
      workspacePath,
    })

    return new Map(
      updates.map((update) => [
        update.skillId,
        {
          available: true,
          latestVersion: update.latestVersion,
          publishedAt: update.publishedAt,
        },
      ]),
    )
  }

  update(skillId: string, workspacePath?: string) {
    return invokeSkill<StagedSkillRecord>('update_skill', {
      provider: this.config,
      skillId,
      workspacePath,
    })
  }
}

/** Returns empty results when no marketplace is configured */
class NullMarketplaceProvider implements SkillMarketplaceProvider {
  source = 'open-source' as const
  label = ''
  async search(): Promise<MarketplaceSearchResult> {
    return { items: [], nextCursor: null, sourceLabel: '' }
  }
  async getSkill(): Promise<SkillCatalogManifest> {
    throw new Error('No marketplace configured')
  }
  async download(): Promise<StagedSkillRecord> {
    throw new Error('No marketplace configured')
  }
  async getLatestVersions(): Promise<Map<string, SkillUpdateState>> {
    return new Map()
  }
  async update(): Promise<StagedSkillRecord> {
    throw new Error('No marketplace configured')
  }
}

export async function getMarketplaceProvider(): Promise<SkillMarketplaceProvider> {
  const config = await resolveProviderConfig()
  if (!config) return new NullMarketplaceProvider()
  return new TauriMarketplaceProvider(config)
}

export async function listInstalledSkills(workspacePath?: string): Promise<InstalledSkillRecord[]> {
  return invokeSkill<InstalledSkillRecord[]>('list_installed_skills_with_state', { workspacePath })
}

export async function stageArchiveImport(): Promise<StagedSkillRecord | null> {
  const archivePath = await invokeSkill<string | null>('select_skill_archive')
  if (!archivePath) return null
  return invokeSkill<StagedSkillRecord>('stage_skill_package', {
    request: {
      source: 'local-archive',
      sourceLabel: 'Archive',
      archivePath,
    } satisfies StageSkillPackageRequest,
  })
}

export async function stageGitImport(gitUrl: string): Promise<StagedSkillRecord> {
  return invokeSkill<StagedSkillRecord>('stage_skill_package', {
    request: {
      source: 'git',
      sourceLabel: 'Git',
      gitUrl,
    } satisfies StageSkillPackageRequest,
  })
}

export async function auditStagedSkill(stagedId: string): Promise<SkillAuditReport> {
  return invokeSkill<SkillAuditReport>('audit_staged_skill', { stagedId })
}

export async function approveStagedSkillInstall(
  stagedId: string,
  workspacePath?: string,
): Promise<InstalledSkillRecord> {
  return invokeSkill<InstalledSkillRecord>('approve_staged_skill_install', {
    stagedId,
    workspacePath,
  })
}

export async function dismissStagedSkill(stagedId: string): Promise<void> {
  await invokeSkill('dismiss_staged_skill', { stagedId })
}

export async function getAuditReport(options: {
  reportId?: string
  skillId?: string
  version?: string
  stagedId?: string
}): Promise<SkillAuditReport> {
  return invokeSkill<SkillAuditReport>('get_skill_audit_report', options)
}

export async function removeInstalledSkill(skillId: string): Promise<void> {
  await invokeSkill('remove_skill', { skillId })
}

export async function activateInstalledSkill(
  skillId: string,
  scope: SkillActivationScope,
  workspacePath?: string,
): Promise<void> {
  await invokeSkill('activate_skill', { skillId, scope, workspacePath })
}

export async function deactivateInstalledSkill(
  skillId: string,
  scope: SkillActivationScope,
  workspacePath?: string,
): Promise<void> {
  await invokeSkill('deactivate_skill', { skillId, scope, workspacePath })
}

export function isScopeActive(activation: SkillActivationState, scope: SkillActivationScope): boolean {
  return scope === 'global' ? activation.global : activation.workspace
}
