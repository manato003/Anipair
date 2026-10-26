import type { BrowseWork, StatusState } from '../../lib/annict'
import { t } from '../../lib/i18n'
import { malIdOf } from '../../lib/malId'
import { compareSeasons, seasonLabel, seasonOfWork, toSlug, type Season } from '../../lib/season'
import type { Media } from '../../lib/shikimori'
import { genreName } from '../match/taste'
import type { MediaInfo, RecordRow } from '../records/recordList'
import type { TierWork } from './tierList'

// 選んだ表に作品を足すシート（TierPick.tsx）の、純粋な部分。
// 作品は Annict の検索（作品名・放送時期・人気の順）か、自分のリスト（見た・見てる・見たい・視聴中断）か、制作会社の作品（Shikimori）から出す。
// ジャンルは Shikimori の作品情報で手元で絞る（Annict の検索はジャンル・制作会社で絞れない）

export type PickList = 'watched' | 'watching' | 'wanna' | 'stopped'

const LIST_STATES: Record<PickList, readonly StatusState[]> = {
  watched: ['WATCHED'],
  watching: ['WATCHING'],
  wanna: ['WANNA_WATCH'],
  stopped: ['ON_HOLD', 'STOP_WATCHING'],
}

// 並べ方。人気（Annict で記録した人の数。制作会社の作品は Shikimori でリストに入れた人の数）か放送時期で、
// 向きは多い・新しい順（DESC）か少ない・古い順（ASC）。放送時期の分からない作品は、どちらの向きでも後ろ
export interface PickOrder {
  by: 'popular' | 'season'
  dir: 'DESC' | 'ASC'
}

// 放送時期の分からない作品を後ろにして比べる（向きは sign）
function byKnown<T>(a: T | null, b: T | null, sign: number, compare: (a: T, b: T) => number): number {
  if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
  return sign * compare(a, b)
}

// 放送時期の「から〜まで」に入るクールを、Annict の検索に渡す形（2024-winter）で古い順に。続いたクールの幅で、年をまたいでよい。
// 片方が null ならそちらは端（oldest・latest）まで。両方 null なら絞らない（空）
export function courSlugs(from: Season | null, to: Season | null, oldest: Season, latest: Season): string[] {
  if (!from && !to) return []
  let a = from ?? oldest
  let b = to ?? latest
  if (compareSeasons(a, b) > 0) [a, b] = [b, a]
  if (compareSeasons(a, oldest) < 0) a = oldest
  if (compareSeasons(b, latest) > 0) b = latest
  const out: string[] = []
  for (let s = a; compareSeasons(s, b) <= 0; s = nextCour(s)) out.push(toSlug(s))
  return out
}

const COURS = ['winter', 'spring', 'summer', 'autumn'] as const

function nextCour(s: Season): Season {
  const i = COURS.indexOf(s.name)
  return i === COURS.length - 1 ? { year: s.year + 1, name: 'winter' } : { year: s.year, name: COURS[i + 1] }
}

// 絞り込みに出すジャンル（Shikimori の英語名。ジャンルとテーマ）。よく使われそうな順
export const PICK_GENRES: readonly string[] = [
  'Romance', 'Sci-Fi', 'Fantasy', 'Isekai', 'Reincarnation', 'Action', 'Comedy', 'Slice of Life', 'Drama', 'Mystery', 'Sports', 'Horror',
  'Mecha', 'School', 'Music', 'Psychological', 'Supernatural', 'Adventure', 'Suspense', 'Iyashikei', 'Villainess', 'Mahou Shoujo', 'Historical', 'Military',
  'Time Travel', 'Video Game', 'Gourmet', 'Idols (Female)', 'Idols (Male)', 'Super Power', 'Survival', 'Space', 'Detective', 'Harem', 'Love Polygon',
  'Girls Love', 'Boys Love', 'CGDCT', 'Gag Humor', 'Martial Arts', 'Team Sports', 'Workplace', 'Showbiz',
]

export interface PickStudio {
  // チップの ID（Shikimori の制作会社の ID の1つ目）
  id: string
  label: string
  // Shikimori の制作会社の ID（作品の一覧を読む）と名前（自分のリストを絞るときに、作品情報の制作会社と照らす）
  ids: readonly number[]
  names: readonly string[]
}

function makeStudio(label: () => string, ids: readonly number[], names: readonly string[]): PickStudio {
  return {
    id: String(ids[0]),
    get label() {
      return label()
    },
    ids,
    names,
  }
}

