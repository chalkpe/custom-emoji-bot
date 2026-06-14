import { api } from 'misskey-js'
import { draw } from './image.js'

const category = process.env.EMOJI_CATEGORY ?? '텍모지'

const host = process.env.MISSKEY_HOST
if (!host) throw new Error('MISSKEY_HOST is not set')

const botToken = process.env.MISSKEY_BOT_TOKEN
if (!botToken) throw new Error('MISSKEY_BOT_TOKEN is not set')

const emojiAdminToken = process.env.MISSKEY_EMOJI_ADMIN_TOKEN
if (!emojiAdminToken) throw new Error('MISSKEY_EMOJI_ADMIN_TOKEN is not set')

const botClient = new api.APIClient({ origin: host, credential: botToken })
const emojiAdminClient = new api.APIClient({ origin: host, credential: emojiAdminToken })

function fetchPage(untilId?: string) {
  if (untilId) return emojiAdminClient.request('admin/emoji/list', { limit: 100, untilId })
  return emojiAdminClient.request('admin/emoji/list', { limit: 100 })
}

async function fetchAllCategoryEmojis() {
  const result: { id: string; name: string; aliases: string[] }[] = []
  let untilId: string | undefined

  while (true) {
    const page = await fetchPage(untilId)

    if (!page.length) break
    result.push(...page.filter((e) => e.category === category))
    untilId = page[page.length - 1].id

    if (page.length < 100) break
  }

  return result
}

const targets = await fetchAllCategoryEmojis()
console.log(`"${category}" 카테고리 이모지 ${targets.length}개 발견`)

let ok = 0
let skipped = 0
let failed = 0

for (const emoji of targets) {
  const comment = emoji.aliases?.[0]
  if (!comment) {
    console.warn(`[SKIP] ${emoji.name}: 첫 번째 alias 없음`)
    skipped++
    continue
  }

  console.log(`[${emoji.name}] "${comment}" 재생성 중...`)

  try {
    const { id: fileId } = await botClient.request('drive/files/create', {
      name: emoji.name,
      comment,
      file: await draw(comment),
    })

    await emojiAdminClient.request('admin/emoji/update', { id: emoji.id, fileId })

    console.log(`  ✓ :${emoji.name}: 업데이트 완료`)
    ok++
  } catch (err) {
    console.error(`  ✗ 실패:`, err)
    failed++
  }
}

console.log(`\n완료: 성공 ${ok}건, 스킵 ${skipped}건, 실패 ${failed}건`)
