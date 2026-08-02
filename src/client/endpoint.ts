import type { MilkyFetch, MilkyFetchCreateOptions, MilkyFetchOptions } from '@/client/fetch'
import type { ApiCategories, ApiEndpoints } from '@/gen/types'
import type { MilkyCamelCase, MilkyClientEndpointNames, MilkyRawEndpoints } from '@/types'
import { createMilkyFetch } from '@/client/fetch'
import { clientEndpointNames } from '@/types'

function createProxy(options: MilkyFetchCreateOptions): any {
  const milkyFetch = createMilkyFetch(options)

  const cachedEndpoints = new Map<keyof MilkyClientEndpointNames, any>()
  return new Proxy({
    fetch: milkyFetch,
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
          const methodFn = (param: any, override: any) => (milkyFetch as any)(methodName, param, override)
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
} & {
  readonly [K in keyof ApiCategories]: {
    readonly [E in keyof ApiCategories[K] as MilkyCamelCase<E & string>]:
    E extends keyof MilkyRawEndpoints & keyof ApiEndpoints
      ? (...params: MilkyClientMethodParameters<E>) => Promise<ApiEndpoints[E]['response']>
      : never
  } & {
    readonly name: K
  } & {}
} & {}

type MilkyClientMethodParameters<T extends keyof MilkyRawEndpoints & keyof ApiEndpoints>
  = Parameters<MilkyRawEndpoints[T]> extends [param: unknown]
    ? [param: ApiEndpoints[T]['request_ZodInput'], override?: MilkyFetchOptions]
    : Parameters<MilkyRawEndpoints[T]> extends [param?: unknown]
      ? [param?: null | undefined, override?: MilkyFetchOptions]
      : never

export function createMilkyClient(options: MilkyFetchCreateOptions): MilkyClient {
  return createProxy(options)
}
