import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Canvas, FontLibrary } from 'skia-canvas'

const borderColor = '#ffffff'
const textColor = { start: '#EA7614', end: '#FAAA3B' }

const height = 256
const fontFamily = 'LINE Seed Sans KR'

const borderRatio = 1 / 15
const referenceFontSize = 200

const examples = ['그럴듯해', '메롱', '404', '당 신 이 몰 랐 던 사 실', 'SAM']

const require = createRequire(import.meta.url)
const fontDir = dirname(require.resolve('@kfonts/line-seed-sans-kr/package.json'))
FontLibrary.use(fontFamily, [join(fontDir, 'LINESeedKR-Bd.woff2')])

export async function draw(text: string): Promise<Blob> {
  const borderWidth = height * borderRatio

  const measureCanvas = new Canvas(1, 1)
  const mctx = measureCanvas.getContext('2d')
  mctx.font = `bold ${referenceFontSize}px "${fontFamily}"`
  mctx.textBaseline = 'alphabetic'
  const m = mctx.measureText(text)

  const refTextHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  const refTextWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight

  const targetTextHeight = height - 2 * borderWidth
  const scale = targetTextHeight / refTextHeight
  const fontSize = referenceFontSize * scale
  const textWidth = refTextWidth * scale

  const canvasWidth = Math.ceil(textWidth + 2 * borderWidth)

  const canvas = new Canvas(canvasWidth, height)
  const ctx = canvas.getContext('2d')

  ctx.font = `bold ${fontSize}px "${fontFamily}"`
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const x = borderWidth + m.actualBoundingBoxLeft * scale
  const y = borderWidth + m.actualBoundingBoxAscent * scale

  ctx.strokeStyle = borderColor
  ctx.lineWidth = 2 * borderWidth
  ctx.strokeText(text, x, y)

  const gradient = ctx.createLinearGradient(0, borderWidth, 0, height - borderWidth)
  gradient.addColorStop(0, textColor.start)
  gradient.addColorStop(1, textColor.end)
  ctx.fillStyle = gradient
  ctx.fillText(text, x, y)

  const buffer = await canvas.toBuffer('png')
  return new Blob([new Uint8Array(buffer)], { type: 'image/png' })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { writeFile, mkdir } = await import('node:fs/promises')
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples')
  await mkdir(outDir, { recursive: true })
  for (const text of examples) {
    const blob = await draw(text)
    const buf = Buffer.from(await blob.arrayBuffer())
    await writeFile(join(outDir, `${text}.png`), buf)
    console.log(`wrote ${text}.png`)
  }
}
