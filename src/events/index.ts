import type { MilkyEventSource, MilkyEventSourceEvents } from '@/events/internal'
import type { MilkyEventSourceTransport } from '@/events/source'
import type { Awaitable, WildcardHandler } from '@/utils'
import { handleRawEventSource } from '@/events/source'
import { createEventEmitter, withTimeout } from '@/utils'

export interface MilkyEventSourceOptions {
  timeout?: number
  reconnect?: false | {
    interval: number
    attempts: 'always' | number
  }
}

export type MilkyEventSourceTransportFactory = (signal?: AbortSignal) => Awaitable<MilkyEventSourceTransport>

export async function createMilkyEventSource(factory: MilkyEventSourceTransportFactory, options?: MilkyEventSourceOptions): Promise<MilkyEventSource> {
  options ??= {}
  options.timeout ??= 15000
  options.reconnect ??= false

  const reconnect = options?.reconnect
  const handleTransport = async (signal?: AbortSignal) => handleRawEventSource(await factory(signal))

  async function connect(signal?: AbortSignal): Promise<MilkyEventSource> {
    const controller = new AbortController()
    let shouldCloseTransport = false
    let onAbort: (() => void) | undefined
    let abortPromise: Promise<never> | undefined
    let rejectAbort: ((error: Error) => void) | undefined

    if (signal) {
      abortPromise = new Promise((_, reject) => {
        rejectAbort = reject
      })
      onAbort = () => {
        shouldCloseTransport = true
        controller.abort()
        rejectAbort?.(new Error('aborted'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    try {
      const transportPromise = handleTransport(controller.signal)
      transportPromise.then((transport) => {
        if (shouldCloseTransport || controller.signal.aborted) {
          transport.close()
        }
      }, () => {})

      const pending = withTimeout(transportPromise, options?.timeout, () => {
        shouldCloseTransport = true
        controller.abort()
      })

      return await (abortPromise ? Promise.race([pending, abortPromise]) : pending)
    }
    catch (error) {
      shouldCloseTransport = true
      controller.abort()
      throw error
    }
    finally {
      if (onAbort) {
        signal?.removeEventListener('abort', onAbort)
      }
    }
  }

  if (!reconnect) {
    return await connect()
  }

  const controller = new AbortController()
  const { signal } = controller
  const emitter = createEventEmitter() as MilkyEventSource
  let retries = 0
  let hasConnected = false
  let closedSinceLastOpen = false

  emitter.close = () => {
    controller.abort()
  }

  void (async () => {
    while (!signal.aborted) {
      try {
        const transport = await connect(signal)

        if (signal.aborted) {
          transport.close()
          break
        }

        await new Promise<void>((resolve) => {
          let forward: WildcardHandler<MilkyEventSourceEvents>
          let onAbort: () => void

          const cleanup = () => {
            transport.off('*', forward)
            signal.removeEventListener('abort', onAbort)
            resolve()
          }

          onAbort = () => {
            transport.close()
            cleanup()
          }

          forward = (event, data) => {
            if (event === 'open') {
              retries = 0
              closedSinceLastOpen = false
              emitter.emit(hasConnected ? 'reopen' : 'open')
              hasConnected = true
              return
            }

            if (event === 'close' || event === 'error') {
              if (event === 'close') {
                closedSinceLastOpen = true
              }
              cleanup()

              if (event === 'error') {
                transport.close()
              }
            }

            emitter.emit(event, data)
          }

          signal.addEventListener('abort', onAbort)
          transport.on('*', forward)
        })

        if (signal.aborted) {
          break
        }
      }
      catch (error) {
        if (signal.aborted) {
          break
        }

        emitter.emit('error', error)
      }

      if (reconnect.attempts !== 'always' && retries >= reconnect.attempts) {
        break
      }

      retries += 1

      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, reconnect.interval)
          signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new Error('milky: reconnect aborted'))
          }, { once: true })
        })
      }
      catch {
        break
      }
    }

    if (!closedSinceLastOpen) {
      emitter.emit('close')
    }
  })()

  return emitter
}

export const toMilkyEventSource = createMilkyEventSource

export type { MilkyEventSource, MilkyEventSourceEvents, MilkyEventSourceTransport }
