import { useSyncExternalStore } from 'react'

// 広い画面（幅 960px 以上。CSS の広い画面の区切りと同じ）。記録と設定の項目の切り替えの形を、スマホと PC で替える
const QUERY = '(min-width: 960px)'

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined
  const mq = matchMedia(QUERY)
  mq.addEventListener?.('change', onChange)
  return () => mq.removeEventListener?.('change', onChange)
}

const wide = () => typeof matchMedia === 'function' && matchMedia(QUERY).matches

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, wide, () => false)
}
