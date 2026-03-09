/**
 * Stream engine helpers — pure utility functions with no Vue dependency.
 */

let _nextId = 0
let _remoteMessageTimestamp = 0
let _remoteMessageCounter = 0

const REMOTE_ID_RANDOM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const REMOTE_ID_RANDOM_LENGTH = 14

export function nextId(): string {
    return `msg-${Date.now()}-${++_nextId}`
}

function randomBase62(length: number): string {
    const bytes = new Uint8Array(length)
    const cryptoObj = globalThis.crypto
    if (cryptoObj?.getRandomValues) {
        cryptoObj.getRandomValues(bytes)
    } else {
        for (let i = 0; i < length; i++) {
            bytes[i] = Math.floor(Math.random() * 256)
        }
    }

    let result = ''
    for (let i = 0; i < length; i++) {
        result += REMOTE_ID_RANDOM_CHARS[bytes[i] % REMOTE_ID_RANDOM_CHARS.length]
    }
    return result
}

export function nextRemoteMessageId(): string {
    const currentTimestamp = Date.now()
    if (currentTimestamp !== _remoteMessageTimestamp) {
        _remoteMessageTimestamp = currentTimestamp
        _remoteMessageCounter = 0
    }
    _remoteMessageCounter += 1

    const encoded = BigInt(currentTimestamp) * 0x1000n + BigInt(_remoteMessageCounter)
    const timeHex = encoded.toString(16).padStart(12, '0')
    return `msg_${timeHex}${randomBase62(REMOTE_ID_RANDOM_LENGTH)}`
}

export function nowISO(): string {
    return new Date().toISOString()
}

export function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function asString(value: unknown): string | null {
    return typeof value === 'string' ? value : null
}

export function normalizeEventType(value: string): string {
    return value.trim().replace(/_/g, '.').toLowerCase()
}

export function parseTimestamp(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value > 1_000_000_000_000 ? value : value * 1000).toISOString()
    }
    return nowISO()
}

export function stringifyValue(value: unknown): string {
    if (typeof value === 'string') return value
    try { return JSON.stringify(value ?? {}) } catch { return String(value) }
}

export function normalizeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true
    if (error instanceof Error) return error.name === 'AbortError' || /aborted|abort/i.test(error.message)
    return false
}

interface TimeoutOptions {
    signal?: AbortSignal
    abortController?: AbortController
}

function createAbortError(): Error {
    if (typeof DOMException !== 'undefined') {
        return new DOMException('Operation aborted', 'AbortError')
    }
    const err = new Error('Operation aborted')
    err.name = 'AbortError'
    return err
}

export function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    msg: string,
    options: TimeoutOptions = {},
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let settled = false
        let timer: ReturnType<typeof setTimeout> | null = null

        function cleanup() {
            if (timer !== null) clearTimeout(timer)
            options.signal?.removeEventListener('abort', onAbort)
        }

        function rejectOnce(error: unknown) {
            if (settled) return
            settled = true
            cleanup()
            reject(error)
        }

        function resolveOnce(value: T) {
            if (settled) return
            settled = true
            cleanup()
            resolve(value)
        }

        function onAbort() {
            rejectOnce(createAbortError())
        }

        if (options.signal?.aborted) {
            rejectOnce(createAbortError())
            return
        }
        if (options.signal) {
            options.signal.addEventListener('abort', onAbort, { once: true })
        }

        timer = setTimeout(() => {
            if (options.abortController && !options.abortController.signal.aborted) {
                options.abortController.abort()
            }
            rejectOnce(new Error(msg))
        }, ms)

        promise.then(resolveOnce).catch(rejectOnce)
    })
}
