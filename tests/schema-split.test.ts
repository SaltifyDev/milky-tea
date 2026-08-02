import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const commonSchema = readFileSync('./src/gen/zod-common.ts', 'utf8')
const eventSchema = readFileSync('./src/gen/zod-event.ts', 'utf8')
const apiSchema = readFileSync('./src/gen/zod-api.ts', 'utf8')

it('partitions generated schemas by runtime entry point', () => {
  expect(eventSchema).toContain('export const Event =')
  expect(eventSchema).not.toContain('export const zodApiCategories =')
  expect(apiSchema).toContain('export const zodApiCategories =')
  expect(apiSchema).not.toContain('export const Event =')
})

it('moves shared declarations into a one-way common module', () => {
  expect(commonSchema).toContain('export const IncomingMessage =')
  expect(eventSchema).toContain('from \'./zod-common\'')
  expect(apiSchema).toContain('from \'./zod-common\'')
  expect(commonSchema).not.toContain('from \'./zod-event\'')
  expect(commonSchema).not.toContain('from \'./zod-api\'')
})
