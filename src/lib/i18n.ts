import { useSyncExternalStore } from 'react'

// 画面の言語（日本語と英語）。端末ごとに覚える（2026-10-13 利用者と決めた計画。tasks/todo.md「英語対応」）。
// 文言は、その場に両方を書く: t('日本語', 'English')。鍵の表を別に持たない（文脈が読めて、訳し漏れを機械で探せる。scripts/check_i18n.py）。
// 言語を替えたら、アプリ全体を描き直す（main.tsx が言語を key にする）。だから t() は React の中でも外でも、呼んだときの言語を返す。
// ただし、ファイルの一番外（読み込んだときに1回だけ動く所）で t() を呼ばない。そこは言語を替えても作り直されない。
// 一覧の定数は { ja, en } で持つか、関数にして呼んだときに t() する
export type Lang = 'ja' | 'en'

const KEY = 'animax.lang.v1'

// 最初の言語は、ブラウザの言語に合わせる（日本語のブラウザなら日本語、それ以外は英語）
export function detectLang(languages: readonly string[]): Lang {
  return languages.length === 0 || languages[0].toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'ja' || saved === 'en') return saved
  } catch {
    // 読めない環境では、ブラウザの言語で決める
  }
  if (typeof navigator === 'undefined') return 'ja'
  return detectLang(navigator.languages?.length ? navigator.languages : [navigator.language ?? 'ja'])
}

let current: Lang | null = null
const listeners = new Set<() => void>()

export function getLang(): Lang {
  current ??= loadLang()
  return current
}

// 選んだら端末に覚える（次からはブラウザの言語より優先する）
export function setLang(lang: Lang): void {
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // 保存できない環境では、この起動のあいだだけ効く
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// 言語が替わったら描き直す（main.tsx の根元と、切り替えのボタン）
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => 'ja')
}

// テストは日本語の画面で始める（jsdom のブラウザの言語は英語なので）。英語の画面は、そのテストの中で resetLangForTests('en')
export function resetLangForTests(lang: Lang = 'ja'): void {
  current = lang
}

export function pick(lang: Lang, ja: string, en: string): string {
  return lang === 'en' ? en : ja
}

// いまの言語で文言を選ぶ
export function t(ja: string, en: string): string {
  return pick(getLang(), ja, en)
}

// { ja, en } の組で持った文言（一覧の定数など）を、いまの言語で
export interface Text {
  ja: string
  en: string
}
export function tx(text: Text): string {
  return t(text.ja, text.en)
}

// 英語の数え方（1 work / 2 works）。日本語は数だけ（「3作品」は呼ぶ側が t() で書く）
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// 曜日の短い名前（0 = 日曜）
export function weekdayShort(day: number): string {
  return t('日月火水木金土'[day], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day])
}
