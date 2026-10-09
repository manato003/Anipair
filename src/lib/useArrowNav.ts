import { useEffect, useRef } from 'react'
import type { SwipeDir } from './useSwipeNav'

// PC の ← → で分類を替える（スマホの左右の払いと同じ）。
// 受けないとき:
// - Ctrl・Alt・Shift・⌘ と一緒に押したとき（ブラウザやほかの操作のため）
// - 文字の入力欄・プルダウンの上（← → は文字の中やプルダウンの中で使う）
// - 画面に見えているダイアログ（シート・使い方の案内・覚醒の演出）があるとき。隠れた画面に開いたまま残るシートは数えない
// ← → は答えには割り当てられない（lib/keymap.ts）。答えのキーとぶつからない

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'

function dialogOpen(): boolean {
  return [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0)
}

export function useArrowNav(onNav: (dir: SwipeDir) => void, enabled: boolean): void {
  const nav = useRef(onNav)
  useEffect(() => {
    nav.current = onNav
  })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      if (e.target instanceof Element && e.target.closest(EDITABLE)) return
      if (dialogOpen()) return
      e.preventDefault()
      nav.current(e.key === 'ArrowRight' ? 'next' : 'prev')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