// 主な制作会社（2026-10-27 利用者と決めた20社）。ID と名前は Shikimori の制作会社の一覧で確かめた（2026-10-27）。
// サンライズは 2022年に Bandai Namco Filmworks に変わったので、両方の作品を出す
export const PICK_STUDIOS: readonly PickStudio[] = [
  makeStudio(() => t('MAPPA', 'MAPPA'), [569], ['MAPPA']),
  makeStudio(() => t('Production I.G', 'Production I.G'), [10], ['Production I.G']),
  makeStudio(() => t('スタジオジブリ', 'Studio Ghibli'), [21], ['Studio Ghibli']),
  makeStudio(() => t('京都アニメーション', 'Kyoto Animation'), [2], ['Kyoto Animation']),
  makeStudio(() => t('ufotable', 'ufotable'), [43], ['ufotable']),
  makeStudio(() => t('ボンズ', 'Bones'), [4], ['Bones']),
  makeStudio(() => t('WIT STUDIO', 'Wit Studio'), [858], ['Wit Studio']),
  makeStudio(() => t('CloverWorks', 'CloverWorks'), [1835], ['CloverWorks']),
  makeStudio(() => t('A-1 Pictures', 'A-1 Pictures'), [56], ['A-1 Pictures']),
  makeStudio(() => t('サンライズ', 'Sunrise'), [14, 2424], ['Sunrise', 'Bandai Namco Filmworks']),
  makeStudio(() => t('シャフト', 'Shaft'), [44], ['Shaft']),
  makeStudio(() => t('マッドハウス', 'Madhouse'), [11], ['Madhouse']),
  makeStudio(() => t('東映アニメーション', 'Toei Animation'), [18], ['Toei Animation']),
  makeStudio(() => t('TRIGGER', 'Trigger'), [803], ['Trigger']),
  makeStudio(() => t('P.A.WORKS', 'P.A. Works'), [132], ['P.A. Works']),
  makeStudio(() => t('J.C.STAFF', 'J.C.Staff'), [7], ['J.C.Staff']),
  makeStudio(() => t('david production', 'David Production'), [287], ['David Production']),
  makeStudio(() => t('ぴえろ', 'Pierrot'), [1], ['Studio Pierrot']),
  makeStudio(() => t('動画工房', 'Doga Kobo'), [95], ['Doga Kobo']),
  makeStudio(() => t('サイエンスSARU', 'Science SARU'), [1591], ['Science SARU']),
]

// シートを開いたときの絞り込み（新しい表を「何の表か」から作ったとき）
export interface PickPreset {
  lists?: PickList[]
  from?: Season
  to?: Season
  genres?: string[]
  studioId?: string
}

// 新しい表を何の作品で作るか（軸）。どれも作った時点で選んだ作品だけの表になり、あとから軸に合わせて増えはしない
export type TableAxis =
  | { kind: 'free' }
  | { kind: 'wanna' }
  | { kind: 'season'; season: Season }
  | { kind: 'genre'; genre: string }
  | { kind: 'studio'; studio: PickStudio }

// 軸から、表の仮の題名と、作品を足すシートの絞り込み。n は何つめの表か（自分で選ぶ表の題名）
export function axisTable(axis: TableAxis, n: number): { title: string; preset: PickPreset | null } {
  switch (axis.kind) {
    case 'free':
      return { title: t(`Tier表 ${n}`, `Tier list ${n}`), preset: null }
    case 'wanna':
      return { title: t('見たい作品', 'Want to watch'), preset: { lists: ['wanna'] } }
    case 'season':
      return { title: t(`${seasonLabel(axis.season)}のアニメ`, `${seasonLabel(axis.season)} anime`), preset: { from: axis.season, to: axis.season } }
    case 'genre':
      return { title: t(`${genreName(axis.genre)}のアニメ`, `${genreName(axis.genre)} anime`), preset: { genres: [axis.genre] } }
    case 'studio':
      return { title: t(`${axis.studio.label}の作品`, `${axis.studio.label} anime`), preset: { studioId: axis.studio.id } }
  }
}

// 作品情報のジャンル・テーマが、選んだジャンルのどれかに当たるか（ブラウズ・記録の絞り込みと同じく「どれか」）。選んでいなければ当たる
export function genresMatch(genres: readonly string[] | undefined, selected: readonly string[]): boolean {
  return selected.length === 0 || (!!genres && selected.some((g) => genres.includes(g)))
}

