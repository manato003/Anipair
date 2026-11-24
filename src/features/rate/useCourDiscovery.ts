import { useEffect, useState } from 'react'
import type { AnnictWork } from '../../lib/annict'
import { malIdOf } from '../../lib/malId'
import { fetchMedia } from '../../lib/shikimori'
import { courDiscovery, type Discovery } from './discovery'

// 踏破の画面の発見。そのクールで見た作品の Shikimori の情報を読んで（多くは山の手がかりで読み済み。残りも30本以内なので1回）、1つ選ぶ。
// works が null のあいだ（踏破していない）は読まない。読めなかったら発見を出さないだけ
export function useCourDiscovery(works: readonly AnnictWork[] | null): Discovery | null {
  const key = works ? works.map((w) => malIdOf(w)).filter((n): n is number => n !== null).join(',') : ''
  const [found, setFound] = useState<{ key: string; value: Discovery | null }>({ key: '', value: null })
  useEffect(() => {
    if (!key) return
    let cancelled = false
    const ids = key.split(',').map(Number)
    fetchMedia(ids).then(
      (map) => {
        if (cancelled) return
        const media = ids.flatMap((id) => {
          const m = map.get(id)
          return m ? [m] : []
        })
        setFound({ key, value: courDiscovery(media) })
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [key])
  return found.key === key ? found.value : null
}
