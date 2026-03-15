import type { MilkyEventSource } from '@/events/internal'
import { createEventEmitter } from '@/utils'

export async function handleWebSocketOrEventSource(source: EventSource | WebSocket): Promise<MilkyEventSource> {
  const emitter = createEventEmitter() as MilkyEventSource

  source.addEventListener('open', () => emitter.emit('open'), { once: true })
  source.addEventListener('message', event => emitter.emit('push', JSON.parse((event as MessageEvent).data.toString())))
  source.addEventListener('error', error => emitter.emit('error', error))
  source.addEventListener('close', () => emitter.emit('close'), { once: true })

  if (source.readyState === source.OPEN) {
    Promise.resolve().then(() => emitter.emit('open'))
  }

  emitter.close = source.close.bind(source)

  return emitter
}

export async function handleSseResponse(res: Response): Promise<MilkyEventSource> {
  if (!res.ok) {
    throw new Error(`milky: sse failed to create event source: ${res.statusText}`)
  }

  if (!res.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error(`milky: sse failed to create event source: invalid content type: ${res.headers.get('Content-Type')}`)
  }

  if (!res.body) {
    throw new Error('milky: sse failed to get body')
  }

  let readerClosed = false
  const decoder = res.body.pipeThrough(new TextDecoderStream())
  const reader = decoder.getReader()
  const emitter = createEventEmitter() as MilkyEventSource

  emitter.close = () => {
    if (!readerClosed) {
      readerClosed = true
      void reader.cancel()
    }
  }

  let buffer = ''
  let shouldCapture = false
  const dataLines: string[] = []

  function emitPendingEvent() {
    if (!dataLines.length) {
      return
    }
    emitter.emit('push', JSON.parse(dataLines.join('\n')))
    dataLines.length = 0
  }

  function handleLine(line: string) {
    if (!line.length) {
      shouldCapture = false
      emitPendingEvent()
      return
    }

    if (line.startsWith(':')) {
      return
    }

    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      return
    }

    const field = line.slice(0, separatorIndex)
    const value = line.slice(separatorIndex + 1).trimStart()

    if (field === 'event') {
      shouldCapture = value === 'milky_event'
      return
    }

    if (shouldCapture && field === 'data') {
      dataLines.push(value)
    }
  }

  function consume(flush = false) {
    let lineStart = 0
    let cursor = 0

    while (cursor < buffer.length) {
      const char = buffer[cursor]

      if (char !== '\r' && char !== '\n') {
        cursor += 1
        continue
      }

      if (char === '\r' && cursor + 1 === buffer.length && !flush) {
        break
      }

      handleLine(buffer.slice(lineStart, cursor))

      if (char === '\r' && buffer[cursor + 1] === '\n') {
        cursor += 1
      }

      cursor += 1
      lineStart = cursor
    }

    if (flush) {
      if (lineStart < buffer.length) {
        handleLine(buffer.slice(lineStart))
      }
      buffer = ''
      return
    }

    buffer = buffer.slice(lineStart)
  }

  void (async () => {
    Promise.resolve().then(() => emitter.emit('open'))

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += value
        consume()
      }

      if (readerClosed) {
        return
      }

      consume(true)
      emitPendingEvent()
      emitter.emit('close')
    }
    catch (error) {
      if (!readerClosed) {
        emitter.emit('error', error)
      }
    }
    finally {
      reader.releaseLock()
    }
  })()

  return emitter
}

export type MilkyEventSourceTransport = EventSource | WebSocket | Response

export async function handleRawEventSource(source: MilkyEventSourceTransport): Promise<MilkyEventSource> {
  if (source instanceof EventSource) {
    return handleWebSocketOrEventSource(source)
  }

  if (source instanceof WebSocket) {
    return handleWebSocketOrEventSource(source)
  }

  if (source instanceof Response) {
    return handleSseResponse(source)
  }

  throw new TypeError('milky: unknown event source type')
}