// 作品名に含むか（大文字・小文字と前後の空白は区別しない）。英語の題名でも当てる
export function titleMatches(w: { title: string; titleEn?: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return w.title.toLowerCase().includes(q) || !!w.titleEn?.toLowerCase().includes(q)
}

// 自分のリストから出す作品。リスト・作品名・放送時期・ジャンル・制作会社で絞り、人気の順に並べる。
// 放送時期で絞るときは時期の分からない作品を、ジャンル・制作会社で絞るときは作品情報（info）の無い作品を出さない
export function fromMyLists(
  rows: readonly RecordRow[],
  opts: {
    lists: readonly PickList[]
    query: string
    from: Season | null
    to: Season | null
    order: PickOrder
    genres?: readonly string[]
    studio?: PickStudio | null
    info?: ReadonlyMap<number, MediaInfo> | null
  },
): RecordRow[] {
  const genres = opts.genres ?? []
  const studio = opts.studio ?? null
  const states = new Set(opts.lists.flatMap((l) => LIST_STATES[l]))
  let [from, to] = [opts.from, opts.to]
  if (from && to && compareSeasons(from, to) > 0) [from, to] = [to, from]
  const sign = opts.order.dir === 'ASC' ? 1 : -1
  return rows
    .filter((r) => {
      if (!states.has(r.entry.state) || !titleMatches(r.entry, opts.query)) return false
      if (genres.length > 0 || studio) {
        const mal = malIdOf(r.entry)
        const m = mal === null ? undefined : opts.info?.get(mal)
        if (!m || !genresMatch(m.genres, genres) || (studio && !studio.names.some((n) => m.studios.includes(n)))) return false
      }
      if (!from && !to) return true
      const s = seasonOfWork(r.entry)
      return !!s && (!from || compareSeasons(s, from) >= 0) && (!to || compareSeasons(s, to) <= 0)
    })
    .sort((a, b) =>
      opts.order.by === 'season'
        ? byKnown(seasonOfWork(a.entry), seasonOfWork(b.entry), sign, compareSeasons)
        : sign * ((a.entry.watchersCount ?? 0) - (b.entry.watchersCount ?? 0)),
    )
}

export function workOfRow(r: RecordRow): TierWork {
  const e = r.entry
  return { annictId: e.annictId, workId: e.workId, title: e.title, titleEn: e.titleEn ?? null, malAnimeId: e.malAnimeId, seasonYear: e.seasonYear ?? null, seasonName: e.seasonName ?? null, imageUrl: e.imageUrl ?? null }
}

export function workOfBrowse(w: BrowseWork): TierWork {
  return { annictId: w.annictId, workId: w.id, title: w.title, titleEn: w.titleEn ?? null, malAnimeId: w.malAnimeId, seasonYear: w.seasonYear, seasonName: w.seasonName, imageUrl: w.imageUrl ?? null }
}

// 制作会社の作品（Shikimori。新しい順に届く）から出す作品。作品名・放送年・ジャンルで絞り、人気か放送時期の順に並べる（同じ年なら届いた順で新しい方が先）。
// Shikimori の作品情報には放送の季節が無いので、放送時期は年で絞る（から・まで の年を含む）。成人向けと、Annict に無い PV・CM・音楽は出さない
export function fromStudio(
  medias: readonly Media[],
  opts: { query: string; from: Season | null; to: Season | null; order: PickOrder; genres: readonly string[] },
): Media[] {
  let [fromYear, toYear] = [opts.from?.year ?? null, opts.to?.year ?? null]
  if (fromYear !== null && toYear !== null && fromYear > toYear) [fromYear, toYear] = [toYear, fromYear]
  const q = opts.query.trim().toLowerCase()
  const sign = opts.order.dir === 'ASC' ? 1 : -1
  const index = new Map(medias.map((m, i) => [m.idMal, i]))
  return medias
    .filter((m) => {
      if (m.isAdult || (m.format && SKIP_FORMATS.has(m.format))) return false
      if (q && ![m.title.native, m.title.english, m.title.romaji].some((s) => s?.toLowerCase().includes(q))) return false
      if ((fromYear !== null || toYear !== null) && (m.seasonYear === null || (fromYear !== null && m.seasonYear < fromYear) || (toYear !== null && m.seasonYear > toYear))) return false
      return genresMatch([...m.genres, ...m.themes], opts.genres)
    })
    .sort((a, b) =>
      opts.order.by === 'season'
        ? byKnown(a.seasonYear, b.seasonYear, sign, (x, y) => x - y) || -sign * ((index.get(a.idMal) ?? 0) - (index.get(b.idMal) ?? 0))
        : sign * ((a.popularity ?? 0) - (b.popularity ?? 0)),
    )
}

const SKIP_FORMATS = new Set(['MUSIC', 'PV', 'CM'])
