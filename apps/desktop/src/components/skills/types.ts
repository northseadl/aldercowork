import type { SkillManifest } from '@aldercowork/skill-schema'

export type SkillActivationScope = 'global' | 'workspace'

export interface SkillActivation {
  global: boolean
  workspace: boolean
}

export interface SkillPanelSkill extends SkillManifest {
  name: string
  description: string
  installed: boolean
  activation: SkillActivation
  evalScore?: number
  preview?: string
  toolsToCall?: string[]
}

export type SkillPermissionType = 'fs' | 'network' | 'shell'

export interface NormalizedSkillPermission {
  key: string
  type: SkillPermissionType
  value: string
}
