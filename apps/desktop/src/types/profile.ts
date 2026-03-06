export type ProfileKind = 'local' | 'enterprise'
export type ManagedSection = 'providers' | 'model' | 'workspace' | 'skills'

export interface ManagedProviderOverride {
  enabled?: boolean
  hasKey?: boolean
  baseUrl?: string
  source?: 'local' | 'hub'
}

export interface EnterpriseManagedSettings {
  locked: boolean
  lockedSections: ManagedSection[]
  defaultProvider?: string | null
  forcedModel?: string | null
  workspaceRoot?: string | null
  disableWorkspaceSelection: boolean
  providerOverrides: Record<string, ManagedProviderOverride>
  notes?: string | null
  auditLevel?: string | null
}

export interface EnterpriseProfileMetadata {
  hubUrl: string
  catalogPath: string
  organizationId: string
  organizationName: string
  userId: string
  userName: string
  hubHostHash: string
}

export interface AppProfile {
  id: string
  kind: ProfileKind
  label: string
  createdAt: string
  updatedAt: string
  enterprise?: EnterpriseProfileMetadata | null
  managedSettings?: EnterpriseManagedSettings | null
}

export interface ProfileRegistrySnapshot {
  activeProfileId: string
  profiles: AppProfile[]
}

export interface ProfileMutationResult extends ProfileRegistrySnapshot {
  targetProfileId: string
}

export interface ConnectEnterpriseProfileRequest {
  hubUrl: string
  catalogPath?: string
  organizationId: string
  organizationName?: string
  userId: string
  userName?: string
  label?: string
  authToken?: string
  managedSettings?: EnterpriseManagedSettings
  activate?: boolean
}
