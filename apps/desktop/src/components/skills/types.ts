import type {
  InstalledSkillRecord,
  MarketplaceSkillDetail,
  MarketplaceSkillSummary,
  SkillRuntimeManifest,
  StagedSkillRecord,
} from '@aldercowork/skill-schema'

export type SkillActivationScope = 'global' | 'workspace'
export type SkillPermissionType = 'fs' | 'network' | 'shell'

export interface NormalizedSkillPermission {
  key: string
  type: SkillPermissionType
  value: string
}

export type SkillDetailSelection =
  | { kind: 'installed'; skill: InstalledSkillRecord }
  | { kind: 'marketplace'; skill: MarketplaceSkillDetail }
  | { kind: 'staged'; skill: StagedSkillRecord }

export type SkillPanelSkill = InstalledSkillRecord
export type SkillMarketSkill = MarketplaceSkillSummary

export function normalizePermissions(skill: Pick<SkillRuntimeManifest, 'permissions'>): NormalizedSkillPermission[] {
  const result: NormalizedSkillPermission[] = []
  for (const perm of skill.permissions.fs ?? []) {
    result.push({ key: `fs-${perm}`, type: 'fs', value: perm })
  }
  for (const host of skill.permissions.network ?? []) {
    result.push({ key: `network-${host}`, type: 'network', value: host })
  }
  if (skill.permissions.shell) {
    result.push({ key: `shell-${skill.permissions.shell}`, type: 'shell', value: skill.permissions.shell })
  }
  return result
}
