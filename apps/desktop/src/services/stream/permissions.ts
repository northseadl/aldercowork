/**
 * Permission handling — parsing and resolving permission requests from SSE.
 */
import type { PermissionDecision, PermissionRequest, PermissionResolver } from './types'
import { asRecord, asString } from './helpers'

function pickString(source: Record<string, unknown>, ...keys: string[]): string | null {
    for (const key of keys) {
        const value = asString(source[key])
        if (value) return value
    }
    return null
}

function parsePermissionPattern(value: unknown): string | string[] | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.length ? trimmed : undefined
    }

    if (Array.isArray(value)) {
        const normalized = value
            .map((entry) => asString(entry))
            .filter((entry): entry is string => Boolean(entry))
        if (!normalized.length) return undefined
        return normalized.length === 1 ? normalized[0] : normalized
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, flag]) => flag === true)
            .map(([pattern]) => pattern.trim())
            .filter((pattern) => pattern.length > 0)
        if (!entries.length) return undefined
        return entries.length === 1 ? entries[0] : entries
    }

    return undefined
}

export function parsePermissionRequest(props: Record<string, unknown>, fallbackSid: string): PermissionRequest | null {
    const tool = asRecord(props.tool)
    const id = pickString(props, 'id', 'permissionID', 'requestID')
    if (!id) return null

    const pattern = parsePermissionPattern(props.patterns)
        ?? parsePermissionPattern(props.pattern)
        ?? parsePermissionPattern(tool.patterns)
        ?? parsePermissionPattern(tool.pattern)

    const type = pickString(props, 'permission', 'type') ?? 'unknown'
    const title = pickString(props, 'title') ?? `Permission: ${type}`
    const sessionId = pickString(props, 'sessionID', 'sessionId')
        ?? pickString(tool, 'sessionID', 'sessionId')
        ?? fallbackSid
    const messageId = pickString(tool, 'messageID', 'messageId', 'message_id')
        ?? pickString(props, 'messageID', 'messageId', 'message_id')
        ?? undefined
    const callId = pickString(tool, 'callID', 'callId', 'call_id')
        ?? pickString(props, 'callID', 'callId', 'call_id')
        ?? undefined

    return {
        id,
        sessionId,
        messageId,
        callId,
        type,
        title,
        pattern,
        metadata: {
            ...asRecord(props.metadata),
            tool,
        },
    }
}

export async function resolvePermissionDecision(
    resolver: PermissionResolver | undefined,
    request: PermissionRequest,
): Promise<PermissionDecision> {
    if (!resolver) return 'reject'
    try {
        const d = await resolver(request)
        if (d === 'once' || d === 'always' || d === 'reject') return d
    } catch { /* secure default */ }
    return 'reject'
}
