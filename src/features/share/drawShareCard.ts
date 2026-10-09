import type { Rarity } from '../achievements/titles'
import { SHARE_URL, type ShareCard } from './shareCard'

// 共有の画像を canvas に描いて PNG にする（縦 1080×1350。SNS の縦長の投稿に合う）。端末の中だけで作る。
// 書体は画面と同じ（Google Fonts）。描く前に、使う文字の分だけ読み込む（読み込む前に描くと別の書体になる）

const W = 1080
const H = 1350
const PAD = 72
const UI = "'Zen Maru Gothic', system-ui, sans-serif"
// 見出しも本文と同じ書体の太字（見出し用の書体は持たない）
const DISPLAY = "'Zen Maru Gothic', sans-serif"
const INK = '#12152a'
const PAPER = '#f4f2ff'
const MUTED = '#a3a6c4'
const LINE = 'rgba(197, 184, 255, 0.22)'
const LAVENDER = '#c5b8ff'

// 称号の光の色（styles/achievements.css の --tint）
const TINT: Record<Rarity, string> = {
  bronze: '#d6925a',
  silver: '#c8d2dc',
  gold: '#f4c44f',
  amethyst: '#bb83ff',
  crimson: '#ff5268',
  radiant: '#fff1b0',
  origin: '#fff2c4',
}

