import type { BrowseWork, StatusState } from '../../lib/annict'
import { t } from '../../lib/i18n'
import { compareSeasons, nextSeason, seasonLabel, toSlug, type Season } from '../../lib/season'
import { mediaKindOf, type MediaInfo, type MediaKind } from '../records/recordList'
import { malIdOf } from '../../lib/malId'

// ブラウズの絞り込み。どの項目も空なら絞らない。項目どうしは、選んだ条件にすべて合う作品だけを残す（記録の絞り込みと同じ考え方）。
// 項目の中は、1作品に複数同時に付くもの（ジャンル）は選んだものを全部持つ作品（ファンタジーと異世界なら両方）。
// 1作品に1つしか付かないもの（自分の記録・形式・制作会社）は「どれか」（見たと見たいなら、どちらか）。
// 期間（始めと終わりのクール）は、Annict から読む作品そのものを決める（上のクールの代わりに、期間のクールをまとめて読む）。
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

// 期間（始めと終わりのクール。どちらも含む）。片方が無ければ、そちらは端まで
export interface BrowsePeriod {
  from: Season | null
  to: Season | null
}

export const NO_PERIOD: BrowsePeriod = { from: null, to: null }

export function periodActive(p: BrowsePeriod): boolean {
  return p.from !== null || p.to !== null
}

// 始めと終わりを古い順に（逆に選んでいても同じ期間）
function ordered(p: BrowsePeriod): BrowsePeriod {
  return p.from && p.to && compareSeasons(p.from, p.to) > 0 ? { from: p.to, to: p.from } : p
}

// 期間に入るクールを、Annict の検索に渡す形（2018-spring）で。古い順。Annict は「2018-all」を受け付けないので、クールを並べる
export function periodSlugs(p: BrowsePeriod, oldest: Season, latest: Season): string[] {
  const { from, to } = ordered(p)
  const first = from && compareSeasons(from, oldest) > 0 ? from : oldest
  const last = to && compareSeasons(to, latest) < 0 ? to : latest
  const out: string[] = []
  for (let s = first; compareSeasons(s, last) <= 0; s = nextSeason(s)) out.push(toSlug(s))
  return out
}

// 期間の短い名前（「2022年 春〜2026年 秋」「2022年 春〜」「〜2010年 秋」）
export function periodLabel(p: BrowsePeriod): string {
  const { from, to } = ordered(p)
  if (from && to) return compareSeasons(from, to) === 0 ? seasonLabel(from) : t(`${seasonLabel(from)}〜${seasonLabel(to)}`, `${seasonLabel(from)} – ${seasonLabel(to)}`)
  if (from) return t(`${seasonLabel(from)}〜`, `${seasonLabel(from)} onward`)
  if (to) return t(`〜${seasonLabel(to)}`, `Through ${seasonLabel(to)}`)
  return t('すべての期間', 'All periods')
}

export const MINE_CHOICES: readonly { id: MineFilter; label: string }[] = [
  { id: 'none', get label() { return t('未記録', 'Not recorded') } },
  { id: 'unseen', get label() { return t('見てない', 'Haven’t seen') } },
  { id: 'watched', get label() { return t('見た', 'Watched') } },
  { id: 'watching', get label() { return t('見てる', 'Watching') } },
  { id: 'wanna', get label() { return t('見たい', 'Want to watch') } },
  { id: 'stopped', get label() { return t('視聴中断', 'Dropped') } },
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
  const mal = malIdOf(w)
  return info && mal ? info.get(mal) : undefined
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
      if (!f.genres.every((g) => m.genres.includes(g))) return false
      if (f.studios.length > 0 && !f.studios.some((s) => m.studios.includes(s))) return false
    }
    return true
  })
}

// 選択肢と件数。f はいまの条件で、件数は「それを足したら何作品になるか」
// （「どれか」の項目〈自分の記録・制作会社〉は、その項目を外してほかの項目で絞った作品の中の数。ジャンルは、いまの結果の中で持っている数）。
// ジャンル・制作会社は読み込んだ作品にあるものを、読み込んだ作品で多い順（同数は名前順）に並べ、選んでも並びは動かさない。
// いまの結果に1つも無いもの（足すと0作品になる）は出さない。選んでいるものは外せるように残す
export function browseFilterChoices(
  works: readonly BrowseWork[],
  info: ReadonlyMap<number, MediaInfo> | null,
  unseen: ReadonlySet<number> = new Set(),
  f: BrowseFilter = EMPTY_BROWSE_FILTER,
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
  for (const w of applyBrowseFilter(works, { ...f, mine: [] }, info, unseen)) mine[mineOf(w.viewerStatusState, unseen.has(w.annictId))]++
  const tally = (list: readonly BrowseWork[]) => {
    const genres = new Map<string, number>()
    const studios = new Map<string, number>()
    for (const w of list) {
      const m = infoOf(w, info)
      if (!m) continue
      for (const g of new Set(m.genres)) genres.set(g, (genres.get(g) ?? 0) + 1)
      for (const st of new Set(m.studios)) studios.set(st, (studios.get(st) ?? 0) + 1)
    }
    return { genres, studios }
  }
  const all = tally(works)
  const now = tally(applyBrowseFilter(works, f, info, unseen))
  const withoutStudios = tally(applyBrowseFilter(works, { ...f, studios: [] }, info, unseen))
  // 読み直して読み込んだ作品から消えた、選んでいるものも末尾に残す
  const ranked = (m: Map<string, number>, counts: Map<string, number>, selected: readonly string[]) => [
    ...[...m]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => ({ name, count: counts.get(name) ?? 0 }))
      .filter((c) => c.count > 0 || selected.includes(c.name)),
    ...selected.filter((name) => !m.has(name)).map((name) => ({ name, count: 0 })),
  ]
  return { mine, genres: ranked(all.genres, now.genres, f.genres), studios: ranked(all.studios, withoutStudios.studios, f.studios) }
}
