import { afterEach, expect, it, vi } from 'vitest'
import { createMilkyEventSource } from '@/events/index'
import { createDeferred, sleep, waitFor } from './helpers/async'
import { FakeWebSocket } from './helpers/transports'

const originalWebSocket = globalThis.WebSocket

afterEach(() => {
  globalThis.WebSocket = originalWebSocket
  vi.doUnmock('@/events/source')
  vi.resetModules()
})

it('closes connection when aborted during auto fallback', async () => {
  globalThis.WebSocket = class extends FakeWebSocket {
    constructor() {
      super()
      // Simulate WebSocket failure
      queueMicrotask(() => {
        this.dispatchEvent(new Event('error'))
        this.close()
      })
    }
  } as unknown as typeof WebSocket

  const source = createMilkyEventSource('auto', {
    baseURL: 'https://example.com',
    timeout: 100,
  })

  await sleep(10)
  source.close()

  expect(source.readyState).toBe(source.CLOSED)
})

it('handles signal abort during auto connection fallback', async () => {
  globalThis.WebSocket = class extends FakeWebSocket {
    constructor() {
      super()
      queueMicrotask(() => {
        this.dispatchEvent(new Event('error'))
        this.close()
      })
    }
  } as unknown as typeof WebSocket

  const controller = new AbortController()
  const source = createMilkyEventSource('auto', {
    baseURL: 'https://example.com',
    timeout: 5000,
  })

  // Abort immediately
  source.close()
  await sleep(10)

  expect(source.readyState).toBe(source.CLOSED)
})

it('handles connection that resolves after abort during reconnect', async () => {
  const { createMilkyEventSource, MilkyEventSourceImpl } = await (async () => {
    vi.resetModules()
    const deferred = createDeferred<any>()
    vi.doMock('@/events/source', async () => {
      const actual = await vi.importActual<typeof import('@/events/source')>('@/events/source')
      return {
        ...actual,
        connectEventTransport: vi.fn(async () => {
          await sleep(100)
          return deferred.promise
        }),
      }
    })

    const events = await import('@/events/index')
    const internal = await import('@/events/internal')

    setTimeout(() => {
      deferred.resolve({
        kind: 'websocket',
        source: new internal.MilkyEventSourceImpl(),
        termination: Promise.resolve({ type: 'closed' }),
      })
    }, 50)

    return {
      createMilkyEventSource: events.createMilkyEventSource,
      MilkyEventSourceImpl: internal.MilkyEventSourceImpl,
    }
  })()

  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

  const source = createMilkyEventSource(() => new FakeWebSocket() as never, {
    reconnect: {
      interval: 1,
      attempts: 1,
    },
  })

  await sleep(20)
  source.close()
  await sleep(150)

  expect(source.readyState).toBe(source.CLOSED)
})

it('handles iterator on closed source', async () => {
  const { MilkyEventSourceImpl } = await import('@/events/internal')

  const source = new MilkyEventSourceImpl()
  source.close()

  const iterator = source[Symbol.asyncIterator]()
  const result = await iterator.next()

  expect(result).toEqual({
    done: true,
    value: undefined,
  })
})

it('handles async iterator return method', async () => {
  const { MilkyEventSourceImpl } = await import('@/events/internal')

  const source = new MilkyEventSourceImpl()
  const iterator = source[Symbol.asyncIterator]()

  const result = await iterator.return?.()
  expect(result).toEqual({
    done: true,
    value: undefined,
  })
})

it('handles async iterator with queued messages', async () => {
  const { MilkyEventSourceImpl } = await import('@/events/internal')

  const source = new MilkyEventSourceImpl()
  const iterator = source[Symbol.asyncIterator]()

  // Dispatch messages before consuming
  source.controller.dispatchMessage({ event_type: 'test', id: 1 } as never)
  source.controller.dispatchMessage({ event_type: 'test', id: 2 } as never)

  const first = await iterator.next()
  expect(first.value).toMatchObject({ id: 1 })

  const second = await iterator.next()
  expect(second.value).toMatchObject({ id: 2 })

  source.close()
})

