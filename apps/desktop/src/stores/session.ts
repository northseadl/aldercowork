import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import type { OpencodeClient } from '@opencode-ai/sdk/v2'

// ---------------------------------------------------------------------------
// Part-centric message model — mirrors the OpenCode SDK Part union
// ---------------------------------------------------------------------------

export type PartType =
  | 'text'
  | 'reasoning'
  | 'file'
  | 'tool'
  | 'step-start'
  | 'step-finish'
  | 'snapshot'
  | 'patch'
  | 'agent'
  | 'retry'
  | 'compaction'
  | 'subtask'

export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ToolCallState {
  id: string
  name: string
  input: string
  output?: string
  status: ToolStatus
  title?: string
}

export interface TokenInfo {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export interface FileInfo {
  mime: string
  url: string
  filename?: string
}

export interface MessagePart {
  id: string
  type: PartType

  // text / reasoning
  text?: string

  // file
  file?: FileInfo

  // tool
  tool?: ToolCallState

  // step-finish
  step?: {
    reason?: string
    cost?: number
    tokens?: TokenInfo
  }

  // patch
  patch?: {
    hash: string
    files: string[]
  }

  // agent
  agent?: string

  // retry
  retry?: {
    attempt: number
    error: string
  }

  // compaction
  auto?: boolean

  // subtask
  subtask?: {
    prompt: string
    description: string
    agent: string
  }
}

export type MessageRole = 'user' | 'assistant'

export interface RichMessage {
  id: string
  role: MessageRole
  parts: MessagePart[]
  modelInfo?: { providerID: string; modelID: string }
  tokens?: TokenInfo
  cost?: number
  createdAt: string
  streaming: boolean
}

// ---------------------------------------------------------------------------
// Prompt input model
// ---------------------------------------------------------------------------

export interface FileAttachment {
  mime: string
  url: string
  filename?: string
  bytes?: number
}

/** Source metadata describing why a file part was attached (@ reference). */
export type FileReferenceSource =
  | { type: 'file'; path: string }
  | { type: 'symbol'; path: string; name: string; kind: number; range: { start: { line: number; character: number }; end: { line: number; character: number } } }
  | { type: 'resource'; clientName: string; uri: string }

export interface FileReference {
  mime: string
  url: string
  filename: string
  source: FileReferenceSource
}

/** A command/skill reference — dispatched via session.command() instead of promptAsync(). */
export interface CommandReference {
  name: string
  source: 'command' | 'mcp' | 'skill'
  template: string
}

export interface PromptInput {
  text: string
  attachments?: FileAttachment[]
  references?: FileReference[]
  /** When set, the prompt is dispatched as a command (skill) instead of a regular message. */
  commandRef?: CommandReference
  agent?: string
}

// ---------------------------------------------------------------------------
// Session summary — sidebar display model
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string
  title: string
  provider: string
  model: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<SessionSummary[]>([])
  const activeSessionId = ref('')
  const loading = ref(false)
  const creating = ref(false)
  const error = ref<string | null>(null)

  // shallowRef avoids Vue deep-proxying the SDK class (which breaks private fields)
  const client = shallowRef<OpencodeClient | null>(null)

  // Async generation guards — only the latest request can commit state.
  let loadGeneration = 0
  let createGeneration = 0

  // --- Computed ---

  const activeSession = computed(() =>
    sessions.value.find((s) => s.id === activeSessionId.value) ?? null,
  )

  const hasActiveSessions = computed(() => sessions.value.length > 0)

  // --- SDK bindings ---

  function setClient(c: unknown) {
    client.value = c as OpencodeClient | null
  }

  function normalizeErrorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  function sortSessionsByUpdatedAt(items: SessionSummary[]): SessionSummary[] {
    return [...items].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  }

  async function loadSessions() {
    const currentClient = client.value
    if (!currentClient) return

    const generation = ++loadGeneration

    loading.value = true
    error.value = null

    try {
      const result = await currentClient.session.list()
      if (generation !== loadGeneration || client.value !== currentClient) return

      const remoteSessions: SessionSummary[] = (result.data ?? []).map(mapSDKSession)
      const sorted = sortSessionsByUpdatedAt(remoteSessions)
      sessions.value = sorted

      if (activeSessionId.value && !sorted.some((s) => s.id === activeSessionId.value)) {
        activeSessionId.value = sorted[0]?.id ?? ''
      }
    } catch (e: unknown) {
      if (generation !== loadGeneration || client.value !== currentClient) return
      error.value = normalizeErrorMessage(e)
    } finally {
      if (generation === loadGeneration) {
        loading.value = false
      }
    }
  }

