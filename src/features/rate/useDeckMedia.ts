import { useEffect, useState } from 'react'
import { fetchMedia, type Media } from '../../lib/shikimori'

// デッキ（1クールぶんの作品）の Shikimori の情報を、まとめて1回（50件ずつ）で取る。カードの「作品の手がかり」に使う。
// 表紙の解決で取り込み済みなら問い合わせない（fetchMedia が起動中の控えを持つ）。失敗しても手がかりが出ないだけなので黙って捨てる
export function useDeckMedia(malIds: readonly number[] | null): Map<number, Media> {
  const key = malIds ? malIds.join(',') : ''
  const [media, setMedia] = useState<{ key: string; map: Map<number, Media> }>({ key: '', map: new Map() })
  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetchMedia(key.split(',').map(Number)).then(
      (map) => !cancelled && setMedia({ key, map }),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [key])
  return media.key === key ? media.map : EMPTY
}

const EMPTY: Map<number, Media> = new Map()
