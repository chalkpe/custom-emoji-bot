import { romanize } from 'es-hangul'
import { api, Stream } from 'misskey-js'
import { draw } from './image.js'

const prefix = 'ko_'
const category = '텍모지'

const jamoNames: Record<string, string> = {
  ㄳ: '기역시옷', ㄵ: '니은지읒', ㄶ: '니은히읗',
  ㄺ: '리을기역', ㄻ: '리을미음', ㄼ: '리을비읍',
  ㄽ: '리을시옷', ㄾ: '리을티읕', ㄿ: '리을피읖',
  ㅀ: '리을히읗', ㅄ: '비읍시옷',
  ㄲ: '쌍기역', ㄸ: '쌍디귿', ㅃ: '쌍비읍', ㅆ: '쌍시옷', ㅉ: '쌍지읒',
  ㄱ: '기역', ㄴ: '니은', ㄷ: '디귿', ㄹ: '리을',
  ㅁ: '미음', ㅂ: '비읍', ㅅ: '시옷', ㅇ: '이응',
  ㅈ: '지읒', ㅊ: '치읓', ㅋ: '키읔', ㅌ: '티읕',
  ㅍ: '피읖', ㅎ: '히읗',
  ㅏ: '아', ㅐ: '애', ㅓ: '어', ㅔ: '에', ㅗ: '오',
  ㅜ: '우', ㅟ: '위', ㅚ: '외', ㅡ: '으', ㅣ: '이',
  ㅑ: '야', ㅒ: '얘', ㅕ: '여', ㅖ: '예', ㅘ: '와',
  ㅙ: '왜', ㅛ: '요', ㅝ: '워', ㅞ: '웨', ㅠ: '유', ㅢ: '의',
}

function expandJamo(text: string): string {
  return [...text].map((ch) => jamoNames[ch] ?? ch).join('')
}

const host = process.env.MISSKEY_HOST
if (!host) throw new Error('MISSKEY_HOST is not set')

const botToken = process.env.MISSKEY_BOT_TOKEN
if (!botToken) throw new Error('MISSKEY_BOT_TOKEN is not set')

const emojiAdminToken = process.env.MISSKEY_EMOJI_ADMIN_TOKEN
if (!emojiAdminToken) throw new Error('MISSKEY_EMOJI_ADMIN_TOKEN is not set')

const botClient = new api.APIClient({ origin: host, credential: botToken })
const emojiAdminClient = new api.APIClient({ origin: host, credential: emojiAdminToken })

function createPayload(comment: string) {
  const pronunciation = expandJamo(comment.replaceAll(/\s/g, ''))
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
