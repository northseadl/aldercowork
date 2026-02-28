import { computed, ref, watch, type Ref } from 'vue'

import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/v2'

/**
 * Resolve fetch implementation.
 *
 * In Tauri (desktop): uses @tauri-apps/plugin-http native fetch
 * which goes through Rust reqwest — bypassing WKWebView's broken
 * ReadableStream buffering that blocks SSE streaming.
 *
 * In browser (dev): falls back to window.fetch.
 */
async function resolveFetch(): Promise<typeof globalThis.fetch> {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
            const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
            return tauriFetch as unknown as typeof globalThis.fetch
        } catch (e: unknown) {
            console.warn('[useClient] tauri-plugin-http not available, falling back to window.fetch:', e)
        }
    }
    return window.fetch.bind(window)
}

/**
 * Create a reactive OpenCode SDK client bound to the kernel port and workspace directory.
 * Uses official @opencode-ai/sdk/v2 with type-safe APIs.
 *
 * Client is rebuilt when port or directory changes.
 */
export function useClient(port: Ref<number | null>, directory?: Ref<string | null>) {
    const client = ref<OpencodeClient | null>(null)
    const ready = computed(() => client.value !== null)
    const fetchFnRef = ref<typeof globalThis.fetch | null>(null)

    // Eagerly resolve fetch implementation
    void resolveFetch().then((fn) => { fetchFnRef.value = fn })

    watch(
        [port, directory ?? ref(null), fetchFnRef],
        ([nextPort, nextDir, fetchFn]) => {
            if (nextPort === null || !fetchFn) {
                client.value = null
                return
            }

            client.value = createOpencodeClient({
                baseUrl: `http://localhost:${nextPort}`,
                directory: nextDir ?? undefined,
                fetch: fetchFn,
            })
        },
        { immediate: true },
    )

    return {
        client,
        ready,
    }
}
