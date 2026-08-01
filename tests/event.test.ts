import type { Event as MilkyEvent } from '@/gen/types'
import { afterEach, expect, expectTypeOf, it, vi } from 'vitest'
import { resolveMilkyEvent } from '@/event'

afterEach(() => {
  vi.doUnmock('@/gen/zod-event')
  vi.resetModules()
})

it('resolves valid events and strips unknown fields', async () => {
  const event = await resolveMilkyEvent({
    event_type: 'bot_offline',
    time: 1,
    self_id: 10001,
    data: {
      reason: 'network error',
      ignored: true,
    },
    ignored: true,
  })

  expectTypeOf(event).toEqualTypeOf<MilkyEvent>()
  expect(event).toEqual({
    event_type: 'bot_offline',
    time: 1,
    self_id: 10001,
    data: {
      reason: 'network error',
    },
  })
})

it('resolves nested message events', async () => {
  const event = await resolveMilkyEvent({
    event_type: 'message_receive',
    time: 2,
    self_id: 10001,
    data: {
      message_scene: 'temp',
      peer_id: 10002,
      message_seq: 3,
      sender_id: 10002,
      time: 2,
      segments: [{
        type: 'text',
        data: { text: 'hello' },
      }],
    },
  })

  expect(event.event_type).toBe('message_receive')
  if (event.event_type === 'message_receive') {
    expect(event.data.segments).toEqual([{
      type: 'text',
      data: { text: 'hello' },
    }])
  }
})

it.each([
  ['unknown event type', { event_type: 'unknown' }],
  ['missing fields', { event_type: 'bot_offline' }],
  ['invalid nested fields', {
    event_type: 'bot_offline',
    time: 1,
    self_id: 10001,
    data: { reason: 42 },
  }],
])('rejects %s with the validation error as its cause', async (_name, value) => {
  const pending = resolveMilkyEvent(value)

  await expect(pending).rejects.toMatchObject({
    message: 'milky: failed to resolve event',
    cause: expect.objectContaining({
      name: 'ZodError',
    }),
  })
})

it('reports schema loading failures and retries the import', async () => {
  let moduleLoads = 0
  vi.doMock('@/gen/zod-event', () => {
    moduleLoads += 1
    throw new Error('Cannot find package zod')
  })

  const { resolveMilkyEvent: resolveWithMissingZod } = await import('@/event')

  await expect(resolveWithMissingZod({})).rejects.toMatchObject({
    message: 'milky: zod is required to resolve events',
    cause: expect.any(Error),
  })
  await expect(resolveWithMissingZod({})).rejects.toThrow('milky: zod is required to resolve events')
  expect(moduleLoads).toBe(2)
})

it('loads the event schema once after successful resolution', async () => {
  let moduleLoads = 0
  const safeParseAsync = vi.fn(async (value: unknown) => ({
    success: true as const,
    data: value as MilkyEvent,
  }))

  vi.doMock('@/gen/zod-event', () => {
    moduleLoads += 1
    return {
      Event: { safeParseAsync },
    }
  })

  const { resolveMilkyEvent: resolveWithMock } = await import('@/event')
  const value = { event_type: 'bot_offline' } as never

  await resolveWithMock(value)
  await resolveWithMock(value)

  expect(moduleLoads).toBe(1)
  expect(safeParseAsync).toHaveBeenCalledTimes(2)
})
