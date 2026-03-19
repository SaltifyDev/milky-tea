/* eslint-disable ts/method-signature-style */

import type { Event as MilkyEvent } from '@/gen/proto'

// eslint-disable-next-line ts/consistent-type-definitions
export type MilkyEventSourceEventMap = {
  error: ErrorEvent
  message: MessageEvent<MilkyEvent>
  open: Event
}

export interface MilkyEventSource extends EventTarget {
  addEventListener<K extends keyof MilkyEventSourceEventMap>(
    type: K,
    listener: (this: MilkyEventSource, ev: MilkyEventSourceEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof MilkyEventSourceEventMap>(
    type: K,
    listener: (this: MilkyEventSource, ev: MilkyEventSourceEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void

  readonly readyState: number
  readonly CONNECTING: 0
  readonly OPEN: 1
  readonly CLOSED: 2

  close(): void
  [Symbol.dispose](): void
}

export interface MilkyEventSourceTerminate<Result> {
  (result: Result): void
  readonly promise: Promise<Result>
}

export class MilkyEventSourceController {
  private closeHandler: () => void = () => {}
  private closed = false

  constructor(readonly source: MilkyEventSourceImpl) {}

  createTerminate<Result>(): MilkyEventSourceTerminate<Result> {
    const deferred = Promise.withResolvers<Result>()
    let settled = false
    const finish = ((result: Result) => {
      if (settled) {
        return
      }

      settled = true
      this.markClosed()
      deferred.resolve(result)
    }) as MilkyEventSourceTerminate<Result>

    return Object.assign(finish, {
      promise: deferred.promise,
    })
  }

  setCloseHandler(closeHandler: () => void): void {
    this.closeHandler = closeHandler
  }

  markConnecting(): void {
    if (!this.closed) {
      this.source.readyState = this.source.CONNECTING
    }
  }

  markClosed(): void {
    this.closed = true
    this.source.readyState = this.source.CLOSED
  }

  dispatchOpen(): void {
    if (this.closed) {
      return
    }

    this.source.readyState = this.source.OPEN
    this.source.dispatchEvent(new Event('open'))
  }

  dispatchMessage(message: MilkyEvent): void {
    if (this.closed) {
      return
    }

    this.source.dispatchEvent(new MessageEvent('message', {
      data: message,
    }))
  }

  dispatchError(error: unknown): void {
    if (this.closed) {
      return
    }

    this.source.dispatchEvent(new ErrorEvent('error', {
      error,
      message: error instanceof Error ? error.message : String(error),
    }))
  }

  forwardFrom(source: MilkyEventSource): () => void {
    const onOpen = () => {
      this.dispatchOpen()
    }

    const onMessage = (event: MilkyEventSourceEventMap['message']) => {
      this.dispatchMessage(event.data)
    }

    const onError = (event: MilkyEventSourceEventMap['error']) => {
      this.dispatchError(event.error ?? event)
    }

    source.addEventListener('open', onOpen)
    source.addEventListener('message', onMessage)
    source.addEventListener('error', onError)

    return () => {
      source.removeEventListener('open', onOpen)
      source.removeEventListener('message', onMessage)
      source.removeEventListener('error', onError)
    }
  }

  close(): void {
    if (this.closed) {
      return
    }

    this.markClosed()
    this.closeHandler()
  }
}

export class MilkyEventSourceImpl extends EventTarget implements MilkyEventSource {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSED = 2
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  readyState = this.CONNECTING
  readonly controller: MilkyEventSourceController

  constructor(setup?: (controller: MilkyEventSourceController) => void) {
    super()
    this.controller = new MilkyEventSourceController(this)
    setup?.(this.controller)
  }

  close(): void {
    this.controller.close()
  }

  [Symbol.dispose](): void {
    this.close()
  }
}
