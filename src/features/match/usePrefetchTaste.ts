import { useEffect, useRef } from 'react'
import { prefetchTaste } from './tasteLoader'

// 評価の画面を出して少したってから、好みの先読み（似た作品などを裏で集める）を1回だけ始める。
// 画面が表示されているあいだだけ数え、途中で隠れたら数え直す。タブ（ブラウザ）が見えていないときは、見えるまで待つ。
// 先読みは失敗しても何も出さない（prefetchTaste が黙って捨てる）
export const PREFETCH_DELAY_MS = 5000

export function usePrefetchTaste(
  token: string | null,
  shown: boolean,
  // テストで差し替える
  opts: { delayMs?: number; prefetch?: (token: string) => Promise<void> } = {},
): void {
  const { delayMs = PREFETCH_DELAY_MS, prefetch = prefetchTaste } = opts
  // 先読みを頼んだトークン（1つのトークンにつき1回）
  const requested = useRef<string | null>(null)

  useEffect(() => {
    if (!token || !shown || requested.current === token) return
    const fire = () => {
      requested.current = token
      prefetch(token).catch(() => undefined)
    }
    let onVisible: (() => void) | null = null
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        fire()
        return
      }
      onVisible = () => {
        if (document.visibilityState !== 'visible') return
        document.removeEventListener('visibilitychange', onVisible!)
        onVisible = null
        fire()
      }
      document.addEventListener('visibilitychange', onVisible)
    }, delayMs)
    return () => {
      clearTimeout(timer)
      if (onVisible) document.removeEventListener('visibilitychange', onVisible)
    }
  }, [token, shown, delayMs, prefetch])
}