it('handles reconnect interval sleep interruption', async () => {
  const { createMilkyEventSource, MilkyEventSourceImpl } = await (async () => {
    vi.resetModules()
    let attemptCount = 0
    vi.doMock('@/events/source', async () => {
      const actual = await vi.importActual<typeof import('@/events/source')>('@/events/source')
      return {
        ...actual,
        connectEventTransport: vi.fn(async () => {
          attemptCount++
          if (attemptCount === 1) {
            return {
              kind: 'websocket',
              source: new (await import('@/events/internal')).MilkyEventSourceImpl(),
              termination: Promise.resolve({ type: 'ended' }),
            }
          }
          await sleep(1000)
          throw new Error('should not reach')
        }),
      }
    })

    const events = await import('@/events/index')
    const internal = await import('@/events/internal')

    return {
      createMilkyEventSource: events.createMilkyEventSource,
      MilkyEventSourceImpl: internal.MilkyEventSourceImpl,
    }
  })()

  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

  const source = createMilkyEventSource(() => new FakeWebSocket() as never, {
    reconnect: {
      interval: 5000,
      attempts: 'always',
    },
  })

  await sleep(50)
  source.close()
  await waitFor(() => source.readyState === source.CLOSED)
})

it('handles connection closed during signal abort check', async () => {
  const { createMilkyEventSource, MilkyEventSourceImpl } = await (async () => {
    vi.resetModules()
    const deferred = createDeferred<any>()
    vi.doMock('@/events/source', async () => {
      const actual = await vi.importActual<typeof import('@/events/source')>('@/events/source')
      return {
        ...actual,
        connectEventTransport: vi.fn(async () => deferred.promise),
      }
    })

    const events = await import('@/events/index')
    const internal = await import('@/events/internal')

    setTimeout(() => {
      const impl = new internal.MilkyEventSourceImpl()
      deferred.resolve({
        kind: 'websocket',
        source: impl,
        termination: Promise.resolve({ type: 'closed' }),
      })
    }, 10)

    return {
      createMilkyEventSource: events.createMilkyEventSource,
      MilkyEventSourceImpl: internal.MilkyEventSourceImpl,
    }
  })()

  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

  const source = createMilkyEventSource(() => new FakeWebSocket() as never, {
    reconnect: false,
  })

  await sleep(50)
  expect(source.readyState).toBe(source.CLOSED)
})

it('handles websocket ended termination with reconnect', async () => {
  const { createMilkyEventSource, MilkyEventSourceImpl } = await (async () => {
    vi.resetModules()
    let callCount = 0
    vi.doMock('@/events/source', async () => {
      const actual = await vi.importActual<typeof import('@/events/source')>('@/events/source')
      return {
        ...actual,
        connectEventTransport: vi.fn(async () => {
          callCount++
          const impl = new (await import('@/events/internal')).MilkyEventSourceImpl()
          if (callCount === 1) {
            return {
              kind: 'websocket',
              source: impl,
              termination: Promise.resolve({ type: 'ended' }),
            }
          }
          return {
            kind: 'websocket',
            source: impl,
            termination: new Promise(() => {}), // never resolves
          }
        }),
      }
    })

    const events = await import('@/events/index')
    const internal = await import('@/events/internal')

    return {
      createMilkyEventSource: events.createMilkyEventSource,
      MilkyEventSourceImpl: internal.MilkyEventSourceImpl,
    }
  })()

  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

  const source = createMilkyEventSource(() => new FakeWebSocket() as never, {
    reconnect: {
      interval: 10,
      attempts: 1,
    },
  })

  await sleep(50)
  expect(source.readyState).toBe(source.CONNECTING)
  source.close()
})
