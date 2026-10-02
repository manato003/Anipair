import type { LibraryEntry, RatingState } from '../../lib/annict'

// 好みの傾向（記録ページの「傾向」）。すべて純粋な関数

export interface Distribution {
  // 総合評価ごとの件数（評価は付いているが「見た」以外の状態の作品も数える）
  ratings: Record<RatingState, number>
  // 見たが評価を付けていない
  watchedUnrated: number
  // 評価の件数の合計
  rated: number
}

// ライブラリの作品について、総合評価の分布を数える。ライブラリに無い作品の評価は数えない
export function ratingDistribution(library: readonly LibraryEntry[], ratings: ReadonlyMap<number, RatingState>): Distribution {
  const counts: Record<RatingState, number> = { GREAT: 0, GOOD: 0, AVERAGE: 0, BAD: 0 }
  let watchedUnrated = 0
  for (const e of library) {
    const r = ratings.get(e.annictId)
    if (r) counts[r]++
    else if (e.state === 'WATCHED') watchedUnrated++
  }
  return { ratings: counts, watchedUnrated, rated: counts.GREAT + counts.GOOD + counts.AVERAGE + counts.BAD }
}

export interface Ranked {
  name: string
  weight: number
}

export interface Trends {
  genres: Ranked[]
  themes: Ranked[]
  studios: Ranked[]
  dislikedGenres: Ranked[]
  dislikedThemes: Ranked[]
}

export const TOP_GENRES = 5
export const TOP_THEMES = 8
export const TOP_STUDIOS = 3
export const TOP_DISLIKED = 3

function pick(profile: ReadonlyMap<string, number>, prefix: 'g' | 't' | 's', sign: 1 | -1, limit: number): Ranked[] {
  const out: Ranked[] = []
  for (const [k, v] of profile) {
    if (!k.startsWith(`${prefix}:`) || v * sign <= 0) continue
    out.push({ name: k.slice(2), weight: v })
  }
  // 好きなものは重みの大きい順、苦手なものはもっとも負の大きい順。同点は名前順（毎回同じ並びにする）
  return out.sort((a, b) => (b.weight - a.weight) * sign || a.name.localeCompare(b.name)).slice(0, limit)
}

// 好み（ジャンル・テーマ・制作会社の重み）から、好きなものの上位と、苦手なものの上位を取り出す
export function topTrends(profile: ReadonlyMap<string, number>): Trends {
  return {
    genres: pick(profile, 'g', 1, TOP_GENRES),
    themes: pick(profile, 't', 1, TOP_THEMES),
    studios: pick(profile, 's', 1, TOP_STUDIOS),
    dislikedGenres: pick(profile, 'g', -1, TOP_DISLIKED),
    dislikedThemes: pick(profile, 't', -1, TOP_DISLIKED),
  }
}
