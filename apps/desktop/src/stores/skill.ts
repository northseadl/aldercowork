import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'

import type { SkillActivationScope, SkillPanelSkill } from '../components/skills'
import { useSkillImport } from '../composables/useSkillImport'
import { useWorkspaceStore } from './workspace'

interface SkillActivationResult {
  skillId: string
  global: boolean
  workspace: boolean
}

export const useSkillStore = defineStore('skill', () => {
  const workspaceStore = useWorkspaceStore()
  const { activePath } = storeToRefs(workspaceStore)

  const skills = ref<SkillPanelSkill[]>([])
  const searchKeyword = ref('')
  const selectedSkillId = ref('')
  const inspectVisible = ref(false)
  const loaded = ref(false)
  const loadError = ref<string | null>(null)
  const activating = ref(false)

  const {
    scanning,
    importing,
    importError,
    scanAllSkills,
    importFromArchive,
    importFromGit,
    removeSkill: removeSkillFromDisk,
  } = useSkillImport()

  const filteredSkills = computed(() => {
    const normalizedKeyword = searchKeyword.value.trim().toLowerCase()

    if (!normalizedKeyword) {
      return skills.value
    }

    return skills.value.filter(
      (skill) =>
        skill.name.toLowerCase().includes(normalizedKeyword) ||
        skill.id.toLowerCase().includes(normalizedKeyword) ||
        skill.description.toLowerCase().includes(normalizedKeyword),
    )
  })

  watch(
    filteredSkills,
    (nextSkills) => {
      if (!nextSkills.some((skill) => skill.id === selectedSkillId.value)) {
        selectedSkillId.value = nextSkills[0]?.id ?? ''
      }

      if (!nextSkills.length) {
        inspectVisible.value = false
      }
    },
    { immediate: true },
  )

  const selectedSkill = computed(() => {
    return filteredSkills.value.find((skill) => skill.id === selectedSkillId.value) ?? null
  })

  const toolsToCall = computed(() => {
    return selectedSkill.value?.toolsToCall ?? []
  })

  const skillCount = computed(() => {
    return skills.value.length
  })

  /** Fetch activation state from Rust and merge into skills */
  async function reconcileActivations() {
    try {
      const results = await invoke<SkillActivationResult[]>('get_skill_activations', {
        workspacePath: activePath.value ?? undefined,
      })
      const activationMap = new Map(results.map((r) => [r.skillId, r]))
      for (const skill of skills.value) {
        const act = activationMap.get(skill.id)
        skill.activation = {
          global: act?.global ?? false,
          workspace: act?.workspace ?? false,
        }
      }
    } catch (e) {
      console.warn('[skillStore] reconcileActivations failed:', e)
    }
  }

  /** Load all skills from the filesystem and reconcile activation state */
  async function loadSkills(): Promise<void> {
    loadError.value = null
    try {
      skills.value = await scanAllSkills()
      await reconcileActivations()
      loaded.value = true
    } catch (error: unknown) {
      loadError.value = error instanceof Error ? error.message : String(error)
      loaded.value = true
    }
  }

  // Workspace scope activation depends on current workspace path.
  // Reconcile when workspace changes to avoid stale toggles in the UI.
  watch(activePath, () => {
    if (!loaded.value) return
    void reconcileActivations()
  })

  /** Activate a skill in the given scope */
  async function activateSkill(skillId: string, scope: SkillActivationScope): Promise<void> {
    activating.value = true
    try {
      await invoke('activate_skill', {
        skillId,
        scope,
        workspacePath: scope === 'workspace' ? activePath.value : undefined,
      })
      await reconcileActivations()
    } finally {
      activating.value = false
    }
  }

  /** Deactivate a skill in the given scope */
  async function deactivateSkill(skillId: string, scope: SkillActivationScope): Promise<void> {
    activating.value = true
    try {
      await invoke('deactivate_skill', {
        skillId,
        scope,
        workspacePath: scope === 'workspace' ? activePath.value : undefined,
      })
      await reconcileActivations()
    } finally {
      activating.value = false
    }
  }

  /** Import skill from a local archive, then refresh the list */
  async function importArchive(): Promise<string | null> {
    const name = await importFromArchive()
    if (name) {
      await loadSkills()
      selectSkill(name)
    }
    return name
  }

  /** Import skill from a Git repo URL, then refresh the list */
  async function importGit(repoUrl: string): Promise<string> {
    const name = await importFromGit(repoUrl)
    await loadSkills()
    selectSkill(name)
    return name
  }

  /** Remove a skill (deactivate from both scopes first) */
  async function removeSkill(skillId: string): Promise<void> {
    // Clean up symlinks before removing files
    try { await deactivateSkill(skillId, 'global') } catch { /* best effort */ }
    try { await deactivateSkill(skillId, 'workspace') } catch { /* best effort */ }
    await removeSkillFromDisk(skillId)
    await loadSkills()
  }

  function selectSkill(id: string) {
    if (!skills.value.some((skill) => skill.id === id)) {
      return
    }

    selectedSkillId.value = id
  }

  function openInspect() {
    if (!selectedSkill.value) {
      return
    }

    inspectVisible.value = true
  }

  function closeInspect() {
    inspectVisible.value = false
  }

  function confirmInspect() {
    inspectVisible.value = false
  }

  return {
    skills,
    searchKeyword,
    selectedSkillId,
    inspectVisible,
    filteredSkills,
    selectedSkill,
    toolsToCall,
    skillCount,
    loaded,
    loadError,
    scanning,
    importing,
    importError,
    activating,
    loadSkills,
    activateSkill,
    deactivateSkill,
    importArchive,
    importGit,
    removeSkill,
    selectSkill,
    openInspect,
    closeInspect,
    confirmInspect,
  }
})
