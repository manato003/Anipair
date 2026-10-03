import type { LibraryEntry, MyReview, RatingState, StatusState } from '../../lib/annict'
import { RATING_ORDER } from '../../lib/reviewOps'
import type { Cover } from '../../lib/storage'

// 記録ページの分類と並べ替え。すべて純粋な関数

export interface RecordRow {
  entry: LibraryEntry
  review: MyReview | null
  cover: Cover | null
}

export type Bucket = 'watched' | 'wanna' | 'watching' | 'other'

export const BUCKETS: readonly { id: Bucket; label: string }[] = [
  { id: 'watched', label: '見た' },
  { id: 'wanna', label: '見たい' },
  { id: 'watching', label: '見てる' },
  // Annict の一時中断と視聴中止をまとめて「視聴中断」（STATUS_LABEL と同じ考え方）
  { id: 'other', label: '視聴中断' },
]

export function bucketOf(state: StatusState): Bucket {
  switch (state) {
    case 'WATCHED':
      return 'watched'
    case 'WANNA_WATCH':
      return 'wanna'
    case 'WATCHING':
      return 'watching'
    default:
      return 'other'
  }
}

export function countBuckets(rows: RecordRow[]): Record<Bucket, number> {
  const out: Record<Bucket, number> = { watched: 0, wanna: 0, watching: 0, other: 0 }
  for (const r of rows) out[bucketOf(r.entry.state)]++
  return out
}

export type SortKey = 'rating' | 'recent'

function ratingRank(r: RatingState | null | undefined): number {
  const i = r ? RATING_ORDER.indexOf(r) : -1
  return i < 0 ? RATING_ORDER.length : i
}

function time(iso: string | null): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? 0 : t
}

const SEASON_INDEX: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, AUTUMN: 3 }

// 放送時期の並び順の値（大きいほど新しい）。年が分からなければ null。季節が分からなければ、その年の最後に置く
export function airedRank(e: { seasonYear?: number | null; seasonName?: string | null }): number | null {
  if (!e.seasonYear) return null
  return e.seasonYear * 4 + (e.seasonName ? SEASON_INDEX[e.seasonName] ?? 3 : 3)
}

// 新しい順は放送時期の新しい順（記録した日ではない）。放送時期の分からない作品は最後。同じ時期の中は、記録した日の新しい順。
// 評価順は とても良い → 良い → 普通 → 良くない → 評価なし。同じ評価の中は新しい順
export function sortRows(rows: RecordRow[], key: SortKey): RecordRow[] {
  return [...rows].sort((a, b) => {
    if (key === 'rating') {
      const d = ratingRank(a.review?.ratingOverallState) - ratingRank(b.review?.ratingOverallState)
      if (d !== 0) return d
    }
    const ra = airedRank(a.entry)
    const rb = airedRank(b.entry)
    if (ra !== rb) {
      if (ra === null) return 1
      if (rb === null) return -1
      return rb - ra
    }
    return time(b.entry.stateAt) - time(a.entry.stateAt)
  })
}

export function filterRows(rows: RecordRow[], bucket: Bucket, query: string): RecordRow[] {
  const q = query.trim().normalize('NFKC').toLowerCase()
  return rows.filter((r) => bucketOf(r.entry.state) === bucket && (!q || r.entry.title.normalize('NFKC').toLowerCase().includes(q)))
}

// 状態を選ぶ選択肢。「視聴中断」は1つだけ（STOP_WATCHING で保存する）
export const STATE_OPTIONS: readonly { state: StatusState; label: string }[] = [
  { state: 'WATCHED', label: '見た' },
  { state: 'WATCHING', label: '見てる' },
  { state: 'WANNA_WATCH', label: '見たい' },
  { state: 'STOP_WATCHING', label: '視聴中断' },
]

// 選択肢の上でどれを選んでいるか。Annict のサイトで付けた一時中断（ON_HOLD）は「視聴中断」を選んでいることにする
export function optionState(state: StatusState | null): StatusState | null {
  return state === 'ON_HOLD' ? 'STOP_WATCHING' : state
}

export function formatDate(iso: string | null): string {
  const t = time(iso)
  if (!t) return ''
  const d = new Date(t)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
