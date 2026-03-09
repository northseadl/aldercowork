/**
 * Part parsing — extracts typed parts from raw SSE event payloads.
 */
import type { MessagePart, PartType, RichMessage, TokenInfo, ToolCallState, ToolStatus } from '../../stores/session'
import type { StreamState } from './types'
import { asRecord, asString, stringifyValue } from './helpers'

// ---------------------------------------------------------------------------
// Tool parsing
// ---------------------------------------------------------------------------

export function parseToolStatus(v: unknown): ToolStatus | null {
    if (v === 'pending' || v === 'running' || v === 'completed' || v === 'failed') return v
    if (v === 'error') return 'failed'
    return null
}

export function inferToolStatus(
    explicit: unknown,
    output: unknown,
    error: unknown,
    options: { started?: boolean, previous?: ToolStatus } = {},
): ToolStatus {
    const parsed = parseToolStatus(explicit)
    if (parsed) return parsed
    if (error !== undefined && error !== null) return 'failed'
    if (output !== undefined && output !== null) return 'completed'
    if (options.started) return 'running'
    if (options.previous) return options.previous
    return 'pending'
}

export interface ParseToolFromPartOptions {
    /** Fallback tool/part id when the payload omits `part.id` (common in delta events). */
    fallbackId?: string
    /** Previous tool state — used to preserve fields when parsing deltas. */
    previous?: ToolCallState
}

export function parseToolFromPart(
    part: Record<string, unknown>,
    options: ParseToolFromPartOptions = {},
): ToolCallState | null {
    const id = asString(part.id) ?? options.fallbackId
    if (!id) return null
    const state = asRecord(part.state)
    const time = asRecord(state.time)
    const rawInput = state.input ?? part.input ?? part.arguments
    const rawOutput = state.output ?? part.result
    const rawError = state.error

    const previous = options.previous
    const explicitStatus = state.status ?? part.status
    const rawAttachments = Array.isArray(state.attachments) ? state.attachments : Array.isArray(part.attachments) ? part.attachments : []
    const started = typeof time.start === 'number' || typeof time.start === 'string'

    const status = inferToolStatus(explicitStatus, rawOutput, rawError, {
        started,
        previous: previous?.status,
    })

    return {
        id,
        name: asString(part.tool) ?? asString(part.name) ?? previous?.name ?? 'unknown_tool',
        input: rawInput === undefined ? (previous?.input ?? '') : stringifyValue(rawInput),
        output: rawOutput === undefined ? previous?.output : stringifyValue(rawOutput),
        error: rawError === undefined ? previous?.error : stringifyValue(rawError),
        status,
        title: asString(state.title) ?? previous?.title ?? undefined,
        attachments: rawAttachments.length > 0 ? rawAttachments.map((item) => {
            const attachment = asRecord(item)
            const source = asRecord(attachment.source)
            return {
                mime: asString(attachment.mime) ?? 'application/octet-stream',
                url: asString(attachment.url) ?? '',
                filename: asString(attachment.filename) ?? undefined,
                path: asString(source.path) ?? undefined,
            }
        }).filter((item) => item.url || item.filename || item.path) : previous?.attachments,
    }
}

// ---------------------------------------------------------------------------
// Part accumulation
// ---------------------------------------------------------------------------

export function findOrCreatePart(msg: RichMessage, state: StreamState, partId: string, partType: PartType): MessagePart {
    const existing = state.partLookup.get(partId)
    if (existing) return existing
    const part: MessagePart = { id: partId, type: partType }
    msg.parts.push(part)
    state.partLookup.set(partId, part)
    return part
}

export function accumulateTokens(msg: RichMessage, tokens: TokenInfo, cost?: number) {
    if (!msg.tokens) {
        msg.tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
    }
    msg.tokens.input += tokens.input
    msg.tokens.output += tokens.output
    msg.tokens.reasoning += tokens.reasoning
    msg.tokens.cache.read += tokens.cache.read
    msg.tokens.cache.write += tokens.cache.write
    if (cost !== undefined) {
        msg.cost = (msg.cost ?? 0) + cost
    }
}
