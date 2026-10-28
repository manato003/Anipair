import type { BrowsePage, BrowseWork } from '../../lib/annict'
import { findWorks, genreId, type Media } from '../../lib/shikimori'
import { linkWorks, type LinkDeps } from './annictLinks'

// ブラウズで期間を選んでジャンル・制作会社をかけたときに、期間の全作品から探す。
// Annict はジャンル・制作会社で探せないので、Shikimori（中継の op=find）で探して Annict の作品に結び付ける。
// ジャンルは選んだものをすべて持つ作品（1回の問い合わせ）、制作会社はどれか（Shikimori は複数の制作会社を「すべて」で扱うので、1社ずつ問い合わせて合わせる）

// 一度に選べる制作会社の数。1社ごとに Shikimori へ1回（評価順・おすすめ順は4ページまとめて読むので4回）問い合わせ、
// Shikimori の上限（中継で全利用者あわせて1分80回）を分け合うため。3社なら1回の絞り込みで多くても12回（1分の枠の15%）
export const MAX_FIND_STUDIOS = 3
// 中継の上限（api/shiki.ts の MAX_LIST_PAGE）と同じ。50件ずつ
export const FIND_PAGES = 4
export const FIND_MAX_WORKS = FIND_PAGES * 50

// Shikimori の ID にした条件
export interface Narrow {
  genres: number[]
  studios: number[]
}

// 選んでいるジャンル・制作会社の名前を Shikimori の ID に。条件検索にできなければ null（読み込んだ作品の中で絞る、今までのやり方）。
// ID の分からないジャンル（成人向け・対象層）は外す（読み込んだあとに手元でも絞るので、結果には効く）。
// 制作会社は「どれか」なので、1社でも ID が分からない・多すぎるときは条件検索にしない
export function narrowOf(genres: readonly string[], studios: readonly string[], studioIds: ReadonlyMap<string, number>): Narrow | null {
  const g = [...new Set(genres.flatMap((name) => genreId(name) ?? []))].sort((a, b) => a - b)
  const s = [...new Set(studios.map((name) => studioIds.get(name) ?? null))]
  if (s.includes(null) || s.length > MAX_FIND_STUDIOS) return null
  const ids = (s as number[]).sort((a, b) => a - b)
  return g.length > 0 || ids.length > 0 ? { genres: g, studios: ids } : null
}

export type FindOrder = 'popularity' | 'aired_on'

// 1ページ（50件）。続きの位置（endCursor）はページの番号。capped: 中継の上限のページまで読んで、まだ続きがありそう
export type FoundPage = BrowsePage & { capped: boolean }

export async function findPage(
  token: string,
  narrow: Narrow,
  period: { from: string; to: string },
  order: FindOrder,
  page: number,
  deps: LinkDeps & { find?: typeof findWorks } = {},
): Promise<FoundPage> {
  const { find = findWorks } = deps
  const medias: Media[] = []
  const hinted = new Map<number, number>()
  let full = false
  for (const studio of narrow.studios.length > 0 ? narrow.studios : [null]) {
    const r = await find({ genres: narrow.genres, studio, ...period, order }, page)
    for (const m of r.medias) if (!medias.some((x) => x.idMal === m.idMal)) medias.push(m)
    for (const [k, v] of r.annict) hinted.set(k, v)
    full ||= r.full
  }
  // 複数の制作会社は、それぞれの並びを合わせて並べ直す（人気順は Shikimori でリストに入れている人の数、放送日順は年）
  if (narrow.studios.length > 1) {
    const key = (m: Media) => (order === 'popularity' ? (m.popularity ?? 0) : (m.seasonYear ?? 0))
    medias.sort((a, b) => key(b) - key(a))
  }
  const linked = await linkWorks(token, medias, hinted, deps)
  const seen = new Set<number>()
  const works: BrowseWork[] = []
  for (const m of medias) {
    const w = linked.get(m.idMal)
    if (w && !seen.has(w.annictId)) {
      seen.add(w.annictId)
      works.push(w)
    }
  }
  const hasNext = full && page < FIND_PAGES
  return { works, endCursor: hasNext ? String(page + 1) : null, hasNext, capped: full && page >= FIND_PAGES }
}
