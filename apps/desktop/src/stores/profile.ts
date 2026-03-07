import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  connectEnterpriseProfile as connectEnterpriseProfileRequest,
  getProfileRegistry,
  removeProfile as removeProfileRequest,
  switchActiveProfile as switchActiveProfileRequest,
} from '../services/profile'
import type {
  AppProfile,
  ConnectEnterpriseProfileRequest,
  ProfileMutationResult,
} from '../types/profile'

export const PROFILE_CONTEXT_CHANGED_EVENT = 'aldercowork:profile-context-changed'

function emitProfileContextChanged(payload: ProfileMutationResult) {
  window.dispatchEvent(new CustomEvent(PROFILE_CONTEXT_CHANGED_EVENT, { detail: payload }))
}

export const useProfileStore = defineStore('profile', () => {
  const profiles = ref<AppProfile[]>([])
  const activeProfileId = ref('local:default')
  const loaded = ref(false)
  const loading = ref(false)
  const switching = ref(false)
  const error = ref<string | null>(null)

  const activeProfile = computed(() =>
    profiles.value.find((profile) => profile.id === activeProfileId.value) ?? null,
  )
  const isEnterpriseProfile = computed(() => activeProfile.value?.kind === 'enterprise')

  function applySnapshot(snapshot: { activeProfileId: string; profiles: AppProfile[] }) {
    activeProfileId.value = snapshot.activeProfileId
    profiles.value = snapshot.profiles
  }

  async function init() {
    if (loaded.value) return
    await refresh()
  }

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      applySnapshot(await getProfileRegistry())
      loaded.value = true
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      loading.value = false
    }
  }

  async function connectEnterpriseProfile(request: ConnectEnterpriseProfileRequest) {
    switching.value = true
    error.value = null
    try {
      const result = await connectEnterpriseProfileRequest(request)
      applySnapshot(result)
      loaded.value = true
      if (request.activate ?? true) {
        emitProfileContextChanged(result)
      }
      return result
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      switching.value = false
    }
  }

  async function switchProfile(profileId: string) {
    if (profileId === activeProfileId.value) return null
    switching.value = true
    error.value = null
    try {
      const result = await switchActiveProfileRequest(profileId)
      applySnapshot(result)
      loaded.value = true
      emitProfileContextChanged(result)
      return result
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      switching.value = false
    }
  }

  async function removeEnterpriseProfile(profileId: string, purgeData = true) {
    switching.value = true
    error.value = null
    try {
      const result = await removeProfileRequest(profileId, purgeData)
      const activeChanged = result.activeProfileId !== activeProfileId.value || result.targetProfileId === activeProfileId.value
      applySnapshot(result)
      loaded.value = true
      if (activeChanged) {
        emitProfileContextChanged(result)
      }
      return result
    } catch (nextError: unknown) {
      error.value = nextError instanceof Error ? nextError.message : String(nextError)
      throw nextError
    } finally {
      switching.value = false
    }
  }

  return {
    profiles,
    activeProfileId,
    activeProfile,
    loaded,
    loading,
    switching,
    error,
    isEnterpriseProfile,
    init,
    refresh,
    connectEnterpriseProfile,
    switchProfile,
    removeEnterpriseProfile,
  }
})
