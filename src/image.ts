import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Canvas, FontLibrary } from 'skia-canvas'

const borderColor = '#ffffff'
const textColor = { start: '#EA7614', end: '#FAAA3B' }

const height = 256
const fontFamily = 'LINE Seed Sans KR'

const borderRatio = 1 / 15
const paddingRatio = 1 / 10
const referenceFontSize = 200

const examples = ['그럴듯해', '위업', '최고', '당 신 이 몰 랐 던 사 실', '당신은잘오다']

FontLibrary.use(fontFamily, [join(import.meta.dirname, 'font.otf')])

export async function draw(text: string): Promise<Blob> {
  const borderWidth = height * borderRatio
  const padding = height * paddingRatio

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

  const canvasWidth = Math.ceil(textWidth + 2 * borderWidth + 2 * padding)
  const canvasHeight = height + 2 * padding

  const canvas = new Canvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')

  ctx.font = `bold ${fontSize}px "${fontFamily}"`
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const x = padding + borderWidth + m.actualBoundingBoxLeft * scale
  const y = padding + borderWidth + m.actualBoundingBoxAscent * scale

  ctx.strokeStyle = borderColor
  ctx.lineWidth = 2 * borderWidth
  ctx.strokeText(text, x, y)

  const gradient = ctx.createLinearGradient(0, padding + borderWidth, 0, padding + height - borderWidth)
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
