/* eslint-disable no-console */
import { createMilkyClient } from '@/index'

const milky = createMilkyClient({
  baseURL: 'http://127.0.0.1:3100',
})

const source = milky.event()

source.on('open', () => console.log('Milky connected'))

source.on('message_receive', async ({ self_id, data }) => {
  if (data.segments.length < 2 || data.message_scene !== 'group' || data.sender_id === self_id) {
    return
  }

  const [first, second] = data.segments
  if (first.type !== 'mention' || first.data.user_id !== self_id || second.type !== 'text') {
    return
  }

  const content = second.data.text.trim()

  console.log(`Mentioned by ${data.group_member.nickname} (${data.group_member.user_id}), content: ${content}`)

  await milky.message.sendGroupMessage({
    group_id: data.peer_id,
    message: [
      {
        type: 'reply',
        data: { message_seq: data.message_seq },
      },
      {
        type: 'text',
        data: {
          text: content,
        },
      },
    ],
  })
})
