import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TAGLINE } from '../src/lib/brand'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8')
// 色の変数と .btn--primary は共通の部品を置く base.css にある（index.css は @import の列だけ）
const css = read('src/styles/base.css')

// WCAG の相対輝度とコントラスト比
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// 地と文字の色。明るい地（有明）は :root、暗い地（夜）は :root[data-scheme='dark'] の最初の4つの変数
function scheme(dark: boolean): { top: string; bot: string; fg: string; sub: string; accent: string } {
  const sel = dark ? ":root\\[data-scheme='dark'\\]" : ':root'
  const hex = '(#[0-9a-fA-F]{6})'
  const m = css.match(new RegExp(`${sel}\\s*\\{\\s*--s-top:\\s*${hex};\\s*--s-bot:\\s*${hex};\\s*--fg:\\s*${hex};\\s*--sub:\\s*${hex};`))
  if (!m) throw new Error(`${dark ? '夜' : '有明'}の色が見つかりません`)
  const block = css.slice(m.index!, css.indexOf('}', m.index!))
  const accent = block.match(new RegExp(`--brand-gradient:\\s*${hex}`))
  if (!accent) throw new Error('差し色が見つかりません')
  const [top, bot, fg, sub] = m.slice(1, 5).map((c) => c.toLowerCase())
  return { top, bot, fg, sub, accent: accent[1].toLowerCase() }
}

describe('theme colours', () => {
  it.each([false, true])('keeps the text and the secondary text at 4.5:1 or better on both ends of the background (dark: %s)', (dark) => {
    const c = scheme(dark)
    for (const bg of [c.top, c.bot]) {
      expect(contrast(c.fg, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.sub, bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each([false, true])('keeps the label of the primary button readable on the accent (dark: %s)', (dark) => {
    // 主なボタンは差し色の地に、地の下端の色の字（.btn--primary）
    const c = scheme(dark)
    expect(contrast(c.accent, c.bot)).toBeGreaterThanOrEqual(4.5)
  })

  it('has no season colours for the background any more', () => {
    expect(css).not.toMatch(/\[data-season='\w+'\]\s*\{\s*--s-top/)
  })
})

describe('tagline', () => {
  it('is the exact wording, with 「」 inside', () => {
    expect(TAGLINE).toBe('あなたの「好き」と、次の「好き」をつなぐ。')
  })

  it.each(['index.html', 'public/manifest.webmanifest', 'README.md'])('is in %s', (file) => {
    expect(read(file)).toContain(TAGLINE)
  })
})
