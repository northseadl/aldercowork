import { invoke } from '@tauri-apps/api/core'

import type {
  AppProfile,
  ConnectEnterpriseProfileRequest,
  ProfileMutationResult,
  ProfileRegistrySnapshot,
} from '../types/profile'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeProfile<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`Profile operation requires Tauri runtime (${command})`)
  }
  return invoke<T>(command, args)
}

export async function getProfileRegistry(): Promise<ProfileRegistrySnapshot> {
  return invokeProfile<ProfileRegistrySnapshot>('get_profile_registry')
}

export async function getActiveProfile(): Promise<AppProfile> {
  return invokeProfile<AppProfile>('get_active_profile')
}

export async function connectEnterpriseProfile(
  request: ConnectEnterpriseProfileRequest,
): Promise<ProfileMutationResult> {
  return invokeProfile<ProfileMutationResult>('connect_enterprise_profile', { request })
}

export async function switchActiveProfile(profileId: string): Promise<ProfileMutationResult> {
  return invokeProfile<ProfileMutationResult>('switch_active_profile', { profileId })
}

export async function removeProfile(
  profileId: string,
  purgeData = true,
): Promise<ProfileMutationResult> {
  return invokeProfile<ProfileMutationResult>('remove_profile', { profileId, purgeData })
}
