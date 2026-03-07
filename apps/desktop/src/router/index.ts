import { createRouter, createWebHistory } from 'vue-router'

import ChatView from '../views/ChatView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/skills',
      name: 'skills',
      component: () => import('../views/SkillsView.vue'),
    },
    {
      path: '/runbooks',
      name: 'runbooks',
      component: () => import('../views/RunbooksView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
  ],
})

// ── View Transition API integration ──
// Wraps each navigation in a native View Transition for smooth cross-route
// animations. Falls back to instant navigation when API is unavailable.
let pendingViewTransition: { ready: Promise<void>; finished: Promise<void> } | null = null

router.beforeResolve((to, from) => {
  if (to.path === from.path) return

  // Skip if View Transition API is not supported
  if (!document.startViewTransition) return

  return new Promise<void>((resolve) => {
    const transition = document.startViewTransition(() => {
      resolve()
      // Return a promise that resolves after the DOM is updated by Vue
      return new Promise<void>((done) => {
        // Vue will update the DOM synchronously after resolve(),
        // nextTick ensures the update is flushed.
        setTimeout(done, 0)
      })
    })
    pendingViewTransition = transition
    transition.finished.then(() => {
      pendingViewTransition = null
    })
  })
})

export { pendingViewTransition }
export default router
