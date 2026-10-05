import type { BrowseWork } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import { collectPool, malIdOf } from '../match/taste'
import type { Taste } from '../match/tasteLoader'
import { orderByScore, scoreWanna } from '../records/wannaRank'

// ブラウズの並べ替え。人気順と新しい順は Annict が並べる。評価順は、Annict の満足度があればそれ、無ければ Shikimori の点数で、手元で並べる。
// おすすめ順（id は taste）は、記録の見たいのおすすめ順と同じ式（wannaRank.ts）で、クールの作品を手元で並べる
export type BrowseSort = 'popular' | 'score' | 'taste' | 'newest'

// 何を見ているか: 1つのクール（上のクール選び）・期間（絞り込みの放送年と季節）・タイトル検索
export type BrowseMode = 'cour' | 'period' | 'search'

// modes: その並べ方を出す場合。新しい順は1つのクールでは意味が無い（すべて同じ時期）。
// おすすめ順はクールか期間の作品を集めて並べるもので、タイトル検索では出さない
export const SORTS: readonly {
  id: BrowseSort
  label: string
  modes: readonly BrowseMode[]
}[] = [
  { id: 'popular', label: '人気順', modes: ['cour', 'period', 'search'] },
  { id: 'score', label: '評価順', modes: ['cour', 'period', 'search'] },
  { id: 'taste', label: 'おすすめ順', modes: ['cour', 'period'] },
  { id: 'newest', label: '新しい順', modes: ['period', 'search'] },
]

// いまの場合で使えない並べ方は、人気順にする
export function sortFor(sort: BrowseSort, mode: BrowseMode): BrowseSort {
  return SORTS.find((o) => o.id === sort)?.modes.includes(mode) ? sort : 'popular'
}

// おすすめ順に使う好みの部分（Taste のうち、点数に要るものだけ）
export type TasteForRanking = Pick<Taste, 'similarSeeds' | 'similar' | 'profile'>

export interface TasteRanking {
  works: BrowseWork[]
  // 作品（Annict の ID）ごとの理由。理由の無い作品は入れない
  reasons: Map<number, string>
}

// 作品を好みの順に並べる（純粋な関数）。点数は見たいのおすすめ順と同じ。
// 似た作品は、除外なしで集めたもののうち、ここに並べる作品の分だけを使う。
// MAL の ID が無い・Shikimori に情報が無い作品は、もとの順のまま最後に置く
export function rankByTaste(works: readonly BrowseWork[], details: ReadonlyMap<number, Media>, taste: TasteForRanking): TasteRanking {
  const malIds = works.map(malIdOf).filter((n): n is number => n !== null)
  const wanted = new Set(malIds)
  const pool = collectPool(taste.similarSeeds, taste.similar, new Set()).filter((e) => wanted.has(e.malId))
  const scores = scoreWanna(malIds, details, pool, taste.profile)
  const reasons = new Map<number, string>()
  for (const w of works) {
    const id = malIdOf(w)
    const reason = id === null ? null : (scores.get(id)?.reason ?? null)
    if (reason) reasons.set(w.annictId, reason)
  }
  return { works: orderByScore(works, malIdOf, scores), reasons }
}

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
