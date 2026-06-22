import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Canvas, FontLibrary } from 'skia-canvas'

function hexColor(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`${name} must be a 6-digit hex color without '#' (got "${value}")`)
  }
  return `#${value}`
}

const borderColor = hexColor('BORDER_COLOR', 'ffffff')
const textColor = {
  start: hexColor('TEXT_COLOR_START', 'EA7614'),
  end: hexColor('TEXT_COLOR_END', 'FAAA3B'),
}

const height = 256
const fontFamily = 'LINE Seed Sans KR'

const borderRatio = 1 / 15
const paddingRatio = 1 / 8
const referenceFontSize = 200
const gapRatio = 1 / 15
const lineGapRatio = 1 / 10

const gap = referenceFontSize * gapRatio
const lineGap = referenceFontSize * lineGapRatio

const examples = [
  '그럴듯해',
  '위업',
  '최고',
  '당 신 이 몰 랐 던 사 실',
  '당신은잘오다',
  'ㄹㅇㅋㅋ',
  'ㅎㅇ요',
  '나를모르느냐',
  '나를모\n르느냐',
  '나를\n모르느냐',
  'ㅋㅋㅋ\nㅋㅋㅋ\nㅋㅋㅋ',
]

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

type LineLayout = {
  chars: string[]
  boxes: InkBox[]
  refAscent: number
  refTextHeight: number
  refTextWidth: number
}

function layoutLine(line: string): LineLayout {
  const chars = [...line]
  const boxes = chars.map(measureInkBox)

  const inkBoxes = boxes.filter((b) => !b.empty)
  const refAscent = inkBoxes.length ? Math.max(...inkBoxes.map((b) => b.top)) : 0
  const refDescent = inkBoxes.length ? Math.max(...inkBoxes.map((b) => -b.bottom), 0) : 0
  const refTextHeight = refAscent + refDescent

  let refTextWidth = 0
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    refTextWidth += b.empty ? b.advance : b.right - b.left
    if (i < boxes.length - 1) refTextWidth += gap
  }

  return { chars, boxes, refAscent, refTextHeight, refTextWidth }
}

export async function draw(text: string): Promise<Blob> {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const layouts = lines.map(layoutLine)

  const multiline = layouts.length > 1
  const padding = multiline ? 0 : height * paddingRatio
  const borderWidth = height * borderRatio * (multiline ? 0.75 : 1)

  const refTotalHeight = layouts.reduce((sum, l) => sum + l.refTextHeight, 0) + (layouts.length - 1) * lineGap
  const targetTextHeight = height - 2 * borderWidth
  const scale = targetTextHeight / refTotalHeight
  const fontSize = referenceFontSize * scale

  const borderGap = multiline ? (-0.1 * borderWidth) / scale : 0
  const lineRefWidth = (l: LineLayout) => l.refTextWidth + Math.max(l.chars.length - 1, 0) * borderGap

  const refTextWidth = Math.max(...layouts.map(lineRefWidth))
  const textWidth = refTextWidth * scale

  const canvasWidth = Math.ceil(textWidth + 2 * borderWidth + 2 * padding)
  const canvasHeight = height + 2 * padding

  const canvas = new Canvas(canvasWidth, canvasHeight)
  const ctx = canvas.getContext('2d')

  ctx.font = `bold ${fontSize}px "${fontFamily}"`
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const gradient = ctx.createLinearGradient(0, padding + borderWidth, 0, padding + height - borderWidth)
  gradient.addColorStop(0, textColor.start)
  gradient.addColorStop(1, textColor.end)

  const charGap = (gap + borderGap) * scale
  const glyphs: { char: string; x: number; y: number }[] = []

  let lineTop = padding + borderWidth
  for (const layout of layouts) {
    const baselineY = lineTop + layout.refAscent * scale
    let cursorX = padding + borderWidth + (textWidth - lineRefWidth(layout) * scale) / 2

    for (let i = 0; i < layout.chars.length; i++) {
      const b = layout.boxes[i]
      if (b.empty) {
        cursorX += b.advance * scale
        if (i < layout.chars.length - 1) cursorX += charGap
        continue
      }

      glyphs.push({ char: layout.chars[i], x: cursorX - b.left * scale, y: baselineY })

      cursorX += (b.right - b.left) * scale
      if (i < layout.chars.length - 1) cursorX += charGap
    }

    lineTop += (layout.refTextHeight + lineGap) * scale
  }

  ctx.strokeStyle = borderColor
  ctx.lineWidth = 2 * borderWidth
  for (const g of glyphs) ctx.strokeText(g.char, g.x, g.y)

  ctx.fillStyle = gradient
  for (const g of glyphs) ctx.fillText(g.char, g.x, g.y)

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
    const fileName = `${text.replaceAll('\n', '_')}.png`
    await writeFile(join(outDir, fileName), buf)
    console.log(`wrote ${fileName}`)
  }
}
