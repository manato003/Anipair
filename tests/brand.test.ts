import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TAGLINE } from '../src/lib/brand'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8')
// 色の変数と .btn--primary は共通の部品を置く base.css にある（index.css は @import の列だけ）
const css = read('src/styles/base.css')

function token(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`--${name} が見つかりません`)
  return m[1].toLowerCase()
}

// WCAG の相対輝度とコントラスト比
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// 季節の色。:root[data-season=…] と :root[data-scheme='dark'][data-season=…] の上と下の2色
function seasonPair(season: string, dark: boolean): [string, string] {
  const sel = dark ? `:root\\[data-scheme='dark'\\]\\[data-season='${season}'\\]` : `:root\\[data-season='${season}'\\]`
  const m = css.match(new RegExp(`${sel}\\s*\\{\\s*--s-top:\\s*(#[0-9a-fA-F]{6});\\s*--s-bot:\\s*(#[0-9a-fA-F]{6});`))
  if (!m) throw new Error(`${season} の色が見つかりません`)
  return [m[1].toLowerCase(), m[2].toLowerCase()]
}

describe('season colours', () => {
  const seasons = ['spring', 'summer', 'autumn', 'winter']

  it('has a light and a dark pair for every season', () => {
    for (const s of seasons) {
      expect(seasonPair(s, false)).toHaveLength(2)
      expect(seasonPair(s, true)).toHaveLength(2)
    }
  })

  it('keeps the text and the secondary text at 4.5:1 or better on both ends of every background', () => {
    for (const s of seasons) {
      for (const bg of seasonPair(s, false)) {
        expect(contrast('#1c1b1f', bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrast('#4a4650', bg)).toBeGreaterThanOrEqual(4.5)
      }
      for (const bg of seasonPair(s, true)) {
        expect(contrast('#ffffff', bg)).toBeGreaterThanOrEqual(4.5)
        expect(contrast('#e0dcd8', bg)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('names the text colours the contrast check uses', () => {
    expect(token('fg')).toBe('#1c1b1f')
    expect(token('sub')).toBe('#4a4650')
    expect(css).toMatch(/:root\[data-scheme='dark'\]\s*\{\s*--fg:\s*#ffffff;\s*--sub:\s*#e0dcd8;/)
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
