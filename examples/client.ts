import type { OutgoingSegment } from '@saltify/milky-tea'
import process from 'node:process'
import { createMilkyClient } from '@saltify/milky-tea'
import { resolveMilkyEvent } from '@saltify/milky-tea/event'
import { EventSource } from 'eventsource'

const baseURL = process.env.MILKY_BASE_URL ?? 'https://milky.example.com'
const token = process.env.MILKY_TOKEN

const client = createMilkyClient({
  baseURL,
  token,
})

export async function handleEventPayload(payload: string): Promise<void> {
  const rawEvent: unknown = JSON.parse(payload)
  const event = await resolveMilkyEvent(rawEvent)

  if (
    event.event_type !== 'message_receive'
    || event.data.message_scene !== 'friend'
  ) {
    return
  }

  // Incoming and outgoing segment unions are intentionally different. This
  // example echoes the text segments that are valid in both directions.
  const message: OutgoingSegment[] = event.data.segments
    .filter(segment => segment.type === 'text')

  if (message.length === 0) {
    return
  }

  await client.message.sendPrivateMessage({
    user_id: event.data.sender_id,
    message,
  })
}

const eventURL = new URL('/event', baseURL)
if (token) {
  eventURL.searchParams.set('access_token', token)
}

const eventSource = new EventSource(eventURL)

eventSource.onmessage = (event) => {
  handleEventPayload(String(event.data)).catch(reportError)
}

// EventSource reconnects automatically after recoverable connection failures.
eventSource.onerror = (event) => {
  reportError(event.message ?? `EventSource error${event.code ? ` (${event.code})` : ''}`)
}

process.once('SIGINT', () => eventSource.close())
process.once('SIGTERM', () => eventSource.close())

function reportError(error: unknown): void {
  process.stderr.write(`${String(error)}\n`)
}
