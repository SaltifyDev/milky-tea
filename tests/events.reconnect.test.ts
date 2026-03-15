import { afterEach, expect, it, vi } from 'vitest'
import { toMilkyEventSource } from '@/events/index'

class MockEventSource extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  CONNECTING = 0
  OPEN = 1
  CLOSED = 2

  readyState = this.CONNECTING
  closeCalls = 0

  open() {
    this.readyState = this.OPEN
    this.dispatchEvent(new Event('open'))
  }

  fail() {
    this.dispatchEvent(new Event('error'))
  }

  close() {
    if (this.readyState === this.CLOSED) {
      return
    }

    this.closeCalls += 1
    this.readyState = this.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

const originalEventSource = globalThis.EventSource

afterEach(() => {
  globalThis.EventSource = originalEventSource
})

function installMockEventSource() {
  globalThis.EventSource = MockEventSource as unknown as typeof EventSource
}

function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

it('emits open on the first successful connection and reopen after reconnecting', async () => {
  installMockEventSource()

  const sources: MockEventSource[] = []
  const transport = await toMilkyEventSource(() => {
    const source = new MockEventSource()
    sources.push(source)
    return source as unknown as EventSource
  }, {
    timeout: 50,
    reconnect: {
      interval: 0,
      attempts: 1,
    },
  })

  const events: string[] = []
  transport.on('open', () => events.push('open'))
  transport.on('reopen', () => events.push('reopen'))
  transport.on('close', () => events.push('close'))

  await vi.waitFor(() => {
    expect(sources).toHaveLength(1)
  })
  await nextTick()

  sources[0]!.open()
  await nextTick()
  expect(events).toEqual(['open'])

  sources[0]!.close()
  await vi.waitFor(() => {
    expect(sources).toHaveLength(2)
  })

  sources[1]!.open()
  await nextTick()
  expect(events.slice(0, 3)).toEqual(['open', 'close', 'reopen'])

  transport.close()
  await vi.waitFor(() => {
    expect(events).toHaveLength(4)
  })
  expect(events).toEqual(['open', 'close', 'reopen', 'close'])
})

it('reconnects after terminal error events instead of hanging forever', async () => {
  installMockEventSource()

  const sources: MockEventSource[] = []
  const transport = await toMilkyEventSource(() => {
    const source = new MockEventSource()
    sources.push(source)
    return source as unknown as EventSource
  }, {
    timeout: 50,
    reconnect: {
      interval: 0,
      attempts: 1,
    },
  })

  let errorCount = 0
  transport.on('error', () => {
    errorCount += 1
  })

  await vi.waitFor(() => {
    expect(sources).toHaveLength(1)
  })
  await nextTick()

  sources[0]!.open()
  await nextTick()
  sources[0]!.fail()

  await vi.waitFor(() => {
    expect(sources).toHaveLength(2)
  })
  expect(errorCount).toBe(1)
  expect(sources[0]!.closeCalls).toBe(1)

  transport.close()
})

it('aborts timed out connection attempts before starting the next retry', async () => {
  installMockEventSource()

  const attemptSignals: Array<AbortSignal | undefined> = []
  let firstAttemptWasAbortedBeforeRetry = false

  const transport = await toMilkyEventSource((signal) => {
    attemptSignals.push(signal)

    if (attemptSignals.length === 2) {
      firstAttemptWasAbortedBeforeRetry = attemptSignals[0]?.aborted === true
    }

    return new Promise(() => {})
  }, {
    timeout: 20,
    reconnect: {
      interval: 0,
      attempts: 1,
    },
  })

  let closeCount = 0
  transport.on('close', () => {
    closeCount += 1
  })

  await vi.waitFor(() => {
    expect(closeCount).toBe(1)
  }, { timeout: 500 })

  expect(attemptSignals).toHaveLength(2)
  expect(firstAttemptWasAbortedBeforeRetry).toBe(true)
  expect(attemptSignals[0]?.aborted).toBe(true)
  expect(attemptSignals[1]?.aborted).toBe(true)
})

it('does not emit close twice when reconnecting stops after a natural close', async () => {
  installMockEventSource()

  const sources: MockEventSource[] = []
  const transport = await toMilkyEventSource(() => {
    const source = new MockEventSource()
    sources.push(source)
    return source as unknown as EventSource
  }, {
    timeout: 50,
    reconnect: {
      interval: 0,
      attempts: 0,
    },
  })

  let closeCount = 0
  transport.on('close', () => {
    closeCount += 1
  })

  await vi.waitFor(() => {
    expect(sources).toHaveLength(1)
  })
  await nextTick()

  sources[0]!.open()
  await nextTick()
  sources[0]!.close()

  await vi.waitFor(() => {
    expect(closeCount).toBeGreaterThanOrEqual(1)
  })
  await nextTick()

  expect(closeCount).toBe(1)
})
