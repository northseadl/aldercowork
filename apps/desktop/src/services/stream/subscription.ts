import { asRecord, asString, withTimeout } from './helpers'

const EVENT_STREAM_READY_TIMEOUT_MS = 5_000
const EVENT_STREAM_READY_TIMEOUT_ERROR = 'Timed out waiting for event stream connection'

type EventStream = AsyncGenerator<unknown>
type EventSubscribe = (parameters?: unknown, options?: unknown) => Promise<unknown>

async function* prependEvent(firstPayload: unknown, stream: EventStream): EventStream {
    yield firstPayload
    for await (const payload of stream) {
        yield payload
    }
}

function resolveEventStream(result: unknown): EventStream {
    const record = asRecord(result)
    const stream = record.stream ?? asRecord(record.data).stream ?? result

    if (!stream) {
        throw new Error('event.subscribe() returned no stream')
    }
    if (typeof stream !== 'object' || stream === null || !(Symbol.asyncIterator in stream)) {
        throw new Error('event.subscribe() returned a non-async stream')
    }

    return stream as EventStream
}

export async function subscribePrimedEventStream(input: {
    subscribe: EventSubscribe
    signal: AbortSignal
    lastEventId?: string | null
    onEventId?: (eventId: string) => void
}): Promise<EventStream> {
    const options: Record<string, unknown> = {
        signal: input.signal,
        onSseEvent: (event: unknown) => {
            const eventId = asString(asRecord(event).id)
            if (eventId) input.onEventId?.(eventId)
        },
    }

    if (input.lastEventId) {
        options.headers = { 'Last-Event-ID': input.lastEventId }
    }

    const rawResult = await input.subscribe(undefined, options)
    const result = asRecord(rawResult)
    if (result.error) {
        const errData = asRecord(result.error)
        throw new Error(asString(errData.message) ?? 'Failed to subscribe to event stream')
    }

    const stream = resolveEventStream(rawResult)
    const firstEvent = await withTimeout(
        stream.next(),
        EVENT_STREAM_READY_TIMEOUT_MS,
        EVENT_STREAM_READY_TIMEOUT_ERROR,
        { signal: input.signal },
    )

    if (firstEvent.done) {
        throw new Error('Event stream closed before subscription handshake')
    }

    return prependEvent(firstEvent.value, stream)
}
