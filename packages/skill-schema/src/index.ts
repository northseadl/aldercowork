export type SkillFsPermission = 'read' | 'write'
export type SkillShellPermission = 'restricted' | 'full'
export type SkillMarketplaceSource = 'open-source' | 'enterprise' | 'local-archive' | 'git'
export type SkillAuditSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
export type SkillAuditStatus = 'pending' | 'passed' | 'blocked'
export type SkillPackageFormat = 'inline' | 'zip' | 'tar.gz'

export interface SkillPermissions {
  fs?: SkillFsPermission[]
  network?: string[]
  shell?: SkillShellPermission
}

export interface SkillCompat {
  aldercowork: string
}

export interface SkillProvenance {
  source: string
  commit?: string
  digest?: string
}

export interface SkillTriggers {
  keywords?: string[]
  file_patterns?: string[]
}

export interface SkillEvalConfig {
  min_pass_rate: number
}

export interface SkillRuntimeManifest {
  id: string
  version: string
  publisher: string
  license: string
  entry: 'instruction' | 'script'
  permissions: SkillPermissions
  compat: SkillCompat
  provenance?: SkillProvenance
  triggers?: SkillTriggers
  eval?: SkillEvalConfig
}

export type SkillManifest = SkillRuntimeManifest

export interface SkillCatalogPackageFile {
  path: string
  content: string
  executable?: boolean
}

export interface SkillCatalogPackage {
  format: SkillPackageFormat
  checksum: string
  signature?: string
  url?: string
  inlineFiles?: SkillCatalogPackageFile[]
}

export interface SkillCatalogManifest extends SkillRuntimeManifest {
  source: SkillMarketplaceSource
  displayName: string
  summary: string
  icon?: string
  categories: string[]
  homepage?: string
  repository?: string
  publishedAt: string
  releaseNotes?: string
  package: SkillCatalogPackage
  minDesktopVersion?: string
}

export interface SkillActivationState {
  global: boolean
  workspace: boolean
}

export interface SkillAuditBadge {
  severity: SkillAuditSeverity
  status: SkillAuditStatus
  summary: string
  reportId: string
  generatedAt: string
}

export interface SkillUpdateState {
  available: boolean
  latestVersion?: string
  publishedAt?: string
}

export interface InstalledSkillRecord extends SkillRuntimeManifest {
  displayName: string
  summary: string
  source: SkillMarketplaceSource
  sourceLabel: string
  installedAt: string
  activation: SkillActivationState
  preview?: string
  audit?: SkillAuditBadge
  update?: SkillUpdateState
}

export interface MarketplaceSkillSummary {
  id: string
  version: string
  source: SkillMarketplaceSource
  displayName: string
  summary: string
  publisher: string
  categories: string[]
  publishedAt: string
  icon?: string
  risk: SkillAuditSeverity
  installedVersion?: string
  updateAvailable?: boolean
}

export interface MarketplaceSkillDetail extends SkillCatalogManifest {
  installedVersion?: string
  updateAvailable?: boolean
}

export interface MarketplaceSearchResult {
  items: MarketplaceSkillSummary[]
  nextCursor: string | null
  sourceLabel: string
}

export interface SkillAuditFinding {
  code: string
  severity: SkillAuditSeverity
  title: string
  detail: string
  file?: string
}

export interface SkillAuditReport {
  reportId: string
  skillId: string
  version: string
  source: SkillMarketplaceSource
  status: SkillAuditStatus
  severity: SkillAuditSeverity
  installAllowed: boolean
  summary: string
  generatedAt: string
  checksumVerified: boolean
  signatureVerified: boolean
  suspiciousFiles: string[]
  recommendedActions: string[]
  toolCalls: string[]
  findings: SkillAuditFinding[]
}

export interface StagedSkillRecord extends SkillRuntimeManifest {
  stagedId: string
  source: SkillMarketplaceSource
  sourceLabel: string
  displayName: string
  summary: string
  preview?: string
  stagedAt: string
  audit?: SkillAuditReport
}

export interface SkillDirEntry {
  id: string
  path: string
  hasSkillMd: boolean
  hasSkillYaml: boolean
}

export function defaultManifest(id: string): SkillRuntimeManifest {
  return {
    id,
    version: '0.0.0',
    publisher: 'local',
    license: 'unknown',
    entry: 'instruction',
    permissions: {},
    compat: { aldercowork: '>=0.1.0' },
  }
}
