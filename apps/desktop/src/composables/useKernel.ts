import { inject, onMounted, onUnmounted, ref, readonly, type InjectionKey, type Ref } from 'vue'

export type KernelStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface KernelInfo {
    port: number
    pid: number
    status: string
}

export interface KernelStatusPayload {
    running: boolean
    port: number | null
    pid: number | null
    error: string | null
}

export interface KernelContext {
    status: Readonly<Ref<KernelStatus>>
    port: Readonly<Ref<number | null>>
    version: Readonly<Ref<string | null>>
    error: Readonly<Ref<string | null>>
    restart: () => Promise<void>
    /** Restart kernel with fresh provider env vars */
    restartWithEnv: (env: Record<string, string>) => Promise<void>
    /** Store provider env without restarting (used on initial load) */
    injectEnv: (env: Record<string, string>) => Promise<void>
}

export const KERNEL_KEY: InjectionKey<KernelContext> = Symbol('kernel')

const STATUS_POLL_INTERVAL_MS = 3_000

/**
 * Create the kernel manager (call once in App.vue, provide via KERNEL_KEY).
 *
 * The Rust backend auto-starts the engine on app launch.
 * This composable listens for 'kernel-started' and 'kernel-error' events
 * from the backend, and polls kernel_status every 3s as a safety net.
 */
export function createKernel(): KernelContext {
    const status = ref<KernelStatus>('starting')
    const port = ref<number | null>(null)
    const version = ref<string | null>(null)
    const error = ref<string | null>(null)

    let pollHandle: ReturnType<typeof setInterval> | null = null
    let unlistenStarted: (() => void) | null = null
    let unlistenError: (() => void) | null = null
    let restartInFlight: Promise<void> | null = null

    async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
        const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
        return tauriInvoke<T>(cmd, args)
    }

    async function setupListeners() {
        try {
            const { listen } = await import('@tauri-apps/api/event')

            const unsub1 = await listen<KernelInfo>('kernel-started', (event) => {
                console.log('[kernel] engine started:', event.payload)
                port.value = event.payload.port
                status.value = 'running'
                error.value = null
            })
            unlistenStarted = unsub1

            const unsub2 = await listen<string>('kernel-error', (event) => {
                console.error('[kernel] engine error:', event.payload)
                error.value = event.payload
                status.value = 'error'
            })
            unlistenError = unsub2
        } catch (e) {
            console.warn('[kernel] failed to setup event listeners:', e)
        }
    }

    async function pollStatus() {
        try {
            const payload = await invoke<KernelStatusPayload>('kernel_status')
            if (payload.running) {
                if (status.value !== 'running') {
                    status.value = 'running'
                }
                port.value = payload.port
                error.value = null
            } else if (status.value === 'running' || status.value === 'starting') {
                status.value = 'error'
                port.value = null
                error.value = payload.error ?? 'Engine process exited unexpectedly'
            }
        } catch {
            // IPC might not be ready
        }
    }

    async function restart() {
        // Prevent concurrent restarts — coalesce into the in-flight promise
        if (restartInFlight) return restartInFlight
        restartInFlight = doRestart()
        try { await restartInFlight } finally { restartInFlight = null }
    }

    async function doRestart() {
        status.value = 'starting'
        error.value = null

        try {
            const info = await invoke<KernelInfo>('restart_kernel')
            port.value = info.port
            status.value = 'running'
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            error.value = msg
            status.value = 'error'
            console.error('[kernel] restart failed:', msg)
        }
    }

    function envToTuples(env: Record<string, string>): [string, string][] {
        return Object.entries(env)
    }

    async function restartWithEnv(env: Record<string, string>) {
        if (restartInFlight) return restartInFlight
        restartInFlight = doRestartWithEnv(env)
        try { await restartInFlight } finally { restartInFlight = null }
    }

    async function doRestartWithEnv(env: Record<string, string>) {
        status.value = 'starting'
        error.value = null

        try {
            const info = await invoke<KernelInfo>('restart_kernel_with_env', {
                env: envToTuples(env),
            })
            port.value = info.port
            status.value = 'running'
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            error.value = msg
            status.value = 'error'
            console.error('[kernel] restart with env failed:', msg)
        }
    }

    async function injectEnv(env: Record<string, string>) {
        try {
            await invoke('set_provider_env', { env: envToTuples(env) })
        } catch (e) {
            console.warn('[kernel] failed to inject env:', e)
        }
    }
    let fastPollHandle: ReturnType<typeof setInterval> | null = null
    let transitionTimer: ReturnType<typeof setTimeout> | null = null

    onMounted(() => {
        void setupListeners()
        void pollStatus()
        // Aggressive polling for first 10s (1s interval), then relax to 3s
        fastPollHandle = setInterval(() => void pollStatus(), 1_000)
        transitionTimer = setTimeout(() => {
            if (fastPollHandle) clearInterval(fastPollHandle)
            fastPollHandle = null
            pollHandle = setInterval(() => void pollStatus(), STATUS_POLL_INTERVAL_MS)
        }, 10_000)
    })

    onUnmounted(() => {
        if (fastPollHandle) clearInterval(fastPollHandle)
        if (transitionTimer) clearTimeout(transitionTimer)
        if (pollHandle !== null) {
            clearInterval(pollHandle)
        }
        unlistenStarted?.()
        unlistenError?.()
    })

    return {
        status: readonly(status),
        port: readonly(port),
        version: readonly(version),
        error: readonly(error),
        restart,
        restartWithEnv,
        injectEnv,
    }
}

/**
 * Access the kernel context from child components.
 */
export function useKernel(): KernelContext {
    const ctx = inject(KERNEL_KEY)
    if (!ctx) {
        throw new Error('useKernel() called outside of kernel provider.')
    }
    return ctx
}
