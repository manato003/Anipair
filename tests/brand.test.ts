import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TAGLINE } from '../src/lib/brand'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8')
const css = read('src/index.css')

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

describe('brand colours', () => {
  it('has the three brand tokens and a gradient through them', () => {
    expect(token('brand-blue')).toBe('#7b9dff')
    expect(token('brand-lavender')).toBe('#c5b8ff')
    expect(token('brand-pink')).toBe('#ffb8d9')
    expect(css).toMatch(/--brand-gradient:\s*linear-gradient\(135deg,\s*var\(--brand-blue\),\s*var\(--brand-lavender\) 50%,\s*var\(--brand-pink\)\)/)
  })

  it('the primary button puts dark text on the gradient at 4.5:1 or better on every stop', () => {
    expect(css).toMatch(/\.btn--primary\s*\{[^}]*background:\s*var\(--brand-gradient\)/)
    const ink = token('ink')
    for (const stop of ['brand-blue', 'brand-lavender', 'brand-pink']) {
      expect(contrast(ink, token(stop))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('links and the accents on the dark background stay readable (4.5:1 or better)', () => {
    const ink = token('ink')
    for (const c of ['brand-blue', 'brand-lavender']) expect(contrast(token(c), ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('does not touch the colours that carry meaning (rating, wanna, danger)', () => {
    expect(token('r-bad')).toBe('#8e97b8')
    expect(token('r-average')).toBe('#d9c48f')
    expect(token('r-good')).toBe('#74d6b6')
    expect(token('r-great')).toBe('#ff9ec0')
    expect(token('wanna')).toBe('#b9a2ff')
    expect(token('danger')).toBe('#ff7a7a')
    expect(token('ink')).toBe('#161a2e')
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
