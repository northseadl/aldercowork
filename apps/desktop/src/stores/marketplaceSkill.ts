import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { MarketplaceSkillDetail, MarketplaceSkillSummary } from '@aldercowork/skill-schema'

import { getMarketplaceProvider, type SkillMarketplaceProvider } from '../services/skill'

export const useMarketplaceSkillStore = defineStore('marketplace-skill', () => {
  const provider = ref<SkillMarketplaceProvider | null>(null)
  const query = ref('')
  const items = ref<MarketplaceSkillSummary[]>([])
  const details = ref<Record<string, MarketplaceSkillDetail>>({})
  const sourceLabel = ref('')
  const loading = ref(false)
  const loadingDetail = ref(false)
  const loadError = ref<string | null>(null)

  const hasResults = computed(() => items.value.length > 0)

  async function ensureProvider(): Promise<SkillMarketplaceProvider> {
    if (provider.value) return provider.value
    provider.value = await getMarketplaceProvider()
    return provider.value
  }

  async function searchSkills(nextQuery = query.value): Promise<void> {
    loading.value = true
    loadError.value = null
    query.value = nextQuery
    try {
      const currentProvider = await ensureProvider()
      const result = await currentProvider.search(nextQuery)
      items.value = result.items
      sourceLabel.value = result.sourceLabel
    } catch (error: unknown) {
      loadError.value = error instanceof Error ? error.message : String(error)
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadSkillDetail(skillId: string, version?: string): Promise<MarketplaceSkillDetail> {
    const cacheKey = `${skillId}:${version ?? 'latest'}`
    if (details.value[cacheKey]) return details.value[cacheKey]

    loadingDetail.value = true
    try {
      const currentProvider = await ensureProvider()
      const detail = await currentProvider.getSkill(skillId, version)
      details.value = {
        ...details.value,
        [cacheKey]: detail,
      }
      return detail
    } finally {
      loadingDetail.value = false
    }
  }

  async function downloadSkill(skillId: string, version?: string) {
    const currentProvider = await ensureProvider()
    return currentProvider.download(skillId, version)
  }

  async function stageUpdate(skillId: string, workspacePath?: string) {
    const currentProvider = await ensureProvider()
    return currentProvider.update(skillId, workspacePath)
  }

  function resetForProfile() {
    provider.value = null
    query.value = ''
    items.value = []
    details.value = {}
    sourceLabel.value = ''
    loadError.value = null
  }

  return {
    provider,
    query,
    items,
    details,
    sourceLabel,
    loading,
    loadingDetail,
    loadError,
    hasResults,
    ensureProvider,
    searchSkills,
    loadSkillDetail,
    downloadSkill,
    stageUpdate,
    resetForProfile,
  }
})
