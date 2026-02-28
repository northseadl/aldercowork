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

export function inferToolStatus(explicit: unknown, output: unknown, error: unknown): ToolStatus {
    const parsed = parseToolStatus(explicit)
    if (parsed) return parsed
    if (error !== undefined && error !== null) return 'failed'
    if (output !== undefined && output !== null) return 'completed'
    return 'pending'
}

export function parseToolFromPart(part: Record<string, unknown>): ToolCallState | null {
    const id = asString(part.id)
    if (!id) return null
    const state = asRecord(part.state)
    const rawInput = state.input ?? part.input ?? part.arguments
    const rawOutput = state.output ?? part.result
    const rawError = state.error

    return {
        id,
        name: asString(part.tool) ?? asString(part.name) ?? 'unknown_tool',
        input: stringifyValue(rawInput),
        output: rawOutput === undefined ? undefined : stringifyValue(rawOutput),
        status: inferToolStatus(state.status ?? part.status, rawOutput, rawError),
        title: asString(state.title) ?? undefined,
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
