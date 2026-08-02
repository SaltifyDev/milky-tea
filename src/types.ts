import type { zodApiCategories } from '@/gen/zod-api'
import { endpointNamesByCategory } from '@/gen/meta'

type ApiCategories = typeof zodApiCategories
type ApiCategoryName = keyof ApiCategories
type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelCase<Tail>>}`
  : S

type MilkyZodApiCategories = typeof zodApiCategories

type ZodInput<T> = T extends { _zod: { input: infer I } } ? I : unknown
type ZodOutput<T> = T extends { _zod: { output: infer O } } ? O : unknown

type EndpointRequest<T> = T extends null
  ? undefined | null
  : ZodInput<T>

type EndpointResponse<T> = T extends null
  ? void
  : ZodOutput<T>

type EndpointParameters<T> = T extends null
  ? [param?: undefined | null]
  : [param: ZodInput<T>]

type RawEndpointsForCategory<C extends ApiCategoryName> = {
  [E in keyof ApiCategories[C]['apis'] & string]:
  ApiCategories[C]['apis'][E] extends {
    requestSchema: infer RequestSchema
    responseSchema: infer ResponseSchema
  }
    ? (...params: EndpointParameters<RequestSchema>) => EndpointResponse<ResponseSchema>
    : never
}

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer R) => void
  ? R
  : never

/** Map of snake-case Milky endpoint names to their request and response signatures. */
export type MilkyRawEndpoints = UnionToIntersection<{
  [C in ApiCategoryName]: RawEndpointsForCategory<C>
}[ApiCategoryName]>

/** Name of any endpoint defined by the supported Milky protocol version. */
export type MilkyRawEndpointName = keyof MilkyRawEndpoints

export type MilkyApiCategories = ApiCategories

export type MilkyCamelCase<S extends string> = CamelCase<S>

export type MilkyClientEndpointNames = {
  readonly [C in ApiCategoryName]: {
    readonly [E in keyof ApiCategories[C]['apis'] as CamelCase<E & string>]: E
  }
}

export type MilkyProtoParseResult
  = | { success: true, data: unknown }
    | { success: false, error: { message: string } }

export interface MilkyProtoStruct {
  safeParseAsync: (value: unknown) => Promise<MilkyProtoParseResult>
}

export type MilkyProto = Record<string, readonly [MilkyProtoStruct | null, MilkyProtoStruct | null]>

const snakeCaseSegmentRE = /_([a-z0-9])/g
function snakeToCamel(value: string): string {
  return value.replace(snakeCaseSegmentRE, (_, char: string) => char.toUpperCase())
}

export const clientEndpointNames = Object.fromEntries(
  Object.entries(endpointNamesByCategory).map(([categoryName, endpointNames]) => [
    categoryName,
    Object.fromEntries(
      endpointNames.map(endpointName => [snakeToCamel(endpointName), endpointName]),
    ),
  ]),
) as MilkyClientEndpointNames

export const rawEndpointNames = new Set<string>(Object.values(endpointNamesByCategory).flat())

export function createMilkyProto(categories: MilkyZodApiCategories): MilkyProto {
  return Object.fromEntries(
    Object.values(categories).flatMap(category =>
      Object.entries(category.apis).map(([endpointName, api]) => [
        endpointName,
        [api.requestSchema, api.responseSchema] as const,
      ]),
    ),
  ) as MilkyProto
}

export type { EndpointRequest, EndpointResponse }