async function loadFonts(card: ShareCard): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const all = [card.headline, card.footer, card.title?.name ?? '', ...card.kpis.flatMap((k) => [k.label, k.value]), ...card.facts.flatMap((f) => [f.label, f.value]), ...(card.radar ?? []).map((r) => r.label), '0123456789/%〜年本あなたの傾向も']
  const text = [...new Set(all.join(''))].join('')
  await Promise.allSettled([
    document.fonts.load(`400 28px 'Zen Maru Gothic'`, text),
    document.fonts.load(`700 28px 'Zen Maru Gothic'`, text),
    document.fonts.load(`700 40px 'Quicksand'`, 'Anipair'),
  ])
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 幅に収まるように行を分ける。区切り（「・」「 / 」）のところで折り返し、1つの語が収まらなければ1文字ずつ。
// 収まらない分は … で切る
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const fits = (t: string) => ctx.measureText(t).width <= maxWidth
  const tokens = text.split(/(?<=・| \/ )/)
  const lines: string[] = []
  let line = ''
  const push = (t: string) => {
    lines.push(t.replace(/(・| \/ )$/, '').trimEnd())
  }
  for (const token of tokens) {
    if (fits(line + token)) {
      line += token
      continue
    }
    if (line) push(line)
    line = ''
    // 1つの語が1行に収まらないときは、1文字ずつ詰める
    for (const ch of token) {
      if (fits(line + ch)) line += ch
      else {
        push(line)
        line = ch
      }
    }
  }
  if (line) push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && !fits(`${last}…`)) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last}…`
  return kept
}

function drawRadar(ctx: CanvasRenderingContext2D, axes: NonNullable<ShareCard['radar']>, cx: number, cy: number, R: number) {
  const n = axes.length
  const pt = (i: number, r: number) => [cx + r * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n), cy + r * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n)] as const
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  for (const k of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath()
    axes.forEach((_, i) => {
      const [x, y] = pt(i, k * R)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.stroke()
  }
  ctx.beginPath()
  axes.forEach((a, i) => {
    const [x, y] = pt(i, Math.max(0.04, a.value) * R)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(197, 184, 255, 0.22)'
  ctx.fill()
  ctx.strokeStyle = LAVENDER
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.font = `700 26px ${UI}`
  ctx.fillStyle = PAPER
  axes.forEach((a, i) => {
    const [x, y] = pt(i, R + 40)
    ctx.textAlign = Math.abs(x - cx) < 10 ? 'center' : x > cx ? 'left' : 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(a.label, x, y)
  })
}

export async function drawShareCard(card: ShareCard, now = new Date()): Promise<Blob> {
  await loadFonts(card)
  const logo = await loadImage('/logo-mark.svg')
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('この端末では画像を作れませんでした')

  // 地: 濃い紺に、ロゴの色の光をにじませる
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(18, 21, 42, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(120, 80, 620, 'rgba(123, 157, 255, 0.22)')
  glow(W - 80, H - 120, 640, 'rgba(255, 184, 217, 0.16)')

  // 上: ロゴと日付
  if (logo) ctx.drawImage(logo, PAD, 64, 72, 48)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = PAPER
  ctx.font = `700 40px 'Quicksand', ${UI}`
  ctx.fillText('Anipair', PAD + 88, 90)
  ctx.textAlign = 'right'
  ctx.fillStyle = MUTED
  ctx.font = `400 26px ${UI}`
  ctx.fillText(`${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`, W - PAD, 90)

  // 見出しと称号
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = PAPER
  ctx.font = `700 72px ${DISPLAY}`
  ctx.fillText(card.headline, PAD, 210)
  let y = 240
  if (card.title) {
    const tint = TINT[card.title.rarity]
    ctx.font = `700 34px ${UI}`
    const w = Math.min(W - PAD * 2, ctx.measureText(card.title.name).width + 72)
    roundRect(ctx, PAD, y, w, 64, 32)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fill()
    ctx.strokeStyle = tint
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = tint
    ctx.textBaseline = 'middle'
    ctx.fillText(card.title.name, PAD + 36, y + 33, w - 72)
    y += 92
  } else {
    y += 16
  }

  // 大きな数
  const gap = 20
  const boxW = (W - PAD * 2 - gap * (card.kpis.length - 1)) / Math.max(1, card.kpis.length)
  card.kpis.forEach((k, i) => {
    const x = PAD + i * (boxW + gap)
    roundRect(ctx, x, y, boxW, 140, 20)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = PAPER
    ctx.font = `700 56px ${DISPLAY}`
    ctx.fillText(k.value, x + boxW / 2, y + 78, boxW - 24)
    ctx.fillStyle = MUTED
    ctx.font = `400 26px ${UI}`
    ctx.fillText(k.label, x + boxW / 2, y + 118, boxW - 24)
  })
  y += 140 + 36

  // 一言ずつの特徴の置き方: レーダーがあれば2列、無ければ1列。下の URL の線（H - 96）より上に収める
  const cols = card.radar ? 2 : 1
  const colW = (W - PAD * 2 - (cols - 1) * 40) / cols
  const rows = Math.ceil(card.facts.length / cols)
  // 2列（レーダーのあるとき）の1段の高さ。1列のときは下で、項目ごとの行数から決める
  const rowH = 120
  const factsH = card.radar ? rows * rowH : 0

  // ジャンルの好み（あれば）。大きさは、特徴の分を除いた残りの高さで決める
  if (card.radar) {
    const space = H - 120 - y - factsH
    const R = Math.max(90, Math.min(160, (space - 120) / 2))
    ctx.textAlign = 'left'
    ctx.fillStyle = MUTED
    ctx.font = `700 26px ${UI}`
    ctx.fillText('ジャンルの好み', PAD, y + 10)
    drawRadar(ctx, card.radar, W / 2, y + 60 + R, R)
    y += 2 * R + 120
  }

  // 各項目の行（値は2行まで）。1列のときは、実際の行数で高さを決め、余った高さを項目の間に均等に配る
  const laid = card.facts.map((f) => {
    const tint = f.rarity ? TINT[f.rarity] : null
    const indent = tint ? 34 : 0
    ctx.font = `700 ${tint ? 38 : 32}px ${UI}`
    return { f, tint, indent, lines: wrap(ctx, f.value, colW - indent, 2) }
  })
  const heightOf = (n: number) => 70 + (n - 1) * 40
  const bottom = H - 130
  let gapY = 0
  if (cols === 1 && laid.length > 0) {
    const content = laid.reduce((a, l) => a + heightOf(l.lines.length), 0)
    gapY = Math.max(28, Math.min(64, (bottom - y - content) / laid.length))
  }
  let cursor = y
  laid.forEach(({ f, tint, indent, lines }, i) => {
    const x = PAD + (i % cols) * (colW + 40)
    const top = cols === 1 ? cursor : y + Math.floor(i / cols) * rowH
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    // 称号は、レア度の色の印と色の文字で
    if (tint) {
      ctx.fillStyle = tint
      ctx.beginPath()
      ctx.arc(x + 11, top + 54, 11, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = tint ?? MUTED
    ctx.font = `${tint ? 700 : 400} 24px ${UI}`
    ctx.fillText(f.label, x + indent, top + 26, colW - indent)
    ctx.fillStyle = PAPER
    ctx.font = `700 ${tint ? 38 : 32}px ${UI}`
    lines.forEach((line, k) => ctx.fillText(line, x + indent, top + 70 + k * 40))
    cursor += heightOf(lines.length) + gapY
  })

  // 下: アプリの URL
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, H - 96)
  ctx.lineTo(W - PAD, H - 96)
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = MUTED
  ctx.font = `400 26px ${UI}`
  ctx.fillText(`${card.footer} → ${SHARE_URL.replace(/^https:\/\/|\/$/g, '')}`, W / 2, H - 52)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png'))
}
