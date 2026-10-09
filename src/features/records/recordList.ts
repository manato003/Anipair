import type { LibraryEntry, MyReview, RatingState, StatusState } from '../../lib/annict'
import { RATING_ORDER } from '../../lib/reviewOps'
import type { Cover } from '../../lib/storage'
import type { Season } from '../../lib/season'

// 記録ページの分類と並べ替え。すべて純粋な関数

export interface RecordRow {
  entry: LibraryEntry
  review: MyReview | null
  cover: Cover | null
}

export type Bucket = 'watched' | 'wanna' | 'watching' | 'other'

// 並びは最初に開く「見てる」から
export const BUCKETS: readonly { id: Bucket; label: string }[] = [
  { id: 'watching', label: '見てる' },
  { id: 'watched', label: '見た' },
  { id: 'wanna', label: '見たい' },
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

// 並べ替えの種類。好きな順（自分の評価）は見たのときだけ、おすすめ順は見たいのときだけ（おすすめ順は好みの点数で並べるので Records が並べる）。
// 人気順は Annict でその作品を記録した人の数（ライブラリの読み込みで取っている）
export type SortKey = 'rating' | 'popular' | 'recorded' | 'aired' | 'taste'
// 降順（大きい・新しい・高いが先）と昇順。押している並べ替えをもう一度押すと入れ替わる
export type SortDir = 'desc' | 'asc'

export interface SortChoice {
  key: SortKey
  dir: SortDir
}

const SORT_LABEL: Record<SortKey, string> = { rating: '好きな順', popular: '人気順', recorded: '記録順', aired: '放送日順', taste: 'おすすめ順' }

// 状態ごとに選べる並べ替え（先頭が最初に選ばれているもの）
export function sortOptions(bucket: Bucket): { key: SortKey; label: string }[] {
  const keys: SortKey[] =
    bucket === 'watched' ? ['rating', 'popular', 'recorded', 'aired'] : bucket === 'wanna' ? ['recorded', 'popular', 'aired', 'taste'] : ['recorded', 'popular', 'aired']
  return keys.map((key) => ({ key, label: SORT_LABEL[key] }))
}

// いまの並べ方を1行で（並べ替えの下にいつも出す。ブラウズと同じ考え方）
export function sortNote({ key, dir }: SortChoice): string {
  const desc = dir === 'desc'
  switch (key) {
    case 'rating':
      return desc ? 'あなたの評価の高い順です。評価の無い作品は最後に並びます。' : 'あなたの評価の低い順です。評価の無い作品は最後に並びます。'
    case 'popular':
      return desc ? 'Annict でこの作品を記録した人の多い順です。' : 'Annict でこの作品を記録した人の少ない順です。'
    case 'recorded':
      return desc ? 'Annict に記録した日の新しい順です。' : 'Annict に記録した日の古い順です。'
    case 'aired':
      return desc ? '放送の新しい順です。放送時期の分からない作品は最後に並びます。' : '放送の古い順です。放送時期の分からない作品は最後に並びます。'
    case 'taste':
      return desc ? 'あなたの評価から、好みに合いそうな順です。' : 'あなたの評価から、好みに合いそうな作品を後ろにした順です。'
  }
}

function ratingRank(r: RatingState | null | undefined): number {
  const i = r ? RATING_ORDER.indexOf(r) : -1
  return i < 0 ? RATING_ORDER.length : i
}

function time(iso: string | null): number | null {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? null : t
}

const SEASON_INDEX: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, AUTUMN: 3 }

// 放送時期の並び順の値（大きいほど新しい）。年が分からなければ null。季節が分からなければ、その年の最後に置く
export function airedRank(e: { seasonYear?: number | null; seasonName?: string | null }): number | null {
  if (!e.seasonYear) return null
  return e.seasonYear * 4 + (e.seasonName ? SEASON_INDEX[e.seasonName] ?? 3 : 3)
}

