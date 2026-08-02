import type { ApiEndpoints } from '@/gen/types'
import type { MilkyProto, MilkyProtoStruct, MilkyRawEndpoints } from '@/types'
import { createMilkyProto, rawEndpointNames } from '@/types'
import { joinURL, withTimeout } from '@/utils'

/** Shared defaults and per-request overrides for Milky API calls. */
export interface MilkyFetchOptions {
  /** Base URL of the Milky implementation, including any path prefix. */
  readonly baseURL?: string | URL
  /**
   * Whether to validate request parameters and response data with Zod.
   *
   * @defaultValue `true`
   */
  readonly zod?: boolean
  /** Bearer token sent when the request does not already contain an `Authorization` header. */
  readonly token?: string
  /**
   * Request timeout in milliseconds. Set to `false` to disable the timeout.
   *
   * @defaultValue `30000`
   */
  readonly timeout?: number | false
  /** Additional Fetch API options applied to every request. */
  readonly request?: Omit<RequestInit, 'body' | 'signal' | 'method'>
  /** Custom Fetch API implementation. Defaults to `globalThis.fetch`. */
  readonly fetch?: (request: Request) => Promise<Response>
}

/** Options used to create a {@link MilkyFetch} instance. */
export type MilkyFetchCreateOptions = Omit<MilkyFetchOptions, 'baseURL'> & {
  /** Base URL of the Milky implementation, including any path prefix. */
  readonly baseURL: string | URL
}

/** A typed function for invoking Milky API endpoints by their protocol names. */
export interface MilkyFetch {
  /**
   * Invokes a Milky API endpoint.
   *
   * @param name - Snake-case endpoint name from the Milky protocol.
   * @param args - Endpoint parameters followed by optional per-request overrides.
   * @returns The endpoint response data.
   */
  <const T extends keyof MilkyRawEndpoints & keyof ApiEndpoints>(
    name: T,
    ...args: MilkyFetchParameters<T>
  ): Promise<ApiEndpoints[T]['response']>
}

type MilkyFetchParameters<T extends keyof MilkyRawEndpoints & keyof ApiEndpoints>
  = Parameters<MilkyRawEndpoints[T]> extends [param: unknown]
    ? [param: ApiEndpoints[T]['request_ZodInput'], override?: MilkyFetchOptions]
    : Parameters<MilkyRawEndpoints[T]> extends [param?: unknown]
      ? [param?: null | undefined, override?: MilkyFetchOptions]
      : never

interface MilkyApiResponse<T> {
  status: 'ok' | 'failed'
  retcode: number
  data?: T
  message?: string | null
}

let milkyProtoPromise: Promise<MilkyProto | undefined> | undefined

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

async function resolveMilkyProto(): Promise<MilkyProto | undefined> {
  milkyProtoPromise ??= import('@/gen/zod-api')
    .then(module => createMilkyProto(module.zodApiCategories))
    .catch((error) => {
      milkyProtoPromise = undefined
      if (isMissingZodError(error)) {
        return undefined
      }

      throw error
    })

  return milkyProtoPromise
}

/**
 * Creates a typed, low-level Milky API caller.
 *
 * @param options - Default connection, validation, and request options.
 * @returns A function that invokes endpoints by their snake-case protocol names.
 * @throws If no Fetch API implementation is available.
 */
export function createMilkyFetch(options: MilkyFetchCreateOptions): MilkyFetch {
  if (options.fetch == null && globalThis.fetch == null) {
    throw new Error('milky: fetch is not provided')
  }

  const defaultFetch = options.fetch ?? globalThis.fetch.bind(globalThis)

  return async function fetch<T extends keyof MilkyRawEndpoints & keyof ApiEndpoints>(
    name: T,
    ...args: MilkyFetchParameters<T>
  ): Promise<ApiEndpoints[T]['response']> {
    let [params, override] = args as [unknown, MilkyFetchOptions | undefined]
    const zod = override?.zod ?? options.zod ?? true
    let paramStruct: MilkyProtoStruct | null | undefined
    let responseStruct: MilkyProtoStruct | null | undefined

    if (zod) {
      if (!rawEndpointNames.has(String(name))) {
        throw new Error(`milky: unknown endpoint ${String(name)}`)
      }

      const milkyProto = await resolveMilkyProto()
      if (milkyProto != null) {
        [paramStruct, responseStruct] = milkyProto[name]
      }
    }

    if (zod && paramStruct != null) {
      const paramParseResult = await paramStruct.safeParseAsync(params)

      if (!paramParseResult.success) {
        throw new Error(`milky: failed to validate params for ${String(name)}: ${paramParseResult.error.message}`)
      }

      params = paramParseResult.data as any
    }

    const baseURL = override?.baseURL ?? options.baseURL
    const timeout = override?.timeout ?? options.timeout
    const token = override?.token ?? options.token
    const execute = (override?.fetch ?? defaultFetch).bind(globalThis)
    const resolvedTimeout = timeout === false ? undefined : timeout ?? 30000

    const requestInit = {
      ...options.request,
      ...override?.request,
    } satisfies Omit<RequestInit, 'body' | 'signal' | 'method'>

    const headers = new Headers(options.request?.headers)

    if (override?.request?.headers) {
      new Headers(override?.request?.headers).forEach((value, key) => {
        headers.set(key, value)
      })
    }

    if (!headers.has('accept')) {
      headers.set('accept', 'application/json')
    }
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    if (token && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${token}`)
    }

    const controller = new AbortController()
    let didTimeout = false

    const request = new Request(joinURL(baseURL, `api/${String(name)}`), {
      ...requestInit,
      method: 'POST',
      headers,
      body: JSON.stringify(params ?? {}),
      signal: controller.signal,
    })

    const response = await withTimeout(
      execute(request).catch((error) => {
        if (didTimeout) {
          throw new Error(`milky: timed out after ${resolvedTimeout}ms`, { cause: error })
        }

        throw error
      }),
      resolvedTimeout,
      () => {
        didTimeout = true
        controller.abort()
      },
    )

    let payload: MilkyApiResponse<ApiEndpoints[T]['response']>

    try {
      payload = await response.json() as MilkyApiResponse<ApiEndpoints[T]['response']>
    }
    catch (error) {
      throw new Error(`milky: failed to parse response for ${String(name)}`, { cause: error })
    }

    if (!response.ok || payload.status === 'failed') {
      throw new Error(payload.message ?? `milky: invoke ${String(name)} failed: ${payload.message} (${payload.retcode})`)
    }

    if (!zod || responseStruct == null) {
      return payload.data as ApiEndpoints[T]['response']
    }

    const responseParseResult = await responseStruct.safeParseAsync(payload.data)

    if (!responseParseResult.success) {
      throw new Error(`milky: failed to parse response for ${String(name)}: ${responseParseResult.error.message}`)
    }

    return responseParseResult.data as ApiEndpoints[T]['response']
  }
}
