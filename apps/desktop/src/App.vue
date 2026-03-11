<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import KernelStatus from './components/app/KernelStatus.vue'
import UpdateBanner from './components/app/UpdateBanner.vue'
import WelcomeScreen from './components/app/WelcomeScreen.vue'
import { AppContent, AppHeader, AppShell, AppSidebar } from './components/layout'
import { AppToast, CommandPalette, ConfirmDialog, PermissionDialog } from './components/ui'
import { useI18n } from './i18n'
import { createKernel, KERNEL_KEY } from './composables/useKernel'
import { useClient, useDataPaths, useKeyboard, useToast, installCopyDelegate } from './composables'
import { useAppStore } from './stores/app'
import { useInstalledSkillStore } from './stores/installedSkill'
import { useMarketplaceSkillStore } from './stores/marketplaceSkill'
import { PROFILE_CONTEXT_CHANGED_EVENT, useProfileStore } from './stores/profile'
import { useRunbookStore } from './stores/runbook'
import { useSessionStore } from './stores/session'
import { useSettingsStore } from './stores/settings'
import { useSkillAuditStore } from './stores/skillAudit'
import { useWorkspaceStore } from './stores/workspace'

import type { AppNavId, BreadcrumbItem, RuntimeErrorDetail, SidebarNavItem } from './types'
import { RUNTIME_ERROR_EVENT } from './types'

const routeByNav: Record<AppNavId, string> = {
  sessions: '/',
  skills: '/skills',
  runbooks: '/runbooks',
  workflow: '/workflow',
  settings: '/settings',
}

const navByRoute: Record<string, AppNavId> = {
  '/': 'sessions',
  '/skills': 'skills',
  '/runbooks': 'runbooks',
  '/workflow': 'workflow',
  '/settings': 'settings',
}

const router = useRouter()
const route = useRoute()

const appStore = useAppStore()
const sessionStore = useSessionStore()
const profileStore = useProfileStore()
const settingsStore = useSettingsStore()
const installedSkillStore = useInstalledSkillStore()
const marketplaceSkillStore = useMarketplaceSkillStore()
const skillAuditStore = useSkillAuditStore()
const runbookStore = useRunbookStore()
const workspaceStore = useWorkspaceStore()
const { refreshPaths } = useDataPaths()
const toast = useToast()
const fatalRuntimeError = ref<RuntimeErrorDetail | null>(null)
const recoverNonce = ref(0)
let uninstallCopyDelegate: (() => void) | null = null

const { activeNav } = storeToRefs(appStore)
const { activeSession, activeSessionId } = storeToRefs(sessionStore)
const { skillCount } = storeToRefs(installedSkillStore)
const { configured, loaded: settingsLoaded } = storeToRefs(settingsStore)

function hasStoreMethod<T extends object>(
  store: T,
  methodName: string,
): store is T & Record<string, (...args: never[]) => unknown> {
  return typeof (store as Record<string, unknown>)[methodName] === 'function'
}

async function reloadSettingsStore() {
  // HMR can temporarily keep an older Pinia store instance alive.
  if (hasStoreMethod(settingsStore, 'reload')) {
    await settingsStore.reload()
    return
  }
  await settingsStore.init()
}

function resetSessionStoreForProfile() {
  const restoredId = settingsStore.lastActiveSessionId ?? undefined
  if (hasStoreMethod(sessionStore, 'resetForProfile')) {
    sessionStore.resetForProfile(restoredId)
    return
  }

  sessionStore.sessions = []
  sessionStore.activeSessionId = restoredId ?? ''
  sessionStore.error = null
  sessionStore.loading = false
  sessionStore.creating = false
}

function resetMarketplaceSkillStoreForProfile() {
  if (hasStoreMethod(marketplaceSkillStore, 'resetForProfile')) {
    marketplaceSkillStore.resetForProfile()
    return
  }

  marketplaceSkillStore.provider = null
  marketplaceSkillStore.query = ''
  marketplaceSkillStore.items = []
  marketplaceSkillStore.details = {}
  marketplaceSkillStore.sourceLabel = ''
  marketplaceSkillStore.loadError = null
}

