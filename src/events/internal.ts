import type { EventEmitter } from '@/utils'

// eslint-disable-next-line ts/consistent-type-definitions
export type MilkyEventSourceEvents = {
  open: undefined
  reopen: undefined
  push: any
  close: undefined
  error: any
}

export interface MilkyEventSource extends EventEmitter<MilkyEventSourceEvents> {
  close: () => void
}
