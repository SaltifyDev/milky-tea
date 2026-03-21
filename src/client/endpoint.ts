import type { MilkyFetch, MilkyFetchCreateOptions, MilkyFetchOptions } from '@/client/fetch'
import type { MilkyEventSource, MilkyEventSourceOptions } from '@/events'
import type { MilkyEventSourceConnectionKind } from '@/events/source'
import type { MilkyClientEndpointNames, MilkyRawEndpoints } from '@/gen/types'
import { createMilkyFetch } from '@/client/fetch'
import { createMilkyEventSource } from '@/events'
import { clientEndpointNames } from '@/gen/types'

function createProxy(options: MilkyFetchCreateOptions): any {
  const milkyFetch = createMilkyFetch(options)
  const event = (kind: MilkyEventSourceConnectionKind, eventOptions?: MilkyEventSourceOptions) =>
    createMilkyEventSource(kind ?? 'auto', {
      ...eventOptions,
      baseURL: options.baseURL,
      token: eventOptions?.token ?? options.token,
    })

  const cachedEndpoints = new Map<keyof MilkyClientEndpointNames, any>()
  return new Proxy({
    fetch: milkyFetch,
    event,
  }, {
    get(target, prop) {
      if (!Object.hasOwn(clientEndpointNames, prop)) {
        return Reflect.get(target, prop)
      }

      if (cachedEndpoints.has(prop as keyof MilkyClientEndpointNames)) {
        return cachedEndpoints.get(prop as keyof MilkyClientEndpointNames)
      }

      const methodNames = (clientEndpointNames as any)[prop as any]
      const cachedMethods = new Map()
      const methods = new Proxy(Object.create(null), {
        get(_target, key) {
          if (key === 'name') {
            return prop
          }

          if (!Object.hasOwn(methodNames, key)) {
            return void 0
          }

          if (cachedMethods.has(key)) {
            return cachedMethods.get(key)
          }

          const methodName = methodNames[key as any]
          const methodFn = (param: any, override: any) => milkyFetch(methodName, param, override)
          cachedMethods.set(key, methodFn)
          return methodFn
        },
        set() {
          return false
        },
      })

      cachedEndpoints.set(prop as keyof MilkyClientEndpointNames, methods)
      return methods
    },
    set() {
      return false
    },
  })
}

export type MilkyClient = {
  readonly fetch: MilkyFetch
  readonly event: (kind?: MilkyEventSourceConnectionKind, options?: MilkyEventSourceOptions) => MilkyEventSource
} & {
  readonly [K in keyof MilkyClientEndpointNames]: {
    readonly [M in keyof MilkyClientEndpointNames[K]]:
    MilkyClientEndpointNames[K][M] extends infer K extends keyof MilkyRawEndpoints
      ? (...params: [...Parameters<MilkyRawEndpoints[K]>, override?: MilkyFetchOptions]) => Promise<ReturnType<MilkyRawEndpoints[K]>>
      : never
  } & {
    readonly name: K
  } & {}
} & {}

export function createMilkyClient(options: MilkyFetchCreateOptions): MilkyClient {
  return createProxy(options)
}