function resetSkillAuditStoreForProfile() {
  if (hasStoreMethod(skillAuditStore, 'resetForProfile')) {
    skillAuditStore.resetForProfile()
    return
  }

  skillAuditStore.stagedSkill = null
  skillAuditStore.activeReport = null
  skillAuditStore.reportVisible = false
  skillAuditStore.error = null
}

async function reloadWorkspaceStoreForProfile() {
  if (hasStoreMethod(workspaceStore, 'reloadForProfile')) {
    await workspaceStore.reloadForProfile()
    return
  }

  workspaceStore.activeWorkspace = null
  workspaceStore.recentWorkspaces = []
  workspaceStore.loaded = false
  await workspaceStore.loadFromSettings()
}

async function reloadRunbookStoreForProfile() {
  if (hasStoreMethod(runbookStore, 'reload')) {
    await runbookStore.reload()
    return
  }

  runbookStore.runbooks = []
  runbookStore.selectedId = ''
  await runbookStore.loadRunbooks()
}

async function reloadProfileBoundState() {
  await refreshPaths()
  await reloadSettingsStore()
  providerStatesSnapshot = JSON.stringify(settingsStore.providerStates)
  resetSessionStoreForProfile()
  resetMarketplaceSkillStoreForProfile()
  resetSkillAuditStoreForProfile()
  await reloadWorkspaceStoreForProfile()
  await installedSkillStore.loadAll()
  await reloadRunbookStoreForProfile()
}

const handleProfileContextChanged = () => {
  void reloadProfileBoundState()
}

// Map session store → sidebar display format
const sidebarSessions = computed(() =>
  sessionStore.sessions.map((s) => ({
    id: s.id,
    name: s.title,
    time: formatRelativeTime(s.updatedAt),
  })),
)

function formatRelativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'now'
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  } catch {
    return ''
  }
}

// Singleton kernel manager — auto-starts on mount, shared via provide/inject
const kernel = createKernel()
provide(KERNEL_KEY, kernel)
const { status: kernelStatus, version: kernelVersion, error: kernelError } = kernel

// Global SDK client — created at App level so all views (Chat, Runbooks, etc.) can use it.
// Previously this was buried inside ChatView, making sessionStore.client null on other routes.
const { client: globalSdkClient } = useClient(kernel.port, computed(() => workspaceStore.activePath))
watch(globalSdkClient, (c) => sessionStore.setClient(c), { immediate: true })

// Persist active session ID so it can be restored on next launch
watch(() => sessionStore.activeSessionId, (id) => {
  if (id && !id.startsWith('local-')) {
    settingsStore.setLastActiveSessionId(id)
  }
})

// Welcome screen — shown on first launch only.
// Must wait for settings to load from disk before deciding.
const welcomeDismissed = ref(false)
const showWelcome = computed(() => settingsLoaded.value && !configured.value && !welcomeDismissed.value)
const dismissWelcome = () => {
  welcomeDismissed.value = true
}

const handleRuntimeErrorEvent = (event: Event) => {
  const payload = (event as CustomEvent<RuntimeErrorDetail | undefined>).detail
  if (!payload) return

  if (payload.source === 'promise') {
    toast.error(payload.message)
    return
  }

  fatalRuntimeError.value = payload
}

const recoverFromRuntimeError = () => {
  fatalRuntimeError.value = null
  recoverNonce.value += 1
}

const recoverToSessions = () => {
  recoverFromRuntimeError()
  if (route.path !== '/') {
    void router.replace('/')
  }
}

onMounted(async () => {
  window.addEventListener(RUNTIME_ERROR_EVENT, handleRuntimeErrorEvent as EventListener)
  window.addEventListener(PROFILE_CONTEXT_CHANGED_EVENT, handleProfileContextChanged as EventListener)
  uninstallCopyDelegate = installCopyDelegate()
  await profileStore.init()
  await reloadProfileBoundState()
})

// Sync settings config to kernel on initial load.
// Don't restart immediately — Rust auto-starts the kernel. Instead, write config.json
// and let the next user-triggered restart (or provider change) pick it up.
// This avoids the race: Rust auto-start + frontend restart = two kernel starts.
let initialSettingsSynced = false
watch(settingsLoaded, (loaded) => {
  if (loaded && !initialSettingsSynced) {
    initialSettingsSynced = true
    // Config was already written by useCredentialStore on load — no restart needed
    console.info('[App] Settings loaded, kernel config will apply on next restart')
  }
}, { immediate: true })

