import { romanize } from 'es-hangul'
import { api, Stream } from 'misskey-js'
import { createEmoji } from './image.js'

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

async function isEmojiAvailable(name: string) {
  try {
    const emoji = await emojiAdminClient.request('emoji', { name })
    return !emoji
  } catch {
    return true
  }
}

const stream = new Stream(host, { token: botToken })
const mainChannel = stream.useChannel('main')
mainChannel.on('notification', async (notification) => {
  if (notification.type !== 'mention') return
  if (notification.user.host !== null) return

  const { text, id: noteId, visibility } = notification.note
  if (!text) return

  const keyword = text.match(/:([^:]+):/)?.[1]?.trim()
  if (!keyword) return

  // "당 신 이 몰 랐 던 사 실" 추가하면 "당신이몰랐던사실"도 태그로 등록
  const denseKeyword = keyword.replaceAll(/\s/g, '')
  const [name, aliases] = [prefix + romanize(denseKeyword), keyword === denseKeyword ? [keyword] : [keyword, denseKeyword]]

  if (await isEmojiAvailable(name)) {
    try {
      const file = await createEmoji(keyword)
      const { id: fileId } = await botClient.request('drive/files/create', { name, file, comment: keyword })

      await emojiAdminClient.request('admin/emoji/add', { name, fileId, category, aliases })
      await botClient.request('notes/reactions/create', { noteId, reaction: `:${name}:` })
      await botClient.request('notes/create', { visibility, replyId: noteId, text: `:${name}: ${name} 커모지가 등록되었어요!` })
    } catch (error) {
      console.error(error)
      await botClient.request('notes/create', { visibility, replyId: noteId, text: `실패했습니다... 관리자에게 문의하세요...` })
    }
  } else {
    await botClient.request('notes/create', { visibility, replyId: noteId, text: `:${name}: 이미 ${name} 커모지가 등록되어 있어요.` })
  }
})
