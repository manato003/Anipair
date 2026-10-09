import { useEffect } from 'react'
import { seasonOf, type SeasonName } from './season'

// 画面の色の設定（設定の「表示」）。端末ごと。
// - color: 地の色。auto は、いま見ているクールの季節（評価の画面が知らせる。知らせが無ければ今日の季節）
// - brightness: auto は端末の明暗に従う。darker は季節の色を黒に大きく寄せる（暗い部屋・有機 EL 向け）
// - tod: 時刻で地を少し暗くする（深夜がいちばん暗い）
// - hand: 片手操作。left にすると、よく押すボタンを左に寄せる（スマホだけ。styles の [data-hand='left']）
// - motion: 画面の動き。auto は端末の「動きを減らす」に従う。on は端末の設定にかかわらず動かす、reduce は止める。
//   端末の設定は、本人が選んだのではなく初めから入っていることがあり、人によって見え方が変わっていた。
//   アプリの中で選べるようにし、端末の設定で止まっているときは、設定の「表示」でそう知らせる
export type ThemeColor = 'auto' | SeasonName
export type Brightness = 'auto' | 'light' | 'dark' | 'darker'
export type Hand = 'right' | 'left'
export type Motion = 'auto' | 'on' | 'reduce'
export interface ThemePrefs {
  color: ThemeColor
  brightness: Brightness
  tod: boolean
  hand: Hand
  motion: Motion
}

export const DEFAULT_THEME: ThemePrefs = { color: 'auto', brightness: 'auto', tod: true, hand: 'right', motion: 'auto' }

const KEY = 'animax.theme.v1'
const SEASONS: readonly SeasonName[] = ['spring', 'summer', 'autumn', 'winter']

export function parseTheme(value: unknown): ThemePrefs {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    color: v.color === 'auto' || SEASONS.includes(v.color as SeasonName) ? (v.color as ThemeColor) : DEFAULT_THEME.color,
    brightness: ['auto', 'light', 'dark', 'darker'].includes(v.brightness as string) ? (v.brightness as Brightness) : DEFAULT_THEME.brightness,
    tod: typeof v.tod === 'boolean' ? v.tod : DEFAULT_THEME.tod,
    hand: v.hand === 'left' ? 'left' : 'right',
    motion: v.motion === 'on' || v.motion === 'reduce' ? v.motion : 'auto',
  }
}

export function loadTheme(): ThemePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    return parseTheme(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_THEME
  }
}

export function saveTheme(prefs: ThemePrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // 保存できない環境では、この起動のあいだだけ効く
  }
}

// 時刻で地を黒に寄せる割合（%）。深夜アニメの時間帯がいちばん暗い
export function todShade(hour: number): number {
  if (hour < 5) return 26
  if (hour < 10) return 6
  if (hour < 17) return 0
  if (hour < 22) return 12
  return 26
}

// いま見ているクールの季節。テーマの色が「自動」なら、地をその季節の色にする（クールの無い画面では、いまの季節）
let viewing: SeasonName | null = null
let current: ThemePrefs = DEFAULT_THEME

export function setViewingSeason(season: SeasonName | null): void {
  if (viewing === season) return
  viewing = season
  applyTheme(current)
}

// クールを選ぶ画面（評価・ブラウズ・記録）が、表示されているあいだ自分のクールを知らせる。
// 隠れたら知らせを外す（クールの無い画面に移れば、いまの季節に戻る）。React は同じ更新の中で、外す処理をすべて済ませてから付ける処理を動かすので、
// 画面を移るときは、前の画面が外してから次の画面が付ける
export function useViewingSeason(season: SeasonName | null, active: boolean): void {
  useEffect(() => {
    if (!active || !season) return
    setViewingSeason(season)
    return () => setViewingSeason(null)
  }, [season, active])
}

// 端末の「動きを減らす」が入っているか
export function systemReducesMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

// いま動きを止めるか（JS の動き。CSS は :root[data-motion='reduce'] で受ける）
export function reducedMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce'
}

function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

// <html> に印を付ける（styles/base.css の [data-scheme] [data-season] [data-darker] [data-hand] と --tod が受ける）
export function applyTheme(prefs: ThemePrefs, now: Date = new Date()): void {
  current = prefs
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const dark = prefs.brightness === 'dark' || prefs.brightness === 'darker' || (prefs.brightness === 'auto' && systemDark())
  root.dataset.scheme = dark ? 'dark' : 'light'
  root.dataset.season = prefs.color === 'auto' ? (viewing ?? seasonOf(now).name) : prefs.color
  if (prefs.brightness === 'darker') root.dataset.darker = ''
  else delete root.dataset.darker
  if (prefs.hand === 'left') root.dataset.hand = 'left'
  else delete root.dataset.hand
  if (prefs.motion === 'reduce' || (prefs.motion === 'auto' && systemReducesMotion())) root.dataset.motion = 'reduce'
  else delete root.dataset.motion
  // 明るい地では、時刻の暗さを弱める（文字のコントラストを保つ）
  const shade = prefs.tod ? todShade(now.getHours()) * (dark ? 1 : 0.4) : 0
  root.style.setProperty('--tod', `${shade}%`)
  // ブラウザの枠（スマホの上の帯）の色も合わせる。地の色は 1.2秒かけて移るので、移り終わったころにもう一度合わせる
  const chrome = () => document.querySelector('meta[name="theme-color"]')?.setAttribute('content', chromeColor() ?? (dark ? '#2a1a10' : '#f4e5d2'))
  chrome()
  window.clearTimeout(chromeTimer)
  chromeTimer = window.setTimeout(chrome, 1300)
}

let chromeTimer = 0

// 上の帯の色（--theme-chrome）を #rrggbb にする。変数のままでは「color-mix(…)」の式の文字になり、ブラウザの枠には渡せない。
// 計算した色（oklab など）を 1 画素だけ描いて、sRGB の値を読む。計算できない環境（テストなど）は null
function chromeColor(): string | null {
  const probe = document.createElement('i')
  probe.style.cssText = 'display:none;color:var(--theme-chrome)'
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  if (!/^(rgb|oklab|oklch|color|lab|lch)\(/.test(computed)) return null
  if (computed.startsWith('rgb(')) return computed
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// 起動時に1回呼ぶ。端末の明暗の切り替えと時刻（10分ごと）に合わせて付け直す
export function startTheme(): void {
  applyTheme(loadTheme())
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(current))
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => applyTheme(current))
  }
  setInterval(() => applyTheme(current), 10 * 60 * 1000)
}
