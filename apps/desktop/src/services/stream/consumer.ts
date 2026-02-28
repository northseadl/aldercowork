/**
 * SSE event stream consumer — core engine that processes OpenCode events
 * and updates a RichMessage in place.
 *
 * Pure logic — no Vue dependency. Receives callbacks for side effects.
 */
import type { RichMessage, TokenInfo, PartType } from '../../stores/session'
import type { PermissionResolver, StreamState } from './types'
import { asRecord, asString, normalizeEventType, parseTimestamp } from './helpers'
import { accumulateTokens, findOrCreatePart, parseToolFromPart } from './parts'
import { parsePermissionRequest, resolvePermissionDecision } from './permissions'

// ---------------------------------------------------------------------------
// SSE event helpers
// ---------------------------------------------------------------------------

function resolveEventSessionId(type: string, props: Record<string, unknown>): string | null {
    if (type === 'message.updated') {
        return asString(asRecord(props.info).sessionID)
    }
    if (type === 'message.part.updated' || type === 'message.part.delta' || type === 'message.part.removed') {
        const part = asRecord(props.part)
        return asString(part.sessionID) ?? asString(props.sessionID)
    }
    return asString(props.sessionID)
}

function extractSessionError(props: Record<string, unknown>): string {
    if (typeof props.error === 'string' && props.error.trim()) return props.error
    const rec = asRecord(props.error)
    const data = asRecord(rec.data)
    return asString(data.message) ?? asString(rec.message) ?? 'Session stream failed'
}

function extractAssistantError(info: Record<string, unknown>): string | null {
    const rec = asRecord(info.error)
    if (!Object.keys(rec).length) return null
    const data = asRecord(rec.data)
    return asString(data.message) ?? asString(rec.message) ?? asString(info.error) ?? null
}

// ---------------------------------------------------------------------------
// Stream consumer
// ---------------------------------------------------------------------------

/**
 * Consume an SSE event stream and update a RichMessage in place.
 *
 * `commit` is an **async** callback that flushes accumulated mutations
 * to the reactive layer and yields to the browser for rendering.
 * The consumer awaits it at each render-worthy point, giving the commit
 * implementation full control over throttling and frame pacing.
 */
