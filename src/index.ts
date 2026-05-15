import { romanize } from 'es-hangul'
import { api, Stream } from 'misskey-js'
import { draw } from './image.js'

const prefix = 'ko_'
const category = '텍모지'

const host = process.env.MISSKEY_HOST
if (!host) throw new Error('MISSKEY_HOST is not set')

const botToken = process.env.MISSKEY_BOT_TOKEN
if (!botToken) throw new Error('MISSKEY_BOT_TOKEN is not set')

const emojiAdminToken = process.env.MISSKEY_EMOJI_ADMIN_TOKEN
if (!emojiAdminToken) throw new Error('MISSKEY_EMOJI_ADMIN_TOKEN is not set')

const botClient = new api.APIClient({ origin: host, credential: botToken })
const emojiAdminClient = new api.APIClient({ origin: host, credential: emojiAdminToken })

function createPayload(comment: string) {
  const pronunciation = comment.replaceAll(/\s/g, '')
  const aliases = comment === pronunciation ? [comment] : [comment, pronunciation]

  const name = prefix + romanize(pronunciation)
  const reaction = `:${name}:`

  return { pronunciation, aliases, name, reaction }
}

async function isEmojiRegistered(name: string) {
  try {
    const emoji = await emojiAdminClient.request('emoji', { name })
    return Boolean(emoji)
  } catch {
    return false
  }
}

class AlreadyRegisteredError extends Error {
  public reaction: string
  constructor(reaction: string) {
    super(`${reaction} is already registered in ${host}`)
    this.reaction = reaction
  }
}

async function createReaction(comment: string) {
  const { name, aliases, reaction } = createPayload(comment)
  if (await isEmojiRegistered(name)) throw new AlreadyRegisteredError(reaction)

  const { id: fileId } = await botClient.request('drive/files/create', { name, comment, file: await draw(comment) })
  await emojiAdminClient.request('admin/emoji/add', { name, fileId, category, aliases })

  return reaction
}

const stream = new Stream(host, { token: botToken })
const mainChannel = stream.useChannel('main')
mainChannel.on('notification', async (notification) => {
  if (notification.type !== 'mention' && notification.type !== 'reply') return

  const { user, text, id: replyId, visibility: v } = notification.note
  if (user.isBot || user.host !== null || !text?.trim()) return

  // 봇 따위가 공개글을 써서는 안 된다...
  const visibility = v === 'public' ? 'home' : v
  console.log('mention:', user.username, text)

  const comments = [...text.matchAll(/:([^:]+):/g)].map((m) => m[1].trim()).filter((m) => m)
  if (!comments.length) {
    return await botClient.request('notes/create', {
      replyId,
      visibility,
      text: '🤖 안녕하세요! 저에게 :이렇게: 만들고 싶은 커모지를 멘션으로 일려주세요.',
    })
  }

  const result = await Promise.allSettled(comments.map(createReaction))
  console.log('result:', result)

  const added = result.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  const skipped = result.flatMap((r) => (r.status === 'rejected' && r.reason instanceof AlreadyRegisteredError ? [r.reason.reaction] : []))
  const failed = result.filter((r) => r.status === 'rejected' && !(r.reason instanceof AlreadyRegisteredError))

  const reply = [
    `🤖 요청 ${result.length}건, 성공 ${added.length}건, 스킵 ${skipped.length}건, 실패 ${failed.length}건`,
    '',
    added.length > 0 ? `🆕 새로 추가됨: ${added.join(' ')}` : null,
    skipped.length > 0 ? `➡️ 이미 등록됨: ${skipped.join(' ')}` : null,
  ]

  return await botClient.request('notes/create', {
    replyId,
    visibility,
    text: reply.filter((line) => line !== null).join('\n'),
  })
})
