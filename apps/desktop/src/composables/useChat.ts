/**
 * useChat composable — thin Vue wrapper over the stream engine.
 *
 * All SSE processing logic lives in services/stream/.
 * This composable only owns:
 *   - Reactive message list
 *   - Send/cancel lifecycle
 *   - Session message loading
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue'

import type {
  FileReference,
  MessagePart,
  PartType,
  PromptInput,
  RichMessage,
  TokenInfo,
} from '../stores/session'
import type {
  FileDiffRecord,
  FileOutcome,
  SessionArtifactSummary,
  TurnArtifactSummary,
} from '../types/artifacts'

import {
  type PermissionResolver,
  type StreamState,
  asRecord,
  asString,
  consumeEventStream,
  createStreamState,
  isAbortError,
  nextId,
  normalizeError,
  nowISO,
  parseToolFromPart,
} from '../services/stream'
import { createEmptySessionArtifactSummary } from '../types/artifacts'
import {
  buildSessionArtifactSummary,
  captureArtifactBaseline,
  createOutcomeFromDiff,
  createProcessingOutcome,
  extractAttachmentOutcomes,
  extractToolAttachmentOutcomes,
  mergeOutcomes,
  parseFileDiffRecord,
  resolveTurnArtifacts,
} from '../services/stream/artifact-tracker'

// Re-export types consumers need
export type { PermissionDecision, PermissionRequest, PermissionResolver } from '../services/stream'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STREAM_RECONNECT_MAX_ATTEMPTS = 4
const STREAM_RECONNECT_BASE_DELAY_MS = 250
const STREAM_CLOSE_BEFORE_COMPLETION_ERROR = 'Event stream closed before session completion'

function normalizeNonEmpty(v: string | null | undefined): string | null {
  if (!v) return null
  const t = v.trim()
  return t || null
}

function pickErrorMessage(source: unknown): string | null {
  const rec = asRecord(source)
  const direct = normalizeNonEmpty(asString(rec.message) ?? asString(rec.detail))
  if (direct) return direct

  const data = asRecord(rec.data)
  const fromData = normalizeNonEmpty(asString(data.message) ?? asString(data.detail))
  if (fromData) return fromData

  const firstErrorList = Array.isArray(rec.error) ? rec.error : Array.isArray(data.error) ? data.error : []
  for (const item of firstErrorList) {
    const msg = normalizeNonEmpty(asString(asRecord(item).message))
    if (msg) return msg
  }

  return null
}

function extractSdkErrorMessage(source: unknown, fallback: string): string {
  return pickErrorMessage(source) ?? fallback
}

function isUnexpectedStreamCloseError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(STREAM_CLOSE_BEFORE_COMPLETION_ERROR)
}

async function waitAbortable(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException('Operation aborted', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Operation aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

// ---------------------------------------------------------------------------
// Reconcile helper
// ---------------------------------------------------------------------------

async function reconcileAssistantMessage(
  client: Record<string, unknown>,
  sessionId: string,
  aiMsg: RichMessage,
): Promise<string | null> {
  try {
    const sessionNs = asRecord(client.session)
    if (typeof sessionNs.messages !== 'function') return null
    const result = asRecord(await (sessionNs.messages as (opts: unknown) => Promise<unknown>)({
      sessionID: sessionId,
    }))
    if (result.error) return null
    const rawMessages = Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : []
    const latestUserMessageId = [...rawMessages]
      .reverse()
      .map((item) => asRecord(item.info))
      .find((item) => asString(item.role) === 'user')
    const lastUserId = latestUserMessageId ? asString(latestUserMessageId.id) ?? null : null

    const assistants = rawMessages.filter((m) => asString(asRecord(m.info).role) === 'assistant')
    if (!assistants.length) return lastUserId

    const target = assistants[assistants.length - 1]
    const mapped = mapRemoteMessage(target)

    // Merge strategy: supplement metadata, but PRESERVE streaming parts.
    // Streaming parts include reasoning, tool calls, and other process data
    // that backends may strip from stored messages.
    aiMsg.id = mapped.id
    if (mapped.modelInfo) aiMsg.modelInfo = mapped.modelInfo
    if (mapped.createdAt) aiMsg.createdAt = mapped.createdAt
    if (mapped.tokens) aiMsg.tokens = mapped.tokens
    if (mapped.cost !== undefined) aiMsg.cost = mapped.cost

    // Only replace parts if streaming produced nothing useful
    const hasStreamContent = aiMsg.parts.some((p) => p.type === 'text' && p.text?.trim())
    if (!hasStreamContent && mapped.parts.length > 0) {
      aiMsg.parts = mapped.parts
    }
    return lastUserId
  } catch (e: unknown) {
    console.warn('[useChat] reconcile failed (best effort):', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export type SessionStatusType = 'idle' | 'busy' | 'rate_limited' | 'error' | null

export function useChat(
  client: Ref<unknown>,
  sessionId: Ref<string>,
  /** Reactive variant (thinking depth) from ModelPicker. null = no variant. */
  variant?: Ref<string | null>,
  permissionResolver?: PermissionResolver,
  /** Called when backend emits session.updated (e.g. auto-generated title). */
  onSessionUpdate?: (sessionId: string, title: string) => void,
) {
  const messages = ref<RichMessage[]>([])
  const isStreaming = ref(false)
  const streamError = ref<string | null>(null)
  const sessionStatus = ref<SessionStatusType>(null)
  const turnArtifacts = ref<Record<string, TurnArtifactSummary>>({})
  const sessionArtifacts = ref<SessionArtifactSummary>(createEmptySessionArtifactSummary())
  const latestCompletedTurnId = ref<string | null>(null)
  const restoredSessionFiles = ref<FileOutcome[]>([])

  let activeAbort: AbortController | null = null
  let activeStreamSessionId: string | null = null
  let activeStreamClient: Record<string, unknown> | null = null
  let activeStreamDone: Promise<void> | null = null
  let pendingReloadSessionId: string | null = null
  let streamRevision = 0
  let sessionSwitchRevision = 0
  let cancelRequested = false
  let alive = true
  let artifactLoadGeneration = 0

  // ---------------------------------------------------------------------------
  // Frame-paced commit scheduler
  // ---------------------------------------------------------------------------

  let commitRafId: number | null = null
  let commitFallbackTimer: number | null = null
  let pendingCommitResolvers: Array<() => void> = []
  let lastFlushTime = 0
  const COMMIT_INTERVAL_MS = 32
  const COMMIT_FALLBACK_MS = 64

  // Dispose guard: abort streams and disarm commit on scope teardown
  onScopeDispose(() => {
    alive = false
    pendingReloadSessionId = null
    streamRevision += 1
    activeAbort?.abort()
    activeAbort = null
    if (commitRafId !== null) {
      cancelAnimationFrame(commitRafId)
      commitRafId = null
    }
    if (commitFallbackTimer !== null) {
      window.clearTimeout(commitFallbackTimer)
      commitFallbackTimer = null
    }
    const resolvers = pendingCommitResolvers
    pendingCommitResolvers = []
    for (const resolve of resolvers) resolve()
  })

  function rebuildSessionArtifacts(error: string | null = sessionArtifacts.value.error ?? null) {
    sessionArtifacts.value = buildSessionArtifactSummary(
      restoredSessionFiles.value,
      turnArtifacts.value,
      error,
    )
  }

  function resetArtifactState() {
    turnArtifacts.value = {}
    restoredSessionFiles.value = []
    latestCompletedTurnId.value = null
    sessionArtifacts.value = createEmptySessionArtifactSummary()
  }

  function setArtifactError(error: string | null) {
    rebuildSessionArtifacts(error)
  }

  function replaceTurnArtifacts(turnId: string, messageId: string, files: FileOutcome[], completed: boolean) {
    const current = turnArtifacts.value[turnId]
    turnArtifacts.value = {
      ...turnArtifacts.value,
      [turnId]: {
        turnId,
        messageId,
        files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
        completed,
        updatedAt: files[0]?.updatedAt ?? current?.updatedAt ?? nowISO(),
      },
    }
    if (completed) {
      latestCompletedTurnId.value = turnId
    }
    rebuildSessionArtifacts()
  }

  function upsertTurnArtifact(turnId: string, messageId: string, outcome: FileOutcome) {
    const current = turnArtifacts.value[turnId]
    const nextFiles = [...(current?.files ?? [])]
    const index = nextFiles.findIndex((item) => item.path === outcome.path)
    if (index >= 0) {
      nextFiles[index] = mergeOutcomes(nextFiles[index], outcome)
    } else {
      nextFiles.push(mergeOutcomes(undefined, outcome))
    }

    turnArtifacts.value = {
      ...turnArtifacts.value,
      [turnId]: {
        turnId,
        messageId,
        files: nextFiles.sort((a, b) => a.path.localeCompare(b.path)),
        completed: current?.completed ?? false,
        updatedAt: outcome.updatedAt,
      },
    }
    rebuildSessionArtifacts()
  }

  function completeTurnArtifacts(turnId: string, messageId: string) {
    const current = turnArtifacts.value[turnId]
    if (!current) return

    replaceTurnArtifacts(
      turnId,
      messageId,
      current.files.map((file) => ({ ...file, messageId, live: false })),
      true,
    )
  }

  function syncTurnMessageId(turnId: string, messageId: string) {
    const current = turnArtifacts.value[turnId]
    if (!current || current.messageId === messageId) return

    turnArtifacts.value = {
      ...turnArtifacts.value,
      [turnId]: {
        ...current,
        messageId,
        files: current.files.map((file) => ({ ...file, messageId })),
      },
    }
    rebuildSessionArtifacts()
  }

  async function loadSessionArtifacts(targetSid: string, loadToken: number) {
    const c = client.value
    if (!c || !targetSid || targetSid.startsWith('local-')) {
      restoredSessionFiles.value = []
      rebuildSessionArtifacts()
      return
    }

    try {
      const sessionNs = asRecord(asRecord(c).session)
      if (typeof sessionNs.get !== 'function') {
        restoredSessionFiles.value = []
        rebuildSessionArtifacts()
        return
      }
      const rawResult = await (sessionNs.get as (opts: unknown) => Promise<unknown>)({
        sessionID: targetSid,
      })
      if (loadToken !== artifactLoadGeneration) return
      if (sessionId.value !== targetSid) return

      const result = asRecord(rawResult)
      if (result.error) {
        throw new Error(extractSdkErrorMessage(result.error, 'Failed to load session artifacts'))
      }
      const data = asRecord(result.data ?? rawResult)
      const summary = asRecord(data.summary)
      const restoredDiffs = Array.isArray(summary.diffs)
        ? summary.diffs
            .map(parseFileDiffRecord)
            .filter((item): item is FileDiffRecord => item !== null)
        : []

      restoredSessionFiles.value = restoredDiffs.map((diff) =>
        createOutcomeFromDiff(diff, `session:${targetSid}`, `session:${targetSid}`, 'summary'),
      )
      rebuildSessionArtifacts()
    } catch (error: unknown) {
      if (loadToken !== artifactLoadGeneration) return
      if (sessionId.value !== targetSid) return
      restoredSessionFiles.value = []
      setArtifactError(normalizeError(error))
    }
  }

  /**
   * Called by the consumer at each render-worthy point via `await commit()`.
   * Internally schedules at most ~30fps and yields to the browser event loop
   * so a paint can happen. The consumer awaiting commit provides backpressure,
   * preventing event bursts from starving rendering.
   */

  // Zero-delay yield via MessageChannel (avoids setTimeout's 4ms minimum)
  const yieldToMain = (): Promise<void> =>
    new Promise((resolve) => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => resolve()
      ch.port2.postMessage(undefined)
    })

  const resolvePendingCommits = () => {
    const resolvers = pendingCommitResolvers
    pendingCommitResolvers = []
    for (const resolve of resolvers) resolve()
  }

  const flushCommit = (now: number) => {
    if (commitRafId !== null) {
      cancelAnimationFrame(commitRafId)
      commitRafId = null
    }
    if (commitFallbackTimer !== null) {
      window.clearTimeout(commitFallbackTimer)
      commitFallbackTimer = null
    }
    if (!alive) {
      resolvePendingCommits()
      return
    }

    if (now - lastFlushTime < COMMIT_INTERVAL_MS) {
      commitRafId = requestAnimationFrame(flushCommit)
      if (commitFallbackTimer === null) {
        commitFallbackTimer = window.setTimeout(() => flushCommit(performance.now()), COMMIT_FALLBACK_MS)
      }
      return
    }

    lastFlushTime = now
    const resolvers = pendingCommitResolvers
    pendingCommitResolvers = []
    messages.value = [...messages.value]
    void yieldToMain().then(() => { for (const resolve of resolvers) resolve() })
  }

  const commit = (): Promise<void> => {
    if (!alive) return Promise.resolve()
    if (commitRafId === null) {
      commitRafId = requestAnimationFrame(flushCommit)
      if (commitFallbackTimer === null) {
        commitFallbackTimer = window.setTimeout(() => flushCommit(performance.now()), COMMIT_FALLBACK_MS)
      }
    }
    return new Promise((resolve) => pendingCommitResolvers.push(resolve))
  }
  const commitSync = () => { if (alive) messages.value = [...messages.value] }

  // Stale-request guard: prevents loadMessages from overwriting messages pushed by send()
  let loadGeneration = 0

  async function loadMessages(targetSid: string = sessionId.value) {
    const c = client.value
    const sid = targetSid
    if (!c || !sid || sid.startsWith('local-')) { messages.value = []; return }
    if (isStreaming.value && sid === activeStreamSessionId) return

    const thisGen = ++loadGeneration
    artifactLoadGeneration += 1
    const artifactGen = artifactLoadGeneration

    try {
      const sessionNs = asRecord(asRecord(c).session)
      if (typeof sessionNs.messages !== 'function') return
      const rawArgs = await (sessionNs.messages as (opts: unknown) => Promise<unknown>)({
        sessionID: sid,
      })
      if (thisGen !== loadGeneration) return
      if (sessionId.value !== sid) return
      if (isStreaming.value && sid === activeStreamSessionId) return

      const result = asRecord(rawArgs)
      if (result.error) {
        throw new Error(extractSdkErrorMessage(result.error, 'Failed to load session messages'))
      }
      const raw = Array.isArray(rawArgs)
        ? (rawArgs as Array<Record<string, unknown>>)
        : Array.isArray(result.data)
          ? (result.data as Array<Record<string, unknown>>)
          : []
      messages.value = raw.map(mapRemoteMessage)
      turnArtifacts.value = {}
      restoredSessionFiles.value = []
      latestCompletedTurnId.value = null
      sessionArtifacts.value = createEmptySessionArtifactSummary()
      await loadSessionArtifacts(sid, artifactGen)
    } catch (error: unknown) {
      if (thisGen !== loadGeneration) return
      if (sessionId.value !== sid) return
      if (isStreaming.value && sid === activeStreamSessionId) return
      streamError.value = normalizeError(error)
      turnArtifacts.value = {}
      restoredSessionFiles.value = []
      setArtifactError(normalizeError(error))
    }
  }

  async function abortActiveRemoteSession(): Promise<void> {
    const c = activeStreamClient
    const sid = activeStreamSessionId
    if (!c || !sid || sid.startsWith('local-')) return
    const sessionNs = asRecord(c.session)
    if (typeof sessionNs.abort !== 'function') return

    try {
      await (sessionNs.abort as (opts: unknown) => Promise<unknown>)({ sessionID: sid })
    } catch (error: unknown) {
      console.warn('[useChat] session.abort failed:', error)
    }
  }

  async function cancelStreamInternal(waitForClose: boolean): Promise<void> {
    if (!activeAbort && !activeStreamDone) return
    cancelRequested = true
    if (activeAbort && !activeAbort.signal.aborted) {
      activeAbort.abort()
    }
    await abortActiveRemoteSession()
    if (waitForClose && activeStreamDone) {
      await activeStreamDone.catch(() => undefined)
    }
  }

  async function runSend(input: PromptInput, text: string): Promise<void> {
    // Build prompt parts for SDK
    const promptParts: Array<Record<string, unknown>> = []
    if (input.attachments?.length) {
      for (const att of input.attachments) {
        promptParts.push({ type: 'file', mime: att.mime, url: att.url, filename: att.filename })
      }
    }
    // @ references → file parts with source metadata
    if (input.references?.length) {
      for (const ref of input.references) {
        const srcRaw = ref.source
        let source: Record<string, unknown> | undefined
        if (srcRaw.type === 'file') {
          source = { type: 'file', path: srcRaw.path, text: { value: '', start: 0, end: 0 } }
        } else if (srcRaw.type === 'symbol') {
          source = { type: 'symbol', path: srcRaw.path, name: srcRaw.name, kind: srcRaw.kind, range: srcRaw.range, text: { value: '', start: 0, end: 0 } }
        } else if (srcRaw.type === 'resource') {
          source = { type: 'resource', clientName: srcRaw.clientName, uri: srcRaw.uri, text: { value: '', start: 0, end: 0 } }
        }
        promptParts.push({ type: 'file', mime: ref.mime, url: ref.url, filename: ref.filename, source })
      }
    }
    if (text) promptParts.push({ type: 'text', text })
    if (input.agent) promptParts.push({ type: 'agent', name: input.agent })

    // Build user message
    const userParts: MessagePart[] = []
    if (text) userParts.push({ id: nextId(), type: 'text', text })
    if (input.attachments?.length) {
      for (const att of input.attachments) {
        userParts.push({ id: nextId(), type: 'file', file: { mime: att.mime, url: att.url, filename: att.filename } })
      }
    }
    if (input.references?.length) {
      for (const ref of input.references) {
        userParts.push({ id: nextId(), type: 'file', file: { mime: ref.mime, url: ref.url, filename: ref.filename } })
      }
    }
    if (input.commandRef) {
      userParts.push({ id: nextId(), type: 'command', command: { name: input.commandRef.name, source: input.commandRef.source } })
    }

    const turnId = nextId()
    const userMsg: RichMessage = {
      id: nextId(), turnId, role: 'user', parts: userParts, createdAt: nowISO(), streaming: false,
    }
    const aiMsg: RichMessage = {
      id: nextId(), turnId, role: 'assistant', parts: [], createdAt: nowISO(), streaming: true,
    }

    messages.value = [...messages.value, userMsg, aiMsg]
    isStreaming.value = true
    cancelRequested = false

    const currentClient = client.value as Record<string, unknown> | null
    const currentSid = sessionId.value

    if (!currentClient) {
      aiMsg.parts = [{ id: nextId(), type: 'text', text: 'Engine is not ready. Please wait for it to start.' }]
      aiMsg.streaming = false
      isStreaming.value = false
      commitSync()
      return
    }

    if (!currentSid || currentSid.startsWith('local-')) {
      aiMsg.parts = [{ id: nextId(), type: 'text', text: 'No active session. Please try again.' }]
      aiMsg.streaming = false
      isStreaming.value = false
      commitSync()
      return
    }

    const abortCtl = new AbortController()
    const streamToken = ++streamRevision
    const canCommitCurrentSession = () => alive && streamToken === streamRevision && sessionId.value === currentSid
    const guardedCommit = async (): Promise<void> => { if (canCommitCurrentSession()) await commit() }
    const guardedCommitSync = () => { if (canCommitCurrentSession()) commitSync() }
    activeAbort = abortCtl
    activeStreamSessionId = currentSid
    activeStreamClient = currentClient
    let promptAccepted = false
    const artifactBaseline = await captureArtifactBaseline(currentClient)
    const streamState: StreamState = createStreamState()
    let finalizedArtifacts = false
    let resolvedUserMessageId: string | null = null

    const finalizeArtifacts = async () => {
      if (finalizedArtifacts || !promptAccepted) return

      try {
        const attachmentFiles = extractAttachmentOutcomes(aiMsg.parts, turnId, aiMsg.id)
        const liveFiles = turnArtifacts.value[turnId]?.files ?? []
        const resolved = await resolveTurnArtifacts({
          client: currentClient,
          sessionId: currentSid,
          turnId,
          messageId: aiMsg.id,
          userMessageId: streamState.latestUserMessageId ?? resolvedUserMessageId,
          baseline: artifactBaseline,
          liveFiles,
          attachmentFiles,
        })

        if (resolved.files.length > 0) {
          replaceTurnArtifacts(turnId, aiMsg.id, resolved.files, true)
          setArtifactError(null)
        } else if (liveFiles.length > 0) {
          completeTurnArtifacts(turnId, aiMsg.id)
          setArtifactError(null)
        } else if (resolved.warnings.length > 0) {
          setArtifactError(resolved.warnings.join(' | '))
        } else {
          setArtifactError(null)
        }

        if (resolved.warnings.length > 0 && resolved.files.length > 0) {
          console.warn('[useChat] artifact fallbacks used:', resolved.warnings)
        }
        finalizedArtifacts = true
      } catch (error) {
        finalizedArtifacts = false
        throw error
      }
    }

    try {
      const currentVariant = variant?.value ?? null

      const eventNs = asRecord(currentClient.event)
      if (typeof eventNs.subscribe !== 'function') throw new Error('SDK client missing event.subscribe()')
      let lastEventId: string | null = null

      const subscribeEventStream = async (attemptLabel: string): Promise<AsyncGenerator<unknown>> => {
        const options: Record<string, unknown> = {
          signal: abortCtl.signal,
          onSseEvent: (evt: unknown) => {
            const evtId = asString(asRecord(evt).id)
            if (evtId) lastEventId = evtId
          },
        }
        if (lastEventId) {
          options.headers = { 'Last-Event-ID': lastEventId }
        }


        const subResult = await (eventNs.subscribe as (params?: unknown, options?: unknown) => Promise<unknown>)(undefined, options)
        const sub = asRecord(subResult)

        if (sub.error) {
          const errData = asRecord(sub.error)
          throw new Error(asString(errData.message) ?? 'Failed to subscribe to event stream')
        }
        const stream = sub.stream ?? asRecord(sub.data).stream ?? subResult
        if (!stream) throw new Error('event.subscribe() returned no stream')
        if (typeof stream !== 'object' || stream === null || !(Symbol.asyncIterator in stream)) {
          throw new Error('event.subscribe() returned a non-async stream')
        }

        return stream as AsyncGenerator<unknown>
      }

      const consumeWithReconnect = async (): Promise<string | null> => {
        let stream = await subscribeEventStream('initial')
        let reconnectAttempt = 0

        while (true) {
          try {
            return await consumeEventStream(
              stream,
              currentClient,
              currentSid,
              aiMsg,
              streamState,
              guardedCommit,
              permissionResolver,
              (status) => {
                if (!canCommitCurrentSession()) return
                const mapped = status === 'idle' || status === 'busy' || status === 'rate_limited' || status === 'error'
                  ? status : null
                sessionStatus.value = mapped as SessionStatusType
              },
              onSessionUpdate,
              (path, sid) => {
                if (sid !== currentSid || !canCommitCurrentSession()) return
                setArtifactError(null)
                upsertTurnArtifact(turnId, aiMsg.id, createProcessingOutcome(path, turnId, aiMsg.id))
              },
              (sid, diff) => {
                if (sid !== currentSid || !canCommitCurrentSession()) return
                setArtifactError(null)
                for (const item of diff) {
                  upsertTurnArtifact(turnId, aiMsg.id, createOutcomeFromDiff(item, turnId, aiMsg.id, 'diff'))
                }
              },
              (sid, assistantMessageId, tool) => {
                if (sid !== currentSid || !canCommitCurrentSession()) return
                for (const outcome of extractToolAttachmentOutcomes(tool, turnId, assistantMessageId)) {
                  upsertTurnArtifact(turnId, assistantMessageId, outcome)
                }
              },
              (sid, assistantMessageId) => {
                if (sid !== currentSid || !canCommitCurrentSession()) return
                if (!assistantMessageId) return
                syncTurnMessageId(turnId, assistantMessageId)
              },
            )
          } catch (error: unknown) {
            if (abortCtl.signal.aborted || isAbortError(error)) throw error
            if (!isUnexpectedStreamCloseError(error)) throw error
            if (reconnectAttempt >= STREAM_RECONNECT_MAX_ATTEMPTS) {
              throw new Error(`${STREAM_CLOSE_BEFORE_COMPLETION_ERROR} (reconnect exhausted after ${STREAM_RECONNECT_MAX_ATTEMPTS + 1} attempts)`)
            }
            reconnectAttempt += 1
            const backoff = Math.min(STREAM_RECONNECT_BASE_DELAY_MS * (2 ** (reconnectAttempt - 1)), 2_000)
            console.warn('[useChat:debug] stream closed unexpectedly; reconnecting', {
              attempt: reconnectAttempt,
              max: STREAM_RECONNECT_MAX_ATTEMPTS,
              backoff,
              lastEventId,
            })
            await waitAbortable(backoff, abortCtl.signal)
            stream = await subscribeEventStream(`reconnect-${reconnectAttempt}`)
          }
        }
      }

      // Start consuming events
      const streamConsumer = consumeWithReconnect()
      const streamConsumerTask = streamConsumer
      // Attach a handler immediately to prevent transient unhandledrejection before awaited joins.
      void streamConsumerTask.catch(() => undefined)

      // Fire the prompt or command.
      // IMPORTANT: promptDispatched MUST be set AFTER the HTTP call returns
      // to prevent the SSE consumer from processing stale session events
      // (e.g. previous assistant messages) while the request is in flight.
      const sessionNs = asRecord(currentClient.session)

      if (input.commandRef) {
        // Command/skill dispatch via session.command()
        if (typeof sessionNs.command !== 'function') throw new Error('SDK client missing session.command()')
        const commandPayload: Record<string, unknown> = {
          sessionID: currentSid,
          command: input.commandRef.name,
          arguments: text || undefined,
        }
        if (promptParts.some((p) => p.type === 'file')) {
          commandPayload.parts = promptParts.filter((p) => p.type === 'file')
        }
        if (currentVariant) commandPayload.variant = currentVariant

        const cmdResult = await (sessionNs.command as (params: unknown, options?: unknown) => Promise<unknown>)(
          commandPayload, { signal: abortCtl.signal },
        )
        const cmdRec = asRecord(cmdResult)
        if (cmdRec.error) {
          throw new Error(extractSdkErrorMessage(cmdRec.error, 'Command request failed'))
        }
      } else {
        // Regular prompt dispatch via session.promptAsync()
        if (typeof sessionNs.promptAsync !== 'function') throw new Error('SDK client missing session.promptAsync()')
        const promptPayload: Record<string, unknown> = {
          sessionID: currentSid,
          parts: promptParts,
        }
        // Model comes from config.json global `model` — no need to pass in body.
        // Variant (thinking depth) is passed if the user selected one.
        if (currentVariant) promptPayload.variant = currentVariant

        const promptResult = await (sessionNs.promptAsync as (params: unknown, options?: unknown) => Promise<unknown>)(
          promptPayload, { signal: abortCtl.signal },
        )
        const promptRec = asRecord(promptResult)
        if (promptRec.error) {
          throw new Error(extractSdkErrorMessage(promptRec.error, 'Prompt request failed'))
        }
      }
      // Now the backend has accepted our request — safe to process SSE events
      streamState.promptDispatched = true
      promptAccepted = true
      streamState.completionArmed = true

      await streamConsumerTask

      resolvedUserMessageId = await reconcileAssistantMessage(currentClient, currentSid, aiMsg)
      syncTurnMessageId(turnId, aiMsg.id)
      await finalizeArtifacts()

      if (aiMsg.parts.length === 0) {
        aiMsg.parts = [{ id: nextId(), type: 'text', text: '(No response)' }]
      }
    } catch (error: unknown) {
      if (!cancelRequested && !isAbortError(error)) {
        if (promptAccepted) {
          resolvedUserMessageId = await reconcileAssistantMessage(currentClient, currentSid, aiMsg)
          syncTurnMessageId(turnId, aiMsg.id)
          try {
            await finalizeArtifacts()
          } catch (artifactError: unknown) {
            console.warn('[useChat] artifact finalize failed:', artifactError)
          }
        }
        if (aiMsg.parts.length === 0 || aiMsg.parts.every((p) => p.type !== 'text' || !p.text?.trim())) {
          const msg = normalizeError(error)
          streamError.value = msg
          aiMsg.parts.push({ id: nextId(), type: 'text', text: msg })
        }
        if ((turnArtifacts.value[turnId]?.files.length ?? 0) > 0) {
          setArtifactError(normalizeError(error))
        }
      }
    } finally {
      abortCtl.abort()
      if (activeAbort === abortCtl) activeAbort = null
      if (activeStreamSessionId === currentSid) activeStreamSessionId = null
      if (activeStreamClient === currentClient) activeStreamClient = null
      cancelRequested = false
      aiMsg.streaming = false
      isStreaming.value = false
      guardedCommitSync()
    }
  }

  async function send(input: PromptInput) {
    const text = input.text.trim()
    const hasAttachments = Boolean(input.attachments?.length)
    const hasReferences = Boolean(input.references?.length)
    const hasCommand = Boolean(input.commandRef)
    if ((!text && !hasAttachments && !hasReferences && !hasCommand) || isStreaming.value) return
    if (activeStreamDone) {
      await activeStreamDone.catch(() => undefined)
      if (isStreaming.value) return
    }

    streamError.value = null
    ++loadGeneration

    const task = runSend(input, text)
    activeStreamDone = task
    try {
      await task
    } finally {
      if (activeStreamDone === task) {
        activeStreamDone = null
      }
    }
  }

  function cancelStream() {
    void cancelStreamInternal(false)
  }

  watch(sessionId, (nextSid, prevSid) => {
    ++loadGeneration
    artifactLoadGeneration += 1
    if (nextSid !== prevSid) {
      sessionStatus.value = null
      streamError.value = null
      resetArtifactState()
    }

    if (!nextSid || nextSid.startsWith('local-')) {
      if (isStreaming.value && prevSid && nextSid !== prevSid) {
        streamRevision += 1
        void cancelStreamInternal(true)
      }
      messages.value = []
      resetArtifactState()
      return
    }

    if (isStreaming.value && prevSid && nextSid !== prevSid) {
      pendingReloadSessionId = nextSid
      const switchToken = ++sessionSwitchRevision
      streamRevision += 1
      void (async () => {
        await cancelStreamInternal(true)
        if (!alive || switchToken !== sessionSwitchRevision) return
        const target = pendingReloadSessionId
        if (!target || target !== sessionId.value) return
        pendingReloadSessionId = null
        await loadMessages(target)
      })()
      return
    }

    pendingReloadSessionId = null
    void loadMessages(nextSid)
  }, { immediate: true })

  watch(client, () => {
    ++loadGeneration
    artifactLoadGeneration += 1
    if (!sessionId.value || sessionId.value.startsWith('local-')) {
      messages.value = []
      resetArtifactState()
      return
    }
    if (isStreaming.value && sessionId.value === activeStreamSessionId) return
    void loadMessages(sessionId.value)
  })

  return {
    messages,
    isStreaming,
    streamError,
    sessionStatus,
    turnArtifacts,
    sessionArtifacts,
    latestCompletedTurnId,
    send,
    cancelStream,
  }
}

