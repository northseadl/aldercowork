import { ref, onMounted, onUnmounted } from 'vue'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
    version: string
    date?: string
    body?: string
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

const status = ref<UpdateStatus>('idle')
const available = ref<UpdateInfo | null>(null)
const progress = ref(0)
const error = ref<string | null>(null)

let checkIntervalId: ReturnType<typeof setInterval> | null = null
let pendingUpdate: Awaited<ReturnType<typeof check>> | null = null

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

async function checkForUpdate(silent = false) {
    if (status.value === 'downloading' || status.value === 'ready') return

    if (!silent) status.value = 'checking'
    error.value = null

    try {
        const update = await check()

        if (update) {
            pendingUpdate = update
            available.value = {
                version: update.version,
                date: update.date ?? undefined,
                body: update.body ?? undefined,
            }
            status.value = 'available'
        } else {
            if (!silent) status.value = 'idle'
        }
    } catch (e) {
        console.warn('[updater] check failed:', e)
        if (!silent) {
            error.value = e instanceof Error ? e.message : String(e)
            status.value = 'error'
        }
    }
}

async function downloadAndInstall() {
    if (!pendingUpdate) return

    status.value = 'downloading'
    progress.value = 0
    error.value = null

    try {
        let totalLength = 0

        await pendingUpdate.downloadAndInstall((event) => {
            if (event.event === 'Started' && event.data.contentLength) {
                totalLength = event.data.contentLength
            }
            if (event.event === 'Progress' && totalLength > 0) {
                progress.value = Math.min(
                    100,
                    Math.round((event.data.chunkLength / totalLength) * 100 + progress.value),
                )
            }
            if (event.event === 'Finished') {
                progress.value = 100
            }
        })

        status.value = 'ready'
    } catch (e) {
        console.error('[updater] download failed:', e)
        error.value = e instanceof Error ? e.message : String(e)
        status.value = 'error'
    }
}

async function installAndRelaunch() {
    await relaunch()
}

function dismiss() {
    available.value = null
    pendingUpdate = null
    status.value = 'idle'
    error.value = null
}

export function useUpdater() {
    onMounted(() => {
        // Initial check after a short delay to not block app startup
        setTimeout(() => checkForUpdate(true), 5_000)

        checkIntervalId = setInterval(() => checkForUpdate(true), CHECK_INTERVAL_MS)
    })

    onUnmounted(() => {
        if (checkIntervalId) {
            clearInterval(checkIntervalId)
            checkIntervalId = null
        }
    })

    return {
        status,
        available,
        progress,
        error,
        checkForUpdate,
        downloadAndInstall,
        installAndRelaunch,
        dismiss,
    }
}