// Watch provider settings changes (including key edits) and restart kernel.
// Uses snapshot diff to ignore init hydration but never miss the first user edit.
let providerChangeDebounce: ReturnType<typeof setTimeout> | null = null
let providerStatesSnapshot: string | null = null

watch(
  settingsLoaded,
  (loaded) => {
    if (!loaded) return
    providerStatesSnapshot = JSON.stringify(settingsStore.providerStates)
  },
  { immediate: true },
)

watch(
  () => settingsStore.providerStates,
  (nextStates) => {
    if (!settingsLoaded.value) return

    const nextSnapshot = JSON.stringify(nextStates)

    // First observed state after boot becomes baseline (no restart).
    if (providerStatesSnapshot === null) {
      providerStatesSnapshot = nextSnapshot
      return
    }

    // No semantic change.
    if (nextSnapshot === providerStatesSnapshot) {
      return
    }

    providerStatesSnapshot = nextSnapshot

    if (providerChangeDebounce) clearTimeout(providerChangeDebounce)
    providerChangeDebounce = setTimeout(async () => {
      if (kernelStatus.value !== 'running' && kernelStatus.value !== 'starting') return
      try {
        console.info('[App] Provider settings changed, restarting kernel to reload config')
        await kernel.restart()
      } catch (error) {
        console.warn('[App] Failed to restart kernel after provider change:', error)
      }
    }, 2000)
  },
  { deep: true },
)

onUnmounted(() => {
  window.removeEventListener(RUNTIME_ERROR_EVENT, handleRuntimeErrorEvent as EventListener)
  window.removeEventListener(PROFILE_CONTEXT_CHANGED_EVENT, handleProfileContextChanged as EventListener)
  uninstallCopyDelegate?.()
  uninstallCopyDelegate = null
  if (providerChangeDebounce) clearTimeout(providerChangeDebounce)
})

const { t } = useI18n()

const navItems = computed<SidebarNavItem[]>(() => [
  {
    id: 'sessions',
    label: t('nav.sessions'),
    icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    shortcut: '⌘1',
  },
  {
    id: 'skills',
    label: t('nav.skills'),
    icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    shortcut: '⌘2',
  },
  {
    id: 'runbooks',
    label: t('nav.runbooks'),
    icon: 'M12 20h9|M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z',
    shortcut: '⌘3',
  },
  {
    id: 'workflow',
    label: t('nav.workflow'),
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
    shortcut: '⌘4',
  },
])

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const currentNav = navByRoute[route.path] ?? 'sessions'

  if (currentNav === 'skills') {
    return [{ label: t('nav.skills'), current: true }]
  }

  if (currentNav === 'runbooks') {
    return [{ label: t('nav.runbooks'), current: true }]
  }

  if (currentNav === 'workflow') {
    return [{ label: t('nav.workflow'), current: true }]
  }

  if (currentNav === 'settings') {
    return [{ label: t('nav.settings'), current: true }]
  }

  return [
    { label: t('nav.sessions') },
    { label: activeSession.value?.title ?? t('nav.sessions'), current: true },
  ]
})

const isAppNavId = (value: string): value is AppNavId => {
  return value === 'sessions' || value === 'skills' || value === 'runbooks' || value === 'workflow' || value === 'settings'
}

const navigateTo = (nav: AppNavId) => {
  appStore.navigateTo(nav)
  const targetPath = routeByNav[nav]
  if (route.path !== targetPath) {
    void router.push(targetPath)
  }
}

const handleSelectNav = (id: string) => {
  if (isAppNavId(id)) navigateTo(id)
}

const handleSelectSession = (id: string) => {
  sessionStore.selectSession(id)
  if (route.path !== '/') navigateTo('sessions')
}

const handleDeleteSession = async (id: string) => {
  await sessionStore.deleteSession(id)
  toast.info(t('nav.sessionDeleted'))
}