// 値の比べ方。値の無いもの（null）は、向きに関係なくいつも最後
function compareValues(a: number | null, b: number | null, dir: SortDir): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return dir === 'desc' ? b - a : a - b
}

// 好きな順（自分の評価）: とても良い → 良い → 普通 → 良くない（昇順は逆）。評価なしはいつも最後。同じ評価の中は放送の新しい順、記録した日の新しい順。
// 人気順: Annict で記録した人の数（分からない作品は最後）。記録順: Annict でその状態にした日。放送日順: 放送時期。同じ時期の中は記録した日の新しい順。
// おすすめ順はここでは並べない（好みの点数が要るので Records が orderByScore で並べる。ここでは放送日順と同じ）
export function sortRows(rows: RecordRow[], key: SortKey, dir: SortDir = 'desc'): RecordRow[] {
  const ratingValue = (r: RecordRow) => (r.review?.ratingOverallState ? RATING_ORDER.length - ratingRank(r.review.ratingOverallState) : null)
  return [...rows].sort((a, b) => {
    if (key === 'rating') {
      const d = compareValues(ratingValue(a), ratingValue(b), dir)
      if (d !== 0) return d
    }
    if (key === 'popular') {
      const d = compareValues(a.entry.watchersCount ?? null, b.entry.watchersCount ?? null, dir)
      if (d !== 0) return d
    }
    if (key === 'recorded') {
      const d = compareValues(time(a.entry.stateAt), time(b.entry.stateAt), dir)
      if (d !== 0) return d
    }
    const d = compareValues(airedRank(a.entry), airedRank(b.entry), key === 'aired' ? dir : 'desc')
    if (d !== 0) return d
    return compareValues(time(a.entry.stateAt), time(b.entry.stateAt), 'desc')
  })
}

// 記録ページの絞り込み。どの項目も、空なら絞らない。項目の中は「どれか」、項目どうしは「すべて」
export type RatingFilter = RatingState | 'NONE'
export type MediaKind = 'tv' | 'movie' | 'ova' | 'other'
export type SeasonKey = 'WINTER' | 'SPRING' | 'SUMMER' | 'AUTUMN'

export interface RecordFilter {
  ratings: readonly RatingFilter[]
  yearFrom: number | null
  yearTo: number | null
  seasons: readonly SeasonKey[]
  media: readonly MediaKind[]
  // ジャンルとテーマ（Shikimori の英語名）と、制作会社（Shikimori の名前）
  genres: readonly string[]
  studios: readonly string[]
  // 1つの放送クール（一覧の上で、ブラウズ・評価の画面と同じ形で選ぶ。絞り込みのシートの条件の数には入れない）。
  // 選んでいるあいだは、放送年の範囲と季節は使わない
  cour?: Season | null
}

export const EMPTY_FILTER: RecordFilter = { ratings: [], yearFrom: null, yearTo: null, seasons: [], media: [], genres: [], studios: [], cour: null }

export const MEDIA_KINDS: readonly { id: MediaKind; label: string }[] = [
  { id: 'tv', label: 'TV' },
  { id: 'movie', label: '劇場版' },
  { id: 'ova', label: 'OVA・配信' },
  { id: 'other', label: 'その他' },
]

export const SEASON_KEYS: readonly { id: SeasonKey; label: string }[] = [
  { id: 'WINTER', label: '冬' },
  { id: 'SPRING', label: '春' },
  { id: 'SUMMER', label: '夏' },
  { id: 'AUTUMN', label: '秋' },
]

// Annict の Media を、絞り込みの形式に寄せる（WEB は配信なので OVA と同じまとまり）
export function mediaKindOf(media: string | null | undefined): MediaKind {
  switch (media) {
    case 'TV':
      return 'tv'
    case 'MOVIE':
      return 'movie'
    case 'OVA':
    case 'WEB':
      return 'ova'
    default:
      return 'other'
  }
}

// 選んでいる一覧に、あれば外し、無ければ足す（絞り込みのチップ）
export function toggleIn<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

