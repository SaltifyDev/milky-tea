import type { MilkyFetchOptions } from '@/client/fetch'
import type {
  QuitGroupInput_ZodInput,
  SendPrivateMessageInput_ZodInput,
  SendPrivateMessageOutput,
  SetGroupEssenceMessageInput_ZodInput,
} from '@/index'
import { expect, expectTypeOf, it, vi } from 'vitest'
import { createMilkyClient } from '@/client/endpoint'

it('proxies grouped client methods to API endpoints', async () => {
  const fetchMock = vi.fn(async (request: Request) => {
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://example.com/base/api/get_login_info')
    expect(request.headers.get('authorization')).toBe('Bearer root-token')
    expect(await request.text()).toBe('{}')

    return new Response(JSON.stringify({
      status: 'ok',
      retcode: 0,
      data: {
        uin: 10001,
        nickname: 'bot',
      },
    }), {
      headers: {
        'content-type': 'application/json',
      },
    })
  })

  const client = createMilkyClient({
    baseURL: 'https://example.com/base',
    token: 'root-token',
    fetch: fetchMock,
  })

  await expect(client.system.getLoginInfo(undefined)).resolves.toEqual({
    uin: 10001,
    nickname: 'bot',
  })
  expect(fetchMock).toHaveBeenCalledOnce()
})

it('caches grouped endpoints and endpoint methods', () => {
  const client = createMilkyClient({
    baseURL: 'https://example.com',
    fetch: vi.fn(),
  })

  expect(client.system).toBe(client.system)
  expect(client.group).toBe(client.group)
  expect(client.system.getLoginInfo).toBe(client.system.getLoginInfo)
  expect(client.group.quitGroup).toBe(client.group.quitGroup)
  expect(client.system.name).toBe('system')
  expect((client as any).unknown).toBeUndefined()
  expect((client.system as any).unknown).toBeUndefined()
  expect(Reflect.set(client as object, 'fetch', null)).toBe(false)
  expect(Reflect.set(client.system as object, 'getLoginInfo', null)).toBe(false)
})

it('forwards params and per-request overrides through grouped client methods', async () => {
  const overrideFetch = vi.fn(async (request: Request) => {
    expect(request.url).toBe('https://override.example.com/api/quit_group')
    expect(request.headers.get('authorization')).toBe('Bearer override-token')
    expect(request.headers.get('x-sdk')).toBe('milky')
    expect(await request.text()).toBe(JSON.stringify({ group_id: 10001 }))

    return new Response(JSON.stringify({
      status: 'ok',
      retcode: 0,
    }), {
      headers: {
        'content-type': 'application/json',
      },
    })
  })

  const client = createMilkyClient({
    baseURL: 'https://default.example.com/base',
    token: 'default-token',
    fetch: vi.fn(),
  })

  await expect(client.group.quitGroup({ group_id: 10001 } as never, {
    baseURL: 'https://override.example.com',
    token: 'override-token',
    fetch: overrideFetch,
    request: {
      headers: {
        'x-sdk': 'milky',
      },
    },
  })).resolves.toBeUndefined()

  expect(overrideFetch).toHaveBeenCalledOnce()
})

it('exposes grouped client methods with optional override options', () => {
  const client = createMilkyClient({
    baseURL: 'https://example.com',
    fetch: vi.fn(async () => new Response(JSON.stringify({
      status: 'ok',
      retcode: 0,
      data: {},
    }))),
  })

  expectTypeOf(client.system.getLoginInfo).parameters.toEqualTypeOf<[(undefined | null)?, MilkyFetchOptions?]>()
  expectTypeOf(client.group.quitGroup).parameters.toEqualTypeOf<[QuitGroupInput_ZodInput, MilkyFetchOptions?]>()
  expectTypeOf(client.group.setGroupEssenceMessage).parameters.toEqualTypeOf<[SetGroupEssenceMessageInput_ZodInput, MilkyFetchOptions?]>()
  expectTypeOf(client.message.sendPrivateMessage).parameters.toEqualTypeOf<[SendPrivateMessageInput_ZodInput, MilkyFetchOptions?]>()
  expectTypeOf(client.message.sendPrivateMessage).returns.toEqualTypeOf<Promise<SendPrivateMessageOutput>>()
  expect(client).not.toHaveProperty('event')
})