  async function createSession(title?: string): Promise<string> {
    const currentClient = client.value

    if (!currentClient) {
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      pushLocalSession(id, title)
      return id
    }

    const generation = ++createGeneration
    creating.value = true
    error.value = null

    try {
      const result = await currentClient.session.create({
        title: title ?? undefined,
      })
      if (generation !== createGeneration || client.value !== currentClient) {
        return activeSessionId.value
      }

      const session = result.data
      if (!session) {
        throw new Error('Session creation response is missing payload')
      }

      const summary = mapSDKSession(session)
      const withoutDuplicated = sessions.value.filter((item) => item.id !== summary.id)
      sessions.value = sortSessionsByUpdatedAt([summary, ...withoutDuplicated])
      activeSessionId.value = summary.id
      return summary.id
    } catch (e: unknown) {
      if (generation !== createGeneration || client.value !== currentClient) {
        return activeSessionId.value
      }

      error.value = normalizeErrorMessage(e)
      console.error('[session] Remote session creation failed:', e)
      return ''
    } finally {
      if (generation === createGeneration) {
        creating.value = false
      }
    }
  }

  function pushLocalSession(id: string, title?: string) {
    sessions.value = [
      {
        id,
        title: title ?? 'New Session',
        provider: '',
        model: '',
        updatedAt: new Date().toISOString(),
      },
      ...sessions.value,
    ]
    activeSessionId.value = id
  }

  function selectSession(id: string) {
    if (sessions.value.some((s) => s.id === id)) {
      activeSessionId.value = id
    }
  }

  async function ensureActiveSession(): Promise<string> {
    if (activeSessionId.value && !activeSessionId.value.startsWith('local-') && sessions.value.some((s) => s.id === activeSessionId.value)) {
      return activeSessionId.value
    }
    return createSession()
  }

  async function deleteSession(id: string) {
    const removeLocal = () => {
      sessions.value = sessions.value.filter((s) => s.id !== id)
      if (activeSessionId.value === id) {
        activeSessionId.value = sessions.value[0]?.id ?? ''
      }
    }

    if (!client.value || id.startsWith('local-')) {
      removeLocal()
      return
    }

    try {
      await client.value.session.delete({ sessionID: id })
      removeLocal()
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function renameSession(id: string, title: string) {
    const session = sessions.value.find((s) => s.id === id)
    if (!session) return
    session.title = title

    // Persist to backend (fire-and-forget from caller's perspective)
    const currentClient = client.value
    if (currentClient && !id.startsWith('local-')) {
      try {
        // Follow the same flattened convention as session.create
        const updateFn = currentClient.session.update as (opts: Record<string, unknown>) => Promise<unknown>
        await updateFn({ sessionID: id, title })
      } catch (e) {
        console.warn('[session] Failed to persist title:', e)
      }
    }
  }

  /**
   * Update title from a backend event (e.g. SSE session.updated).
   * Unlike renameSession, this does NOT call session.update — the backend
   * is already the source of truth.
   */
  function updateSessionTitle(id: string, title: string) {
    const session = sessions.value.find((s) => s.id === id)
    if (session && title) {
      session.title = title
    }
  }

  function touchSession(id: string) {
    const session = sessions.value.find((s) => s.id === id)
    if (session) {
      session.updatedAt = new Date().toISOString()
      sessions.value = sortSessionsByUpdatedAt(sessions.value)
    }
  }

  // --- Reload when client changes ---

  watch(client, (newClient) => {
    // Invalidate stale async operations from the previous client.
    loadGeneration += 1
    createGeneration += 1

    if (newClient) {
      void loadSessions()
    } else {
      loading.value = false
      creating.value = false
    }
  })

  return {
    sessions,
    activeSessionId,
    loading,
    creating,
    error,
    client,
    activeSession,
    hasActiveSessions,
    setClient,
    loadSessions,
    createSession,
    selectSession,
    ensureActiveSession,
    deleteSession,
    renameSession,
    updateSessionTitle,
    touchSession,
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSDKSession(s: Record<string, unknown>): SessionSummary {
  const time = (s.time ?? {}) as Record<string, unknown>
  const id = String(s.id ?? '')
  const title = String(s.title ?? s.slug ?? id)

  const parseTs = (v: unknown): string => {
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number' && Number.isFinite(v)) {
      const ms = v > 1_000_000_000_000 ? v : v * 1000
      return new Date(ms).toISOString()
    }
    return new Date().toISOString()
  }

  return {
    id,
    title,
    provider: String(s.providerID ?? s.provider ?? ''),
    model: String(s.modelID ?? s.model ?? ''),
    updatedAt: parseTs(s.updatedAt ?? time.updated),
  }
}
