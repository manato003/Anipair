import type { Media } from '../../lib/shikimori'
import type { DemoAnswer } from './demoWorks'

// 紹介ページのデモの計算（画面は LandingDemo.tsx）。答えは画面の中だけに持ち、Annict にも端末にも残さない

export type DemoRating = 'GREAT' | 'GOOD' | 'AVERAGE' | 'BAD'

export const DEMO_RATINGS: readonly DemoRating[] = ['GREAT', 'GOOD', 'AVERAGE', 'BAD']

// デモに出せる作品: 日本語の題名とポスターがあり、成人向けでない（表紙は Shikimori のポスターだけを使う）
export function usableMedia(m: Media | undefined): m is Media {
  return !!m && !!m.title.native && !!m.cover && !m.isAdult
}

// 評価のカードに出す順。棚で押した作品（front）を先頭に、答えた作品は除く
export function pendingOf(queue: readonly number[], answers: ReadonlyMap<number, DemoAnswer>, front: number | null, usable: (id: number) => boolean): number[] {
  const rest = queue.filter((id) => id !== front && !answers.has(id) && usable(id))
  return front !== null && usable(front) ? [front, ...rest] : rest
}

// 提案のもとにする作品。「とても良い」を先に、それぞれ答えた順
export function likedOf(order: readonly number[], answers: ReadonlyMap<number, DemoAnswer>): number[] {
  return [...order.filter((id) => answers.get(id) === 'GREAT'), ...order.filter((id) => answers.get(id) === 'GOOD')]
}

export type MatchPick = { kind: 'pick'; id: number; basis: number } | { kind: 'need'; basis: number } | { kind: 'none' }

// 次の提案。もとにする作品の順に、その作品の似た作品（Shikimori の並び）から、まだ答えていない・決めていない作品を選ぶ。
// 同じシリーズ（関連作品）は除く。似た作品をまだ受け取っていない作品に着いたら、それを頼む（need）
export function pickMatch(
  liked: readonly number[],
  similar: ReadonlyMap<number, readonly number[]>,
  media: ReadonlyMap<number, Media>,
  excluded: ReadonlySet<number>,
): MatchPick {
  for (const basis of liked) {
    const ids = similar.get(basis)
    if (!ids) return { kind: 'need', basis }
    const series = new Set((media.get(basis)?.related ?? []).map((r) => r.malId))
    for (const id of ids) {
      const m = media.get(id)
      if (id === basis || excluded.has(id) || series.has(id) || !usableMedia(m)) continue
      if (m.related.some((r) => r.malId === basis)) continue
      return { kind: 'pick', id, basis }
    }
  }
  return { kind: 'none' }
}

// 提案の理由に添えるジャンル。もとの作品と重なるもの（無ければ提案した作品のもの）を3つまで
export function sharedGenres(pick: Media, basis: Media | undefined): string[] {
  const own = [...pick.genres, ...pick.themes]
  const theirs = new Set(basis ? [...basis.genres, ...basis.themes] : [])
  const shared = own.filter((g) => theirs.has(g))
  return (shared.length > 0 ? shared : own).slice(0, 3)
}

// Tier表の段（S〜D）。評価から段を決め、押して動かした作品は動かした段に置く。段の中は答えた順
export const DEMO_TIER_COUNT = 5
const TIER_OF: Record<DemoRating, number> = { GREAT: 0, GOOD: 1, AVERAGE: 2, BAD: 3 }

export function tierRowsOf(order: readonly number[], answers: ReadonlyMap<number, DemoAnswer>, moved: ReadonlyMap<number, number>): number[][] {
  const rows: number[][] = Array.from({ length: DEMO_TIER_COUNT }, () => [])
  for (const id of order) {
    const a = answers.get(id)
    if (!a || !(a in TIER_OF)) continue
    rows[moved.get(id) ?? TIER_OF[a as DemoRating]].push(id)
  }
  return rows
}

// 評価ごとの数（とても良い → 良くない）
export function ratingCounts(answers: ReadonlyMap<number, DemoAnswer>): Map<DemoRating, number> {
  const out = new Map<DemoRating, number>(DEMO_RATINGS.map((r) => [r, 0]))
  for (const a of answers.values()) if (out.has(a as DemoRating)) out.set(a as DemoRating, out.get(a as DemoRating)! + 1)
  return out
}

// 高く評価した作品にいちばん多いジャンル（同じ数なら先に出たもの）。無ければ null
export function topGenre(liked: readonly number[], media: ReadonlyMap<number, Media>): string | null {
  const count = new Map<string, number>()
  for (const id of liked) for (const g of media.get(id)?.genres ?? []) count.set(g, (count.get(g) ?? 0) + 1)
  let best: string | null = null
  for (const [g, n] of count) if (best === null || n > count.get(best)!) best = g
  return best
}
