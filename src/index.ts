import {
  milkyPackageVersion as generatedMilkyPackageVersion,
  milkyVersion as generatedMilkyVersion,
} from './gen/types'

export * from './client'
export { resolveMilkyEvent } from './event'
export type * from './gen/types'
export type { MilkyRawEndpointName, MilkyRawEndpoints } from './types'

/** Milky protocol version targeted by this SDK. */
export const milkyVersion = generatedMilkyVersion

/** Full Milky protocol package version used to generate the SDK types. */
export const milkyPackageVersion = generatedMilkyPackageVersion
