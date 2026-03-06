/**
 * Stream engine types — shared across the stream processing pipeline.
 */
import type { MessagePart } from '../../stores/session'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ModelSpec = { providerID: string; modelID: string }
export type PermissionDecision = 'once' | 'always' | 'reject'

export interface PermissionRequest {
    id: string
    sessionId: string
    messageId?: string
    callId?: string
    type: string
    title: string
    pattern?: string | string[]
    metadata: Record<string, unknown>
}

export type PermissionResolver = (request: PermissionRequest) => PermissionDecision | Promise<PermissionDecision>

export interface StreamState {
    promptDispatched: boolean
    completionArmed: boolean
    sawActivity: boolean
    assistantMessageId: string | null
    latestUserMessageId: string | null
    skippedMessageIds: Set<string>
    partLookup: Map<string, MessagePart>
    respondedPermissionIds: Set<string>
    respondedQuestionIds: Set<string>
}

export function createStreamState(): StreamState {
    return {
        promptDispatched: false,
        completionArmed: false,
        sawActivity: false,
        assistantMessageId: null,
        latestUserMessageId: null,
        skippedMessageIds: new Set(),
        partLookup: new Map(),
        respondedPermissionIds: new Set(),
        respondedQuestionIds: new Set(),
    }
}