const handleCreateSession = async () => {
  const id = await sessionStore.createSession()
  if (id && route.path !== '/') {
    navigateTo('sessions')
  }
}

watch(
  () => route.path,
  (path) => {
    const syncedNav = navByRoute[path] ?? 'sessions'
    if (activeNav.value !== syncedNav) {
      appStore.navigateTo(syncedNav)
    }
  },
  { immediate: true },
)

useKeyboard({
  '1': () => navigateTo('sessions'),
  '2': () => navigateTo('skills'),
  '3': () => navigateTo('runbooks'),
  '4': () => navigateTo('workflow'),
})

const showCommandPalette = ref(false)
</script>

<template>
  <!-- Wait for settings to load before showing any UI -->
  <template v-if="!settingsLoaded">
    <div class="app-loading">
      <div class="app-loading__spinner" />
    </div>
  </template>

  <WelcomeScreen v-else-if="showWelcome" @configured="dismissWelcome" />

  <AppShell v-else>
    <template #header>
      <AppHeader :breadcrumbs="breadcrumbs">
        <template #tools>
          <KernelStatus
            :status="kernelStatus"
            :version="kernelVersion"
            :error="kernelError"
          />
        </template>
      </AppHeader>
    </template>

    <template #sidebar>
      <AppSidebar
        :nav-items="navItems"
        :sessions="sidebarSessions"
        :active-nav-id="activeNav"
        :active-session-id="activeSessionId"
        @select-nav="handleSelectNav"
        @select-session="handleSelectSession"
        @delete-session="handleDeleteSession"
        @create-session="handleCreateSession"
      />
    </template>

    <template #content>
      <UpdateBanner />
      <AppContent>
        <section v-if="fatalRuntimeError" class="app-runtime-error" role="alert">
          <h2 class="app-runtime-error__title">{{ t('kernel.error') }}</h2>
          <p class="app-runtime-error__message">{{ fatalRuntimeError.message }}</p>
          <p class="app-runtime-error__meta">
            {{ `${fatalRuntimeError.source} · ${formatRelativeTime(fatalRuntimeError.timestamp) || '--'}` }}
          </p>
          <div class="app-runtime-error__actions">
            <button type="button" class="app-runtime-error__btn app-runtime-error__btn--primary" @click="recoverFromRuntimeError">
              {{ t('common.confirm') }}
            </button>
            <button type="button" class="app-runtime-error__btn" @click="recoverToSessions">
              {{ t('nav.sessions') }}
            </button>
          </div>
        </section>
        <router-view v-else :key="recoverNonce" />
      </AppContent>
    </template>
  </AppShell>

  <CommandPalette v-model="showCommandPalette" />
  <ConfirmDialog />
  <PermissionDialog />
  <AppToast />
</template>

<style scoped>
.app-loading {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--shell);
}

.app-loading__spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--border);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.app-runtime-error {
  height: 100%;
  display: grid;
  place-content: center;
  gap: calc(var(--sp) * 1.5);
  padding: calc(var(--sp) * 4);
  max-width: 560px;
  margin: 0 auto;
  text-align: center;
}

.app-runtime-error__title {
  margin: 0;
  font: var(--fw-semibold) var(--text-heading) / var(--lh-tight) var(--font);
  letter-spacing: var(--ls-title);
  color: var(--text-1);
  text-wrap: balance;
}

.app-runtime-error__message {
  margin: 0;
  color: var(--text-2);
  line-height: var(--lh-relaxed);
  overflow-wrap: anywhere;
}

.app-runtime-error__meta {
  margin: 0;
  color: var(--text-3);
  font: var(--fw-medium) var(--text-micro) / 1.2 var(--font-mono);
}

.app-runtime-error__actions {
  display: flex;
  justify-content: center;
  gap: calc(var(--sp) * 1);
  flex-wrap: wrap;
}

.app-runtime-error__btn {
  border: 1px solid var(--border);
  background: var(--surface-card);
  color: var(--text-2);
  border-radius: var(--r-md);
  padding: 8px 14px;
  cursor: pointer;
}

.app-runtime-error__btn:hover {
  background: var(--surface-hover);
}

.app-runtime-error__btn--primary {
  border-color: var(--brand);
  color: var(--text-1);
}
</style>
