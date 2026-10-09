import { useEffect, useRef } from 'react'
import { actionsForKey, useKeymap, type KeyAction } from './keymap'

// 画面ごとの操作を、設定されたキーに結びつける。入力欄での打鍵と、修飾キー付き・長押しの連打は無視する。
// enabled が false のあいだは何もしない（隠しているだけで残っているタブが、キーに反応しないように）
export function useShortcuts(handlers: Partial<Record<KeyAction, () => void>>, enabled = true): void {
  const keymap = useKeymap()
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      // 同じキーに画面の違う操作が2つあれば、この画面で使う方（handlers にある方）
      const action = actionsForKey(keymap, e.key).find((a) => ref.current[a])
      const run = action ? ref.current[action] : undefined
      if (run) {
        e.preventDefault()
        run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keymap, enabled])
}
