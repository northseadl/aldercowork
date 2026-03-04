/**
 * useReference composable — @ reference resolution engine.
 *
 * Handles file and symbol searching via the OpenCode SDK,
 * returning candidates as structured FileReference objects
 * that can be attached to prompt parts.
 */
import { computed, ref, watch, type Ref } from 'vue'

import type { CommandReference, FileReference, FileReferenceSource } from '../stores/session'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReferenceCategory = 'file' | 'symbol' | 'command'

export interface ReferenceCandidate {
    category: ReferenceCategory
    label: string
    detail: string
    /** Unique key for deduplication and selection */
    key: string
    // Internal data for resolution
    _path?: string
    _symbol?: { name: string; kind: number; range: { start: { line: number; character: number }; end: { line: number; character: number } } }
    _command?: { name: string; source?: string; template: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a plausible MIME from a file path. */
function mimeFromPath(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
        ts: 'text/typescript', tsx: 'text/typescript',
        js: 'text/javascript', jsx: 'text/javascript',
        vue: 'text/x-vue', svelte: 'text/x-svelte',
        json: 'application/json', yaml: 'text/yaml', yml: 'text/yaml',
        md: 'text/markdown', txt: 'text/plain',
        rs: 'text/x-rust', go: 'text/x-go', py: 'text/x-python',
        css: 'text/css', html: 'text/html', xml: 'text/xml',
        sh: 'text/x-sh', toml: 'text/toml',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    }
    return map[ext ?? ''] ?? 'text/plain'
}

/** Extract filename from path */
function basename(path: string): string {
    return path.split('/').pop() ?? path
}

/** Safe record accessor */
function asRecord(v: unknown): Record<string, unknown> {
    return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function sourceIdentity(source: FileReferenceSource): string {
    if (source.type === 'file') {
        return `file:${source.path}`
    }
    if (source.type === 'symbol') {
        return `symbol:${source.path}:${source.name}:${source.range.start.line}:${source.range.start.character}:${source.range.end.line}:${source.range.end.character}`
    }
    return `resource:${source.clientName}:${source.uri}`
}

function candidateIdentity(candidate: ReferenceCandidate): string | null {
    if (candidate.category === 'file') {
        return `file:${candidate._path ?? ''}`
    }
    if (candidate.category === 'symbol' && candidate._symbol) {
        const r = candidate._symbol.range
        return `symbol:${candidate._path ?? ''}:${candidate._symbol.name}:${r.start.line}:${r.start.character}:${r.end.line}:${r.end.character}`
    }
    return null
}

// LSP SymbolKind → human label
const SYMBOL_KIND_LABELS: Record<number, string> = {
    1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
    6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
    11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant',
    15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object',
    20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
    25: 'Operator', 26: 'TypeParameter',
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

const MAX_CANDIDATES = 20
const SEARCH_DEBOUNCE_MS = 200

export function useReference(client: Ref<unknown>) {
    const query = ref('')
    const isOpen = ref(false)
    const isSearching = ref(false)
    const candidates = ref<ReferenceCandidate[]>([])
    const selectedIndex = ref(0)
    const pendingReferences = ref<FileReference[]>([])
    const pendingCommand = ref<CommandReference | null>(null)

    let searchTimer: ReturnType<typeof setTimeout> | null = null
    let searchGeneration = 0

    /**
     * Open the popover and start searching when query changes.
     */
    function open(initialQuery = '') {
        query.value = initialQuery
        isOpen.value = true
        selectedIndex.value = 0
        if (initialQuery) {
            debouncedSearch()
        } else {
            candidates.value = []
        }
    }

    function close() {
        isOpen.value = false
        query.value = ''
        candidates.value = []
        selectedIndex.value = 0
        if (searchTimer) {
            clearTimeout(searchTimer)
            searchTimer = null
        }
    }

    function updateQuery(q: string) {
        query.value = q
        selectedIndex.value = 0
        debouncedSearch()
    }

    function debouncedSearch() {
        if (searchTimer) clearTimeout(searchTimer)
        searchTimer = setTimeout(() => { void performSearch() }, SEARCH_DEBOUNCE_MS)
    }

    async function performSearch() {
        const c = client.value as Record<string, unknown> | null
        const q = query.value.trim()
        if (!c || !q) {
            candidates.value = []
            isSearching.value = false
            return
        }

        const generation = ++searchGeneration
        isSearching.value = true

        try {
            const results: ReferenceCandidate[] = []

            // Parallel search: files + symbols + commands (skills)
            const findNs = asRecord(c.find)
            const commandNs = asRecord(c.command)
            const [fileResults, symbolResults, commandResults] = await Promise.allSettled([
                typeof findNs.files === 'function'
                    ? (findNs.files as (params: unknown) => Promise<unknown>)({ query: q, limit: MAX_CANDIDATES })
                    : Promise.resolve(null),
                typeof findNs.symbols === 'function'
                    ? (findNs.symbols as (params: unknown) => Promise<unknown>)({ query: q })
                    : Promise.resolve(null),
                typeof commandNs.list === 'function'
                    ? (commandNs.list as (params?: unknown) => Promise<unknown>)()
                    : Promise.resolve(null),
            ])

            if (generation !== searchGeneration) return

            // Process file results
            if (fileResults.status === 'fulfilled' && fileResults.value) {
                const fResult = asRecord(fileResults.value)
                const files = Array.isArray(fResult.data) ? fResult.data : Array.isArray(fileResults.value) ? fileResults.value : []
                for (const item of files) {
                    const path = typeof item === 'string' ? item : String(asRecord(item).path ?? '')
                    if (!path) continue
                    results.push({
                        category: 'file',
                        label: basename(path),
                        detail: path,
                        key: `file:${path}`,
                        _path: path,
                    })
                }
            }

            // Process symbol results
            if (symbolResults.status === 'fulfilled' && symbolResults.value) {
                const sResult = asRecord(symbolResults.value)
                const symbols = Array.isArray(sResult.data) ? sResult.data : Array.isArray(symbolResults.value) ? symbolResults.value : []
                for (const item of symbols) {
                    const sym = asRecord(item)
                    const name = String(sym.name ?? '')
                    const kind = Number(sym.kind) || 0
                    const loc = asRecord(sym.location)
                    const uri = String(loc.uri ?? '')
                    const range = asRecord(loc.range)
                    const rStart = asRecord(range.start)
                    const rEnd = asRecord(range.end)
                    if (!name) continue

                    const path = uri.replace(/^file:\/\//, '')
                    const kindLabel = SYMBOL_KIND_LABELS[kind] ?? 'Symbol'
                    results.push({
                        category: 'symbol',
                        label: name,
                        detail: `${kindLabel} · ${basename(path)}`,
                        key: `symbol:${path}:${name}:${rStart.line ?? 0}`,
                        _path: path,
                        _symbol: {
                            name,
                            kind,
                            range: {
                                start: { line: Number(rStart.line) || 0, character: Number(rStart.character) || 0 },
                                end: { line: Number(rEnd.line) || 0, character: Number(rEnd.character) || 0 },
                            },
                        },
                    })
                }
            }

            // Process command/skill results — filter by query match
            if (commandResults.status === 'fulfilled' && commandResults.value) {
                const cResult = asRecord(commandResults.value)
                const commands = Array.isArray(cResult.data) ? cResult.data : Array.isArray(commandResults.value) ? commandResults.value : []
                const lowerQ = q.toLowerCase()
                for (const item of commands) {
                    const cmd = asRecord(item)
                    const name = String(cmd.name ?? '')
                    const description = String(cmd.description ?? '')
                    const source = String(cmd.source ?? 'command')
                    const template = String(cmd.template ?? '')
                    const hints = Array.isArray(cmd.hints) ? cmd.hints.map(String) : []
                    if (!name) continue

                    // Match against name, description, and hints
                    const searchable = [name, description, ...hints].join(' ').toLowerCase()
                    if (!searchable.includes(lowerQ)) continue

                    const sourceLabel = source === 'skill' ? 'Skill' : source === 'mcp' ? 'MCP' : 'Command'
                    results.push({
                        category: 'command',
                        label: name,
                        detail: description ? `${sourceLabel} · ${description}` : sourceLabel,
                        key: `command:${name}`,
                        _command: { name, source, template },
                    })
                }
            }

            if (generation !== searchGeneration) return
            // Sort: commands (skills) first when they match, then files, then symbols
            results.sort((a, b) => {
                const order: Record<ReferenceCategory, number> = { command: 0, file: 1, symbol: 2 }
                return (order[a.category] ?? 99) - (order[b.category] ?? 99)
            })
            candidates.value = results.slice(0, MAX_CANDIDATES)
        } catch (error) {
            if (generation !== searchGeneration) return
            console.warn('[useReference] Search failed:', error)
            candidates.value = []
        } finally {
            if (generation === searchGeneration) {
                isSearching.value = false
            }
        }
    }

    /**
     * Select a candidate and convert it to the appropriate reference type.
     */
    function selectCandidate(candidate: ReferenceCandidate) {
        // Handle command/skill selection — replaces any existing command
        if (candidate.category === 'command' && candidate._command) {
            pendingCommand.value = {
                name: candidate._command.name,
                source: (candidate._command.source as CommandReference['source']) ?? 'command',
                template: candidate._command.template,
            }
            close()
            return
        }

        // Deduplicate file/symbol references by source identity.
        const targetIdentity = candidateIdentity(candidate)
        if (!targetIdentity) return
        if (pendingReferences.value.some((r) => sourceIdentity(r.source) === targetIdentity)) return

        let source: FileReferenceSource
        if (candidate.category === 'file') {
            source = { type: 'file', path: candidate._path ?? '' }
        } else if (candidate.category === 'symbol' && candidate._symbol) {
            source = {
                type: 'symbol',
                path: candidate._path ?? '',
                name: candidate._symbol.name,
                kind: candidate._symbol.kind,
                range: candidate._symbol.range,
            }
        } else {
            return
        }

        const ref: FileReference = {
            mime: mimeFromPath(candidate._path ?? ''),
            url: '',
            filename: candidate._path ?? candidate.label,
            source,
        }

        pendingReferences.value = [...pendingReferences.value, ref]
        close()
    }

    function selectByIndex(index?: number) {
        const idx = index ?? selectedIndex.value
        const candidate = candidates.value[idx]
        if (candidate) selectCandidate(candidate)
    }

    function removeReference(index: number) {
        const next = [...pendingReferences.value]
        next.splice(index, 1)
        pendingReferences.value = next
    }

    function clearCommand() {
        pendingCommand.value = null
    }

    function clearReferences() {
        pendingReferences.value = []
        pendingCommand.value = null
    }

    // Keyboard nav
    function moveSelection(delta: number) {
        const len = candidates.value.length
        if (len === 0) return
        selectedIndex.value = (selectedIndex.value + delta + len) % len
    }

    // Cleanup on query change when popover is closed
    watch(isOpen, (open) => {
        if (!open && searchTimer) {
            clearTimeout(searchTimer)
            searchTimer = null
        }
    })

    const hasReferences = computed(() => pendingReferences.value.length > 0)
    const hasCommand = computed(() => pendingCommand.value !== null)

    return {
        // State
        query,
        isOpen,
        isSearching,
        candidates,
        selectedIndex,
        pendingReferences,
        pendingCommand,
        hasReferences,
        hasCommand,
        // Actions
        open,
        close,
        updateQuery,
        selectCandidate,
        selectByIndex,
        removeReference,
        clearCommand,
        clearReferences,
        moveSelection,
    }
}
