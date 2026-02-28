import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { AppNavId } from '../types'

export const useAppStore = defineStore('app', () => {
  const activeNav = ref<AppNavId>('sessions')
  const sidebarCollapsed = ref(false)

  function navigateTo(nav: AppNavId) {
    activeNav.value = nav
  }

  return {
    activeNav,
    sidebarCollapsed,
    navigateTo,
  }
})
