export type ProfileKind = 'local' | 'enterprise'

export interface EnterpriseProfileMetadata {
  hubUrl: string
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
  label?: string
  authToken?: string
  activate?: boolean
}
