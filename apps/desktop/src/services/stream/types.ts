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
    dispatchStarted: boolean
    completionArmed: boolean
    sawActivity: boolean
    turnObserved: boolean
    turnUserMessageId: string
    assistantMessageId: string | null
    latestUserMessageId: string | null
    assistantMessageIds: Set<string>
    partLookup: Map<string, MessagePart>
    respondedPermissionIds: Set<string>
    respondedQuestionIds: Set<string>
}

export function createStreamState(turnUserMessageId: string): StreamState {
    return {
        dispatchStarted: false,
        completionArmed: false,
        sawActivity: false,
        turnObserved: false,
        turnUserMessageId,
        assistantMessageId: null,
        latestUserMessageId: turnUserMessageId,
        assistantMessageIds: new Set(),
        partLookup: new Map(),
        respondedPermissionIds: new Set(),
        respondedQuestionIds: new Set(),
    }
}
