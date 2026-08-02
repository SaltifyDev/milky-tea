import type { GetFriendInfoOutput } from '@saltify/milky-tea'
import process from 'node:process'
import { createMilkyFetch } from '@saltify/milky-tea'

async function main(): Promise<void> {
  const milkyFetch = createMilkyFetch({
    baseURL: 'https://milky.example.com',
    token: process.env.MILKY_TOKEN,
  })

  // Use the raw snake_case endpoint name when grouped client methods are not
  // suitable. Request and response types are still inferred from the endpoint.
  const result: GetFriendInfoOutput = await milkyFetch('get_friend_info', {
    user_id: 10001,
  })

  process.stdout.write(`${JSON.stringify(result.friend, null, 2)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
