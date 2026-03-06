import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import type { InstalledSkillRecord, SkillUpdateState } from '@aldercowork/skill-schema'

import {
  activateInstalledSkill,
  deactivateInstalledSkill,
  listInstalledSkills,
  removeInstalledSkill,
  type SkillActivationScope,
  getMarketplaceProvider,
} from '../services/skill'
import { useWorkspaceStore } from './workspace'

export const useInstalledSkillStore = defineStore('installed-skill', () => {
  const workspaceStore = useWorkspaceStore()
  const { activePath } = storeToRefs(workspaceStore)

  const skills = ref<InstalledSkillRecord[]>([])
  const loading = ref(false)
  const updating = ref(false)
  const loadError = ref<string | null>(null)

  const skillCount = computed(() => skills.value.length)

  async function loadSkills(): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      skills.value = await listInstalledSkills(activePath.value ?? undefined)
    } catch (error: unknown) {
      loadError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
  }

  async function refreshUpdates(): Promise<void> {
    try {
      const provider = await getMarketplaceProvider()
      const updates = await provider.getLatestVersions(activePath.value ?? undefined)
      skills.value = skills.value.map((skill) => ({
        ...skill,
        update: updates.get(skill.id) ?? ({ available: false } as SkillUpdateState),
      }))
    } catch {
      skills.value = skills.value.map((skill) => ({
        ...skill,
        update: skill.update?.available ? skill.update : { available: false },
      }))
    }
  }

  async function loadAll(): Promise<void> {
    await loadSkills()
    await refreshUpdates()
  }

  async function activateSkill(skillId: string, scope: SkillActivationScope): Promise<void> {
    updating.value = true
    try {
      await activateInstalledSkill(skillId, scope, activePath.value ?? undefined)
      await loadSkills()
      await refreshUpdates()
    } finally {
      updating.value = false
    }
  }

  async function deactivateSkill(skillId: string, scope: SkillActivationScope): Promise<void> {
    updating.value = true
    try {
      await deactivateInstalledSkill(skillId, scope, activePath.value ?? undefined)
      await loadSkills()
      await refreshUpdates()
    } finally {
      updating.value = false
    }
  }

  async function removeSkill(skillId: string): Promise<void> {
    updating.value = true
    try {
      try {
        await deactivateInstalledSkill(skillId, 'global', activePath.value ?? undefined)
      } catch {}
      try {
        await deactivateInstalledSkill(skillId, 'workspace', activePath.value ?? undefined)
      } catch {}
      await removeInstalledSkill(skillId)
      await loadAll()
    } finally {
      updating.value = false
    }
  }

  function upsertInstalledSkill(next: InstalledSkillRecord) {
    const idx = skills.value.findIndex((skill) => skill.id === next.id)
    if (idx === -1) {
      skills.value = [next, ...skills.value]
      return
    }
    const merged = [...skills.value]
    merged[idx] = next
    skills.value = merged
  }

  watch(activePath, () => {
    void loadAll()
  })

  return {
    skills,
    loading,
    updating,
    loadError,
    skillCount,
    loadSkills,
    refreshUpdates,
    loadAll,
    activateSkill,
    deactivateSkill,
    removeSkill,
    upsertInstalledSkill,
  }
})
