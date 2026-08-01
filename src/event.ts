import type { Event as MilkyEvent } from '@/gen/types'

interface MilkyEventSchema {
  safeParseAsync: (value: unknown) => Promise<
    | { success: true, data: MilkyEvent }
    | { success: false, error: Error }
  >
}

let milkyEventSchemaPromise: Promise<MilkyEventSchema> | undefined

function isMissingZodError(error: unknown, seen = new Set<unknown>()): boolean {
  if (seen.has(error)) {
    return false
  }
  seen.add(error)

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('zod') && (
    message.includes('Cannot find')
    || message.includes('ERR_MODULE_NOT_FOUND')
    || message.includes('module')
  )) {
    return true
  }

  const cause = error != null && typeof error === 'object' && 'cause' in error
    ? (error as { cause?: unknown }).cause
    : undefined

  return cause != null && isMissingZodError(cause, seen)
}

async function resolveMilkyEventSchema(): Promise<MilkyEventSchema> {
  milkyEventSchemaPromise ??= import('@/gen/zod-event')
    .then(module => module.Event)
    .catch((error) => {
      milkyEventSchemaPromise = undefined
      if (isMissingZodError(error)) {
        throw new Error('milky: zod is required to resolve events', { cause: error })
      }

      throw error
    })

  return milkyEventSchemaPromise
}

export async function resolveMilkyEvent(obj: unknown): Promise<MilkyEvent> {
  const schema = await resolveMilkyEventSchema()
  const result = await schema.safeParseAsync(obj)

  if (!result.success) {
    throw new Error('milky: failed to resolve event', { cause: result.error })
  }

  return result.data
}

export type { Event } from '@/gen/types'
