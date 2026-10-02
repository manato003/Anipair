import type { BrowseWork } from '../../lib/annict'
import { malIdOf } from '../match/taste'

// ブラウズの並べ替え。人気順と新しい順は Annict が並べる。評価順は、Annict の満足度があればそれ、無ければ Shikimori の点数で、手元で並べる
export type BrowseSort = 'popular' | 'score' | 'newest'

export const SORTS: readonly { id: BrowseSort; label: string; searchOnly: boolean }[] = [
  { id: 'popular', label: '人気順', searchOnly: false },
  { id: 'score', label: '評価順', searchOnly: false },
  { id: 'newest', label: '新しい順', searchOnly: true },
]

// 作品の点数。value は 0〜100 にそろえた値（並べるのに使う）、label は出どころが分かる表示
export interface BrowseScore {
  value: number
  label: string
}

// Annict の満足度（0〜100。最近の作品はほとんど計算されていない）→ 無ければ Shikimori の点数（10点満点）×10。
// 満足度の 0 は「計算されていない」のと見分けがつかないので、点数なしとして扱う
export function scoreOf(w: BrowseWork, shikimori: ReadonlyMap<number, number | null>): BrowseScore | null {
  const rate = w.satisfactionRate
  if (typeof rate === 'number' && rate > 0) return { value: rate, label: `満足度 ${Math.round(rate)}%` }
  const mal = malIdOf(w)
  const s = mal ? shikimori.get(mal) : null
  if (typeof s === 'number' && s > 0) return { value: s * 10, label: `Shikimori ${s.toFixed(1)}` }
  return null
}

// 点数の高い順。点数の無い作品は最後に置き、同じ点数・点数なしの中は視聴者の多い順
export function sortByScore(works: BrowseWork[], shikimori: ReadonlyMap<number, number | null>): BrowseWork[] {
  return [...works].sort((a, b) => {
    const sa = scoreOf(a, shikimori)?.value ?? null
    const sb = scoreOf(b, shikimori)?.value ?? null
    if (sa !== sb) {
      if (sa === null) return 1
      if (sb === null) return -1
      return sb - sa
    }
    return b.watchersCount - a.watchersCount
  })
}
