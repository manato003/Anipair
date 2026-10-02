import type { BrowseWork } from '../../lib/annict'
import { malIdOf } from '../match/taste'

// ブラウズの並べ替え。人気順と新しい順は Annict が並べる。評価順は AniList の平均点で手元で並べる
export type BrowseSort = 'popular' | 'score' | 'newest'

export const SORTS: readonly { id: BrowseSort; label: string; searchOnly: boolean }[] = [
  { id: 'popular', label: '人気順', searchOnly: false },
  { id: 'score', label: '評価順', searchOnly: false },
  { id: 'newest', label: '新しい順', searchOnly: true },
]

// 平均点の高い順。点数の無い作品は最後に置き、同じ点数・点数なしの中は視聴者の多い順
export function sortByScore(works: BrowseWork[], scores: ReadonlyMap<number, number | null>): BrowseWork[] {
  const scoreOf = (w: BrowseWork) => {
    const id = malIdOf(w)
    return (id && scores.get(id)) ?? null
  }
  return [...works].sort((a, b) => {
    const sa = scoreOf(a)
    const sb = scoreOf(b)
    if (sa !== sb) {
      if (sa === null) return 1
      if (sb === null) return -1
      return sb - sa
    }
    return b.watchersCount - a.watchersCount
  })
}
