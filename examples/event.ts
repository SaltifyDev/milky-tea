import { resolveMilkyEvent } from '@saltify/milky-tea/event'

type EmitEvent = (summary: string, details?: unknown) => void

export async function handleEventPayload(
  payload: string,
  emit: EmitEvent,
): Promise<void> {
  const rawEvent: unknown = JSON.parse(payload)
  const event = await resolveMilkyEvent(rawEvent)

  // event_type narrows both the event and its data payload.
  switch (event.event_type) {
    case 'message_receive':
      emit(
        `Message ${event.data.message_seq} from ${event.data.sender_id}`,
        event.data.segments,
      )
      break

    case 'bot_offline':
      emit(`Bot ${event.self_id} went offline: ${event.data.reason}`)
      break

    default:
      emit(`Received ${event.event_type}`)
  }
}