// ---------------------------------------------------------------------------
// Message mapping (session.messages → RichMessage)
// ---------------------------------------------------------------------------

function mapRemoteMessage(raw: Record<string, unknown>): RichMessage {
  const info = (raw.info ?? raw) as Record<string, unknown>
  const rawParts = (raw.parts ?? []) as Array<Record<string, unknown>>
  const id = String(info.id ?? nextId())

  const role = String(info.role ?? 'assistant')
  const time = asRecord(info.time)
  const created = time.created
  const createdAt =
    typeof created === 'number'
      ? new Date(created > 1e12 ? created : created * 1000).toISOString()
      : typeof created === 'string' ? created : nowISO()

  const providerID = asString(info.providerID)
  const modelID = asString(info.modelID)

  const parts: MessagePart[] = []
  let totalTokens: TokenInfo | undefined
  let totalCost: number | undefined

  for (const rp of rawParts) {
    const partType = asString(rp.type) as PartType | null
    const partId = asString(rp.id) ?? nextId()
    if (!partType) continue

    if (partType === 'text') {
      parts.push({ id: partId, type: 'text', text: asString(rp.text) ?? '' })
    } else if (partType === 'reasoning') {
      parts.push({ id: partId, type: 'reasoning', text: asString(rp.text) ?? '' })
    } else if (partType === 'file') {
      parts.push({
        id: partId, type: 'file',
        file: {
          mime: asString(rp.mime) ?? 'application/octet-stream',
          url: asString(rp.url) ?? '',
          filename: asString(rp.filename) ?? undefined,
        },
      })
    } else if (partType === 'tool') {
      const tool = parseToolFromPart(rp, { fallbackId: partId })
      if (tool) parts.push({ id: partId, type: 'tool', tool })
    } else if (partType === 'step-start') {
      parts.push({ id: partId, type: 'step-start' })
    } else if (partType === 'step-finish') {
      const rawTokens = asRecord(rp.tokens)
      const rawCache = asRecord(rawTokens.cache)
      const tokens: TokenInfo = {
        input: Number(rawTokens.input) || 0,
        output: Number(rawTokens.output) || 0,
        reasoning: Number(rawTokens.reasoning) || 0,
        cache: { read: Number(rawCache.read) || 0, write: Number(rawCache.write) || 0 },
      }
      const cost = typeof rp.cost === 'number' ? rp.cost : undefined
      parts.push({ id: partId, type: 'step-finish', step: { reason: asString(rp.reason) ?? undefined, cost, tokens } })
      if (!totalTokens) totalTokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
      totalTokens.input += tokens.input
      totalTokens.output += tokens.output
      totalTokens.reasoning += tokens.reasoning
      totalTokens.cache.read += tokens.cache.read
      totalTokens.cache.write += tokens.cache.write
      if (cost !== undefined) totalCost = (totalCost ?? 0) + cost
    } else if (partType === 'patch') {
      const files = Array.isArray(rp.files) ? rp.files.filter((f): f is string => typeof f === 'string') : []
      parts.push({ id: partId, type: 'patch', patch: { hash: asString(rp.hash) ?? '', files } })
    } else if (partType === 'agent') {
      parts.push({ id: partId, type: 'agent', agent: asString(rp.name) ?? 'unknown' })
    } else if (partType === 'retry') {
      const errRec = asRecord(rp.error)
      const errData = asRecord(errRec.data)
      parts.push({
        id: partId, type: 'retry',
        retry: { attempt: Number(rp.attempt) || 0, error: asString(errData.message) ?? asString(errRec.message) ?? 'unknown' },
      })
    } else if (partType === 'compaction') {
      parts.push({ id: partId, type: 'compaction', auto: rp.auto === true })
    } else if (partType === 'subtask') {
      parts.push({
        id: partId, type: 'subtask',
        subtask: { prompt: asString(rp.prompt) ?? '', description: asString(rp.description) ?? '', agent: asString(rp.agent) ?? '' },
      })
    }
  }

  return {
    id,
    turnId: id,
    role: role === 'user' ? 'user' : 'assistant',
    parts,
    modelInfo: providerID && modelID ? { providerID, modelID } : undefined,
    tokens: totalTokens,
    cost: totalCost,
    createdAt,
    streaming: false,
  }
}
