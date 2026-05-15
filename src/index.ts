import { romanize } from 'es-hangul'
import { api, Stream } from 'misskey-js'
import { createEmoji } from './image.js'

const prefix = 'ko_'
const category = '텍모지'

const host = process.env.MISSKEY_HOST
if (!host) throw new Error('MISSKEY_HOST is not set')

const token = process.env.MISSKEY_TOKEN
if (!token) throw new Error('MISSKEY_TOKEN is not set')

const stream = new Stream(host, { token })
const client = new api.APIClient({ origin: host, credential: token })

const mainChannel = stream.useChannel('main')
mainChannel.on('notification', async (notification) => {
  if (notification.type !== 'mention') return
  if (notification.user.host !== null) return

  const { text, id: noteId } = notification.note
  if (!text) return

  const keyword = text.match(/:([^:]+):/)?.[1]?.replaceAll(/\s/g, '')
  if (!keyword) return

  const name = prefix + romanize(keyword)
  const file = await createEmoji(keyword)

  const { id: fileId } = await client.request('drive/files/create', { name, file, comment: keyword })

  await client.request('admin/emoji/add', { name, fileId, category, aliases: [keyword] })

  await client.request('notes/reactions/create', { noteId, reaction: `:${name}:` })
})
