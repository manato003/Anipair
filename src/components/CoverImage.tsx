import { useState, type ReactNode } from 'react'
import type { Cover } from '../lib/storage'

// 表紙の画像。読み込めなかったとき（公式サイトの画像は、ほかのサイトからの表示を断られることがある）は、代わりの表示を出す。
// size: large はカードと詳細、thumb は一覧の小さい画像
export function CoverImage(props: { cover: Cover; size: 'large' | 'thumb'; lazy?: boolean; fallback?: ReactNode }) {
  const src = props.size === 'thumb' ? props.cover.thumb : props.cover.url
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === src) return <>{props.fallback ?? null}</>
  // 横長の画像（公式サイトの OGP 画像）は切らずに枠に収める。縦長のポスターは枠いっぱいに出す
  return <img className={props.cover.landscape ? 'cover--contain' : undefined} src={src} alt="" loading={props.lazy ? 'lazy' : undefined} onError={() => setFailed(src)} />
}
