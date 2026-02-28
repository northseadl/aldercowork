/**
 * Stream engine — barrel export.
 *
 * Only exports symbols consumed by external modules (composables, views).
 * Internal-only symbols (findOrCreatePart, accumulateTokens, etc.) stay private.
 */

// Types
export {
    createStreamState,
    type ModelSpec,
    type PermissionDecision,
    type PermissionRequest,
    type PermissionResolver,
    type StreamState,
} from './types'

// Helpers — only externally consumed ones
export {
    asRecord,
    asString,
    isAbortError,
    nextId,
    normalizeError,
    nowISO,
} from './helpers'

// Parts — only externally consumed ones
export { parseToolFromPart } from './parts'

// Consumer
export { consumeEventStream } from './consumer'