// かけている条件の数（「絞り込み」のボタンに添える）
export function activeFilterCount(f: RecordFilter): number {
  return (
    (f.ratings.length > 0 ? 1 : 0) +
    (f.yearFrom !== null || f.yearTo !== null ? 1 : 0) +
    (f.seasons.length > 0 ? 1 : 0) +
    (f.media.length > 0 ? 1 : 0) +
    (f.genres.length > 0 ? 1 : 0) +
    (f.studios.length > 0 ? 1 : 0)
  )
}

// 作品の情報（ジャンル・制作会社）。MyAnimeList の ID ごと
// minutes・episodes・airing: 1話の長さ（分）・全話数・放送中か（見てる作品のカードの残りと進み具合に使う。分からなければ null）
export type MediaInfo = { genres: readonly string[]; studios: readonly string[]; minutes?: number | null; episodes?: number | null; airing?: boolean }

function infoOf(row: RecordRow, info: ReadonlyMap<number, MediaInfo> | null): MediaInfo | undefined {
  const mal = Number(row.entry.malAnimeId)
  return info && Number.isInteger(mal) && mal > 0 ? info.get(mal) : undefined
}

// 条件に合う記録だけを残す。ジャンル・制作会社の条件は、作品の情報が無い作品（読み込み中・Shikimori に無い）を外す
export function applyFilter(rows: readonly RecordRow[], f: RecordFilter, info: ReadonlyMap<number, MediaInfo> | null): RecordRow[] {
  if (activeFilterCount(f) === 0 && !f.cour) return [...rows]
  return rows.filter((row) => {
    const e = row.entry
    if (f.ratings.length > 0 && !f.ratings.includes(row.review?.ratingOverallState ?? 'NONE')) return false
    if (f.cour && !(e.seasonYear === f.cour.year && e.seasonName?.toUpperCase() === f.cour.name.toUpperCase())) return false
    if (f.yearFrom !== null && !(e.seasonYear && e.seasonYear >= f.yearFrom)) return false
    if (f.yearTo !== null && !(e.seasonYear && e.seasonYear <= f.yearTo)) return false
    if (f.seasons.length > 0 && !(e.seasonName && (f.seasons as readonly string[]).includes(e.seasonName))) return false
    if (f.media.length > 0 && !f.media.includes(mediaKindOf(e.media))) return false
    if (f.genres.length > 0 || f.studios.length > 0) {
      const m = infoOf(row, info)
      if (!m) return false
      if (f.genres.length > 0 && !f.genres.some((g) => m.genres.includes(g))) return false
      if (f.studios.length > 0 && !f.studios.some((s) => m.studios.includes(s))) return false
    }
    return true
  })
}

// 絞り込みの選択肢。放送年は記録にある年（新しい順）。ジャンル・制作会社は記録にあるもの（多い順、同数は名前順）
export function filterChoices(
  rows: readonly RecordRow[],
  info: ReadonlyMap<number, MediaInfo> | null,
): { years: number[]; genres: { name: string; count: number }[]; studios: { name: string; count: number }[] } {
  const years = [...new Set(rows.map((r) => r.entry.seasonYear).filter((y): y is number => typeof y === 'number' && y > 0))].sort((a, b) => b - a)
  const genres = new Map<string, number>()
  const studios = new Map<string, number>()
  for (const r of rows) {
    const m = infoOf(r, info)
    if (!m) continue
    for (const g of new Set(m.genres)) genres.set(g, (genres.get(g) ?? 0) + 1)
    for (const st of new Set(m.studios)) studios.set(st, (studios.get(st) ?? 0) + 1)
  }
  const ranked = (m: Map<string, number>) => [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { years, genres: ranked(genres), studios: ranked(studios) }
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

// 日付と時刻（作品の詳細の「いつ記録したか」）。2026/10/1 21:05
export function formatDateTime(iso: string | null): string {
  const t = time(iso)
  if (!t) return ''
  const d = new Date(t)
  return `${formatDate(iso)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
