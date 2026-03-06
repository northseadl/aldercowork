/**
 * Composable to access AlderCowork's platform-native data paths from the frontend.
 *
 * In Tauri runtime, fetches paths from the Rust backend via IPC.
 * In browser dev mode, returns fallback paths under ~/.aldercowork.
 */
import { ref, readonly, type Ref } from 'vue'

export interface DataPaths {
    /** Root data directory */
    data: string
    /** Configuration files (settings.json) */
    config: string
    /** Ephemeral cache */
    cache: string
    /** Log files */
    logs: string
    /** Downloaded kernel binaries */
    kernels: string
    /** AlderCowork-managed Skills */
    skills: string
    /** Staging area for skill installs/updates before approval */
    skillStaging: string
    /** Persisted local audit reports */
    skillAuditReports: string
    /** OpenCode kernel state (isolated from ~/.config/opencode) */
    kernelState: string
}

const BROWSER_FALLBACK: DataPaths = {
    data: '~/.aldercowork',
    config: '~/.aldercowork',
    cache: '~/.aldercowork/cache',
    logs: '~/.aldercowork/logs',
    kernels: '~/.aldercowork/kernels',
    skills: '~/.aldercowork/skills',
    skillStaging: '~/.aldercowork/skill-staging',
    skillAuditReports: '~/.aldercowork/audit-reports',
    kernelState: '~/.aldercowork/kernel-state',
}

let cachedPaths: DataPaths | null = null
const paths = ref<DataPaths>(BROWSER_FALLBACK)
const ready = ref(false)

function isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function getTauriInvoke() {
    if (!isTauriRuntime()) {
        throw new Error('Data file I/O requires Tauri runtime')
    }
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke
}

async function fetchPaths(): Promise<DataPaths> {
    if (cachedPaths) return cachedPaths

    if (!isTauriRuntime()) {
        cachedPaths = BROWSER_FALLBACK
        paths.value = cachedPaths
        ready.value = true
        return cachedPaths
    }

    try {
        const invoke = await getTauriInvoke()
        cachedPaths = await invoke<DataPaths>('get_data_paths')
        paths.value = cachedPaths
        ready.value = true
        return cachedPaths
    } catch (error: unknown) {
        ready.value = false
        throw new Error(
            `Failed to resolve platform data paths: ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

/**
 * Read a file from the AlderCowork data directory.
 * Returns empty string if the file doesn't exist yet.
 */
async function readDataFile(relativePath: string): Promise<string> {
    try {
        const invoke = await getTauriInvoke()
        return await invoke<string>('read_data_file', { relativePath })
    } catch (error: unknown) {
        throw new Error(
            `Failed to read data file "${relativePath}": ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

/**
 * Write a file to the AlderCowork data directory.
 */
async function writeDataFile(relativePath: string, content: string): Promise<void> {
    try {
        const invoke = await getTauriInvoke()
        await invoke('write_data_file', { relativePath, content })
    } catch (error: unknown) {
        throw new Error(
            `Failed to write data file "${relativePath}": ${error instanceof Error ? error.message : String(error)}`,
        )
    }
}

export function useDataPaths() {
    return {
        /** Reactive data paths (populated after init) */
        paths: readonly(paths) as Readonly<Ref<DataPaths>>,
        /** Whether paths have been resolved */
        ready: readonly(ready),
        /** Explicitly fetch/resolve paths (call once at app init) */
        fetchPaths,
        /** Read a file from the data directory */
        readDataFile,
        /** Write a file to the data directory */
        writeDataFile,
    }
}
