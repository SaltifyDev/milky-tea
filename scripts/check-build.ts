import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import process from 'node:process'

const distPath = './dist'
const modules = new Map(
  readdirSync(distPath)
    .filter(file => file.endsWith('.mjs'))
    .map(file => [file, readFileSync(join(distPath, file), 'utf8')]),
)

function requireModule(name: string): string {
  const contents = modules.get(name)
  if (contents == null) {
    throw new Error(`Missing build module ${name}`)
  }
  return contents
}

function findModule(fragment: string): [string, string] {
  const matches = [...modules].filter(([, contents]) => contents.includes(fragment))
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one build module containing ${JSON.stringify(fragment)}, found ${matches.length}`)
  }
  return matches[0]!
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const indexEntry = requireModule('index.mjs')
const eventEntry = requireModule('event.mjs')
const [apiSchemaName, apiSchema] = findModule('const zodApiCategories =')
const [eventSchemaName, eventSchema] = findModule('const Event = z.discriminatedUnion("event_type"')
const [commonSchemaName, commonSchema] = findModule('const IncomingMessage = z.discriminatedUnion("message_scene"')

assert(eventEntry.includes('import("./zod-event-'), 'event entry must load its schema dynamically')
assert(!eventEntry.includes('endpointNamesByCategory'), 'event entry must not include client metadata')
assert(!eventEntry.includes('zodApiCategories'), 'event entry must not include API schemas')
assert(indexEntry.includes('import("./zod-api-'), 'client entry must load API schemas dynamically')
assert(!indexEntry.includes('from "zod"'), 'root entry must not statically load zod')
assert(!eventSchema.includes('zodApiCategories'), 'event schema chunk must not include API schemas')
assert(!apiSchema.includes('discriminatedUnion("event_type"'), 'API schema chunk must not include the event union')
assert(commonSchema.includes('from "zod"'), 'common schema chunk must own its zod dependency')

for (const [name, contents] of modules) {
  assert(!contents.includes('from "mitt"'), `${name} must not depend on mitt`)
  assert(!contents.includes('from "eventsource"'), `${name} must not depend on eventsource`)
}

process.stdout.write(`${[
  `event entry: ${basename('event.mjs')}`,
  `event schema: ${eventSchemaName}`,
  `API schema: ${apiSchemaName}`,
  `shared schema: ${commonSchemaName}`,
].join('\n')}\n`)
