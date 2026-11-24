import { useSyncExternalStore } from 'react'
import { getLibraryProgress, subscribeLibraryProgress, type LibraryProgress } from './annict'
import { t } from './i18n'

// 進みを出すのは、記録が3ページ（300件）以上あるときだけ。2ページまでは1秒ほどで終わり、数字が出ては消えるだけになる
const SHOW_FROM = 300

// 記録の全件読みの進み（lib/annict.ts の readLibrary）。読んでいないとき・記録が少ないときは null
export function useLibraryProgress(): LibraryProgress | null {
  const p = useSyncExternalStore(subscribeLibraryProgress, getLibraryProgress)
  return p && p.total >= SHOW_FROM ? p : null
}

// 記録を読んでいるあいだの文言。進みが分かれば「Annictの記録を読み込み中 600 / 1,905」
export function libraryLoadingLabel(p: LibraryProgress | null = null): string {
  const base = t('Annictの記録を読み込み中', 'Loading your Annict records')
  return p ? `${base} ${p.read.toLocaleString(t('ja-JP', 'en-US'))} / ${p.total.toLocaleString(t('ja-JP', 'en-US'))}` : base
}

// Loading の remaining に渡す形（残り時間の見積もりに使う）
export function libraryRemaining(p: LibraryProgress | null): { done: number; total: number } | undefined {
  return p ? { done: p.read, total: p.total } : undefined
}