export async function consumeEventStream(
    stream: AsyncGenerator<unknown>,
    client: Record<string, unknown>,
    sessionId: string,
    aiMsg: RichMessage,
    state: StreamState,
    commit: () => Promise<void>,
    permissionResolver?: PermissionResolver,
    onSessionStatus?: (status: string) => void,
): Promise<string | null> {

    for await (const payload of stream) {
        const event = asRecord(payload)
        const rawType = asString(event.type)
        const type = rawType ? normalizeEventType(rawType) : null

        if (!type) continue

        const props = asRecord(event.properties)
        const evtSid = resolveEventSessionId(type, props)
        if (evtSid && evtSid !== sessionId) continue
        if (!state.promptDispatched) continue

        // --- Session error ---
        if (type === 'session.error') {
            throw new Error(extractSessionError(props))
        }

        // --- Message-level events ---
        if (type === 'message.created' || type === 'message.start' || type === 'message.updated') {
            const msgObj = asRecord(asRecord(props.message).info)
            const info = Object.keys(msgObj).length ? msgObj : asRecord(props.info)
            const msgId = asString(info.id)

            // Track non-assistant messages so we can skip their parts later
            if (asString(info.role) !== 'assistant') {
                if (msgId) state.skippedMessageIds.add(msgId)
                continue
            }

            // Agentic loop: OpenCode may produce multiple assistant messages per prompt
            // (e.g. msg1: text+tool → tool result → msg2: text). Always adopt the latest
            // assistant messageID so all parts accumulate into our single UI message.
            if (msgId) {
                state.assistantMessageId = msgId
                aiMsg.id = msgId
            }

            const providerID = asString(info.providerID)
            const modelID = asString(info.modelID)
            if (providerID && modelID) {
                aiMsg.modelInfo = { providerID, modelID }
            }

            aiMsg.createdAt = parseTimestamp(asRecord(info.time).created)

            const assistantError = extractAssistantError(info)
            if (assistantError) throw new Error(assistantError)

            state.sawActivity = true
            await commit()
            continue
        }

        // --- Part-level events ---
        if (type === 'message.part.updated' || type === 'message.part.delta') {
            const part = asRecord(props.part)
            // Delta events may carry partID at props level, not inside part object
            const partId = asString(part.id) ?? asString(props.partID) ?? `part-${aiMsg.parts.length}`
            const partMsgId = asString(part.messageID) ?? asString(props.messageID)

            // Skip parts belonging to non-assistant messages (e.g. user message echo)
            if (partMsgId && state.skippedMessageIds.has(partMsgId)) continue

            // Adopt latest assistant messageID (agentic loop produces multiple)
            if (partMsgId) {
                state.assistantMessageId = partMsgId
                aiMsg.id = partMsgId
            }

            // Resolve part type: part.updated carries it directly;
            // part.delta does NOT — look up from previously tracked state.
            let partType = asString(part.type) as PartType | null
            if (!partType) {
                const tracked = state.partLookup.get(partId)
                partType = (tracked?.type ?? null) as PartType | null
            }
            if (!partType) continue

            if (partType === 'text') {
                const p = findOrCreatePart(aiMsg, state, partId, 'text')
                const delta = asString(props.delta)
                if (delta !== null) {
                    p.text = (p.text ?? '') + delta
                } else {
                    p.text = asString(part.text) ?? ''
                }
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'reasoning') {
                const p = findOrCreatePart(aiMsg, state, partId, 'reasoning')
                const delta = asString(props.delta)
                if (delta !== null) {
                    p.text = (p.text ?? '') + delta
                } else {
                    p.text = asString(part.text) ?? ''
                }
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'file') {
                const p = findOrCreatePart(aiMsg, state, partId, 'file')
                p.file = {
                    mime: asString(part.mime) ?? 'application/octet-stream',
                    url: asString(part.url) ?? '',
                    filename: asString(part.filename) ?? undefined,
                }
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'tool') {
                const tool = parseToolFromPart(part)
                if (!tool) continue
                const p = findOrCreatePart(aiMsg, state, partId, 'tool')
                p.tool = tool
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'step-start') {
                findOrCreatePart(aiMsg, state, partId, 'step-start')
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'step-finish') {
                const p = findOrCreatePart(aiMsg, state, partId, 'step-finish')
                const rawTokens = asRecord(part.tokens)
                const rawCache = asRecord(rawTokens.cache)
                const tokens: TokenInfo = {
                    input: Number(rawTokens.input) || 0,
                    output: Number(rawTokens.output) || 0,
                    reasoning: Number(rawTokens.reasoning) || 0,
                    cache: {
                        read: Number(rawCache.read) || 0,
                        write: Number(rawCache.write) || 0,
                    },
                }
                const cost = typeof part.cost === 'number' ? part.cost : undefined
                p.step = { reason: asString(part.reason) ?? undefined, cost, tokens }
                accumulateTokens(aiMsg, tokens, cost)
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'patch') {
                const p = findOrCreatePart(aiMsg, state, partId, 'patch')
                const files = Array.isArray(part.files)
                    ? part.files.filter((f): f is string => typeof f === 'string')
                    : []
                p.patch = { hash: asString(part.hash) ?? '', files }
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'agent') {
                const p = findOrCreatePart(aiMsg, state, partId, 'agent')
                p.agent = asString(part.name) ?? 'unknown'
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'retry') {
                const p = findOrCreatePart(aiMsg, state, partId, 'retry')
                const errRec = asRecord(part.error)
                const errData = asRecord(errRec.data)
                p.retry = {
                    attempt: Number(part.attempt) || 0,
                    error: asString(errData.message) ?? asString(errRec.message) ?? 'unknown error',
                }
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'compaction') {
                const p = findOrCreatePart(aiMsg, state, partId, 'compaction')
                p.auto = part.auto === true
                state.sawActivity = true
                await commit()
                continue
            }

            if (partType === 'snapshot') {
                findOrCreatePart(aiMsg, state, partId, 'snapshot')
                continue
            }

            if (partType === 'subtask') {
                const p = findOrCreatePart(aiMsg, state, partId, 'subtask')
                p.subtask = {
                    prompt: asString(part.prompt) ?? '',
                    description: asString(part.description) ?? '',
                    agent: asString(part.agent) ?? '',
                }
                state.sawActivity = true
                await commit()
                continue
            }

            // Unknown part type — log and skip
            console.warn('[stream] Unknown part type:', partType, part)
            continue
        }

        // --- Part removed ---
        if (type === 'message.part.removed') {
            const partId = asString(props.partID)
            if (!partId) continue
            const before = aiMsg.parts.length
            aiMsg.parts = aiMsg.parts.filter((p) => p.id !== partId)
            state.partLookup.delete(partId)
            if (aiMsg.parts.length !== before) {
                state.sawActivity = true
                await commit()
            }
            continue
        }

        // --- Permission events ---
        if (type === 'permission.updated' || type === 'permission.asked') {
            const permission = parsePermissionRequest(props, sessionId)
            if (!permission || state.respondedPermissionIds.has(permission.id)) continue

            const decision = await resolvePermissionDecision(permissionResolver, permission)
            try {
                const permissionNs = asRecord(client.permission)
                if (typeof permissionNs.reply === 'function') {
                    await (permissionNs.reply as (opts: unknown) => Promise<unknown>)({
                        requestID: permission.id, reply: decision,
                    })
                } else if (typeof permissionNs.respond === 'function') {
                    await (permissionNs.respond as (opts: unknown) => Promise<unknown>)({
                        sessionID: permission.sessionId, permissionID: permission.id, response: decision,
                    })
                } else {
                    throw new Error('SDK client missing permission response API')
                }
            } catch (e: unknown) {
                throw new Error(`[stream] Failed to reply permission: ${e instanceof Error ? e.message : String(e)}`)
            }
            state.respondedPermissionIds.add(permission.id)
            continue
        }

        // --- Question events (auto-reject) ---
        if (type === 'question.asked') {
            const qid = asString(props.id) ?? asString(props.requestID)
            if (!qid || state.respondedQuestionIds.has(qid)) continue
            try {
                const questionNs = asRecord(client.question)
                if (typeof questionNs.reject === 'function') {
                    await (questionNs.reject as (opts: unknown) => Promise<unknown>)({ requestID: qid })
                }
            } catch (e: unknown) {
                console.warn('[stream] Failed to reject question:', e)
            }
            state.respondedQuestionIds.add(qid)
            continue
        }

        if (type === 'permission.replied') {
            const pid = asString(props.permissionID)
            if (pid) state.respondedPermissionIds.add(pid)
            continue
        }

        // --- Session completion ---
        if (type === 'session.status') {
            const statusType = asString(asRecord(props.status).type) ?? asString(props.status)
            if (statusType === 'idle' && state.completionArmed) {
                onSessionStatus?.('idle')
                return state.assistantMessageId
            }
            if (statusType) {
                onSessionStatus?.(statusType)
            }
            continue
        }

        if (type === 'session.idle' && state.completionArmed) {
            return state.assistantMessageId
        }
    }

    // Reaching EOF without a session-idle signal is always abnormal for an in-flight prompt.
    throw new Error('Event stream closed before session completion')
}
