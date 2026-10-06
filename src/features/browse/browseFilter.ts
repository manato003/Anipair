import type { BrowseWork, StatusState } from '../../lib/annict'
import { SEASON_KEYS, mediaKindOf, type MediaInfo, type MediaKind, type SeasonKey } from '../records/recordList'

// ブラウズの絞り込み。どの項目も空なら絞らない。項目の中は「どれか」、項目どうしは「すべて」（記録の絞り込みと同じ考え方）。
// 放送年と季節（期間）は、Annict から読む作品そのものを決める（上のクールの代わりに、期間のクールをまとめて読む）。
// ほかの項目は、読み込んだ作品の中で絞る
export type MineFilter = 'none' | 'unseen' | 'watched' | 'watching' | 'wanna' | 'stopped'

export interface BrowseFilter {
  // 自分の記録（未記録・見てない・見た・見てる・見たい・視聴中断）。
  // 見てないは、評価の画面で「見てない」にした、まだ記録の無い作品（端末の控え。あとから見た作品を探して記録できるように）
  mine: readonly MineFilter[]
  media: readonly MediaKind[]
  genres: readonly string[]
  studios: readonly string[]
}

export const EMPTY_BROWSE_FILTER: BrowseFilter = { mine: [], media: [], genres: [], studios: [] }

// 期間（放送年の「から〜まで」と季節）。年の片方が無ければ、そちらは端まで。季節が空なら4つとも
export interface BrowsePeriod {
  yearFrom: number | null
  yearTo: number | null
  seasons: readonly SeasonKey[]
}

export const NO_PERIOD: BrowsePeriod = { yearFrom: null, yearTo: null, seasons: [] }

export function periodActive(p: BrowsePeriod): boolean {
  return p.yearFrom !== null || p.yearTo !== null || p.seasons.length > 0
}

// 期間に入るクールを、Annict の検索に渡す形（2018-spring）で。古い順。Annict は「2018-all」を受け付けないので、クールを並べる
export function periodSlugs(p: BrowsePeriod, oldestYear: number, latestYear: number): string[] {
  let from = p.yearFrom ?? oldestYear
  let to = p.yearTo ?? latestYear
  if (from > to) [from, to] = [to, from]
  const names = (p.seasons.length > 0 ? SEASON_KEYS.filter((k) => p.seasons.includes(k.id)) : SEASON_KEYS).map((k) => k.id.toLowerCase())
  const out: string[] = []
  for (let y = Math.max(from, oldestYear); y <= Math.min(to, latestYear); y++) for (const n of names) out.push(`${y}-${n}`)
  return out
}

// 期間の短い名前（「2018〜2020年 春・夏」「2018年〜」「すべての年の 春」）
export function periodLabel(p: BrowsePeriod): string {
  const from = p.yearFrom !== null && p.yearTo !== null ? Math.min(p.yearFrom, p.yearTo) : p.yearFrom
  const to = p.yearFrom !== null && p.yearTo !== null ? Math.max(p.yearFrom, p.yearTo) : p.yearTo
  const years = from !== null && to !== null ? (from === to ? `${from}年` : `${from}〜${to}年`) : from !== null ? `${from}年〜` : to !== null ? `〜${to}年` : 'すべての年の'
  const seasons = SEASON_KEYS.filter((k) => p.seasons.includes(k.id))
    .map((k) => k.label)
    .join('・')
  return seasons ? `${years} ${seasons}` : years
}

export const MINE_CHOICES: readonly { id: MineFilter; label: string }[] = [
  { id: 'none', label: '未記録' },
  { id: 'unseen', label: '見てない' },
  { id: 'watched', label: '見た' },
  { id: 'watching', label: '見てる' },
  { id: 'wanna', label: '見たい' },
  { id: 'stopped', label: '視聴中断' },
]

// unseen: 評価の画面で「見てない」にしているか（記録の無い作品だけが「見てない」になる。記録があれば記録の方）
export function mineOf(state: StatusState | null, unseen = false): MineFilter {
  switch (state) {
    case 'WATCHED':
      return 'watched'
    case 'WATCHING':
      return 'watching'
    case 'WANNA_WATCH':
      return 'wanna'
    case 'ON_HOLD':
    case 'STOP_WATCHING':
      return 'stopped'
    default:
      return unseen ? 'unseen' : 'none'
  }
}

// かけている条件の数（「絞り込み」のボタンに添える）。期間は1つと数える
export function browseFilterCount(f: BrowseFilter, period: BrowsePeriod): number {
  return (f.mine.length > 0 ? 1 : 0) + (f.media.length > 0 ? 1 : 0) + (f.genres.length > 0 ? 1 : 0) + (f.studios.length > 0 ? 1 : 0) + (periodActive(period) ? 1 : 0)
}

function infoOf(w: BrowseWork, info: ReadonlyMap<number, MediaInfo> | null): MediaInfo | undefined {
  const mal = Number(w.malAnimeId)
  return info && Number.isInteger(mal) && mal > 0 ? info.get(mal) : undefined
}

// 読み込んだ作品から、条件に合う作品だけを残す（期間は読むときに済んでいる）。
// ジャンル・制作会社の条件は、作品の情報が無い作品（読み込み中・Shikimori に無い）を外す
export function applyBrowseFilter(
  works: readonly BrowseWork[],
  f: BrowseFilter,
  info: ReadonlyMap<number, MediaInfo> | null,
  unseen: ReadonlySet<number> = new Set(),
): BrowseWork[] {
  if (browseFilterCount(f, NO_PERIOD) === 0) return [...works]
  return works.filter((w) => {
    if (f.mine.length > 0 && !f.mine.includes(mineOf(w.viewerStatusState, unseen.has(w.annictId)))) return false
    if (f.media.length > 0 && !f.media.includes(mediaKindOf(w.media))) return false
    if (f.genres.length > 0 || f.studios.length > 0) {
      const m = infoOf(w, info)
      if (!m) return false
      if (f.genres.length > 0 && !f.genres.some((g) => m.genres.includes(g))) return false
      if (f.studios.length > 0 && !f.studios.some((s) => m.studios.includes(s))) return false
    }
    return true
  })
}

// 選択肢: 自分の記録は件数つき、ジャンル・制作会社は読み込んだ作品にあるもの（多い順、同数は名前順）
export function browseFilterChoices(
  works: readonly BrowseWork[],
  info: ReadonlyMap<number, MediaInfo> | null,
  unseen: ReadonlySet<number> = new Set(),
): {
  mine: Record<MineFilter, number>
  genres: { name: string; count: number }[]
  studios: { name: string; count: number }[]
} {
  const mine: Record<MineFilter, number> = {
    none: 0,
    unseen: 0,
    watched: 0,
    watching: 0,
    wanna: 0,
    stopped: 0,
  }
  for (const w of works) mine[mineOf(w.viewerStatusState, unseen.has(w.annictId))]++
  const genres = new Map<string, number>()
  const studios = new Map<string, number>()
  for (const w of works) {
    const m = infoOf(w, info)
    if (!m) continue
    for (const g of new Set(m.genres)) genres.set(g, (genres.get(g) ?? 0) + 1)
    for (const st of new Set(m.studios)) studios.set(st, (studios.get(st) ?? 0) + 1)
  }
  const ranked = (m: Map<string, number>) => [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { mine, genres: ranked(genres), studios: ranked(studios) }
}
