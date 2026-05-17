import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Canvas, FontLibrary } from 'skia-canvas'

const borderColor = '#ffffff'
const textColor = { start: '#EA7614', end: '#FAAA3B' }

const height = 256
const fontFamily = 'LINE Seed Sans KR'

const borderRatio = 1 / 15
const paddingRatio = 1 / 8
const referenceFontSize = 200
const gapRatio = 1 / 15

const examples = ['그럴듯해', '위업', '최고', '당 신 이 몰 랐 던 사 실', '당신은잘오다', 'ㄹㅇㅋㅋ', 'ㅎㅇ요']

FontLibrary.use(fontFamily, [join(import.meta.dirname, 'font.otf')])

type InkBox = { left: number; right: number; top: number; bottom: number; empty: boolean; advance: number }

function measureInkBox(char: string): InkBox {
  const probeCanvas = new Canvas(referenceFontSize * 3, referenceFontSize * 3)
  const pctx = probeCanvas.getContext('2d')
  pctx.font = `bold ${referenceFontSize}px "${fontFamily}"`
  pctx.textBaseline = 'alphabetic'
  pctx.fillStyle = '#000000'
  const originX = referenceFontSize
  const originY = referenceFontSize * 2
  pctx.fillText(char, originX, originY)

  const advance = pctx.measureText(char).width
  const { width: w, height: h } = probeCanvas
  const img = pctx.getImageData(0, 0, w, h)
  const data = img.data

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return { left: 0, right: 0, top: 0, bottom: 0, empty: true, advance }
  return {
    left: minX - originX,
    right: maxX + 1 - originX,
    top: originY - minY,
    bottom: originY - (maxY + 1),
    empty: false,
    advance,
  }
}

export async function draw(text: string): Promise<Blob> {
  const borderWidth = height * borderRatio
  const padding = height * paddingRatio

  const chars = [...text]
  const boxes = chars.map(measureInkBox)

  const gap = referenceFontSize * gapRatio
  const inkBoxes = boxes.filter((b) => !b.empty)
  const refAscent = Math.max(...inkBoxes.map((b) => b.top))
  const refDescent = Math.max(...inkBoxes.map((b) => -b.bottom), 0)
  const refTextHeight = refAscent + refDescent

  let refTextWidth = 0
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    refTextWidth += b.empty ? b.advance : b.right - b.left
    if (i < boxes.length - 1) refTextWidth += gap
  }

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

  const baselineY = padding + borderWidth + refAscent * scale

  const gradient = ctx.createLinearGradient(0, padding + borderWidth, 0, padding + height - borderWidth)
  gradient.addColorStop(0, textColor.start)
  gradient.addColorStop(1, textColor.end)

  let cursorX = padding + borderWidth
  for (let i = 0; i < chars.length; i++) {
    const b = boxes[i]
    if (b.empty) {
      cursorX += b.advance * scale
      if (i < chars.length - 1) cursorX += gap * scale
      continue
    }

    const drawX = cursorX - b.left * scale

    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2 * borderWidth
    ctx.strokeText(chars[i], drawX, baselineY)

    ctx.fillStyle = gradient
    ctx.fillText(chars[i], drawX, baselineY)

    cursorX += (b.right - b.left) * scale
    if (i < chars.length - 1) cursorX += gap * scale
  }

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
