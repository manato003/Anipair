import { describe, expect, it } from 'vitest'
import type { LibraryEntry, StatusState } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import type { MediaInfo, RecordRow } from '../records/recordList'
import { PICK_STUDIOS, axisTable, courSlugs, fromMyLists, fromStudio, genresMatch, titleMatches } from './tierPicking'

const oldest = { year: 2000, name: 'winter' } as const
const latest = { year: 2027, name: 'winter' } as const

function row(id: number, state: StatusState, opts: { year?: number; season?: string; watchers?: number; title?: string; mal?: string } = {}): RecordRow {
  const entry: LibraryEntry = {
    workId: `W${id}`,
    annictId: id,
    title: opts.title ?? `作品${id}`,
    malAnimeId: opts.mal ?? null,
    state,
    stateAt: null,
    seasonYear: opts.year ?? 2026,
    seasonName: opts.season ?? 'AUTUMN',
    watchersCount: opts.watchers ?? id,
  }
  return { entry, review: null, cover: null }
}

describe('courSlugs', () => {
  it('続いたクールの幅を、年をまたいで古い順に並べる', () => {
    expect(courSlugs({ year: 2025, name: 'autumn' }, { year: 2026, name: 'spring' }, oldest, latest)).toEqual(['2025-autumn', '2026-winter', '2026-spring'])
    expect(courSlugs({ year: 2024, name: 'winter' }, { year: 2026, name: 'autumn' }, oldest, latest)).toHaveLength(12)
  })

  it('逆なら入れ替え、片方が無ければ端まで。両方無ければ絞らない', () => {
    expect(courSlugs({ year: 2026, name: 'spring' }, { year: 2025, name: 'autumn' }, oldest, latest)).toEqual(['2025-autumn', '2026-winter', '2026-spring'])
    expect(courSlugs({ year: 2026, name: 'autumn' }, null, oldest, latest)).toEqual(['2026-autumn', '2027-winter'])
    expect(courSlugs(null, { year: 2000, name: 'spring' }, oldest, latest)).toEqual(['2000-winter', '2000-spring'])
    expect(courSlugs(null, null, oldest, latest)).toEqual([])
  })
})

describe('titleMatches', () => {
  it('大文字・小文字を区別せず、英語の題名でも当てる', () => {
    expect(titleMatches({ title: '葬送のフリーレン', titleEn: 'Frieren' }, ' frie ')).toBe(true)
    expect(titleMatches({ title: '葬送のフリーレン' }, 'フリーレン')).toBe(true)
    expect(titleMatches({ title: '葬送のフリーレン' }, '呪術')).toBe(false)
    expect(titleMatches({ title: '葬送のフリーレン' }, '')).toBe(true)
  })
})

describe('fromMyLists', () => {
  const rows = [
    row(1, 'WATCHED', { watchers: 50 }),
    row(2, 'WATCHED', { watchers: 900, year: 2024, season: 'WINTER' }),
    row(3, 'WANNA_WATCH', { watchers: 300 }),
    row(4, 'STOP_WATCHING', { watchers: 10 }),
    row(5, 'ON_HOLD', { watchers: 20, title: 'Frieren' }),
    row(6, 'NO_STATE', { watchers: 1000 }),
  ]
  const ids = (r: RecordRow[]) => r.map((x) => x.entry.annictId)
  const base = { lists: ['watched', 'wanna'] as const, query: '', from: null, to: null, order: { by: 'popular', dir: 'DESC' } as const }

  it('選んだリストの作品を、人気の多い順か少ない順に並べる', () => {
    expect(ids(fromMyLists(rows, base))).toEqual([2, 3, 1])
    expect(ids(fromMyLists(rows, { ...base, order: { by: 'popular', dir: 'ASC' } }))).toEqual([1, 3, 2])
    // 放送時期の順（同じ時期の作品1と3は元の並び）
    expect(ids(fromMyLists(rows, { ...base, order: { by: 'season', dir: 'DESC' } }))).toEqual([1, 3, 2])
    expect(ids(fromMyLists(rows, { ...base, order: { by: 'season', dir: 'ASC' } }))).toEqual([2, 1, 3])
    expect(ids(fromMyLists(rows, { ...base, lists: ['stopped'] }))).toEqual([5, 4])
  })

  it('作品名と放送時期で絞る', () => {
    expect(ids(fromMyLists(rows, { ...base, lists: ['stopped'], query: 'frie' }))).toEqual([5])
    expect(ids(fromMyLists(rows, { ...base, from: { year: 2025, name: 'winter' }, to: null }))).toEqual([3, 1])
    expect(ids(fromMyLists(rows, { ...base, from: { year: 2026, name: 'autumn' }, to: { year: 2023, name: 'autumn' } }))).toEqual([2, 3, 1])
  })
})

describe('genresMatch', () => {
  it('当たるのは選んだジャンルを全部持つ作品。選んでいなければ当たり、作品情報が無ければ外れる', () => {
    expect(genresMatch(['Romance', 'School'], ['School', 'Romance'])).toBe(true)
    expect(genresMatch(['Romance', 'School'], ['Sci-Fi', 'Romance'])).toBe(false)
    expect(genresMatch(['Action'], ['Romance'])).toBe(false)
    expect(genresMatch(undefined, [])).toBe(true)
    expect(genresMatch(undefined, ['Romance'])).toBe(false)
  })
})

describe('fromMyLists のジャンル・制作会社', () => {
  const rows = [row(1, 'WATCHED', { mal: '11', watchers: 3 }), row(2, 'WATCHED', { mal: '12', watchers: 2 }), row(3, 'WATCHED', { watchers: 1 })]
  const info = new Map<number, MediaInfo>([
    [11, { genres: ['Romance', 'Isekai'], studios: ['MAPPA'] }],
    [12, { genres: ['Isekai'], studios: ['Bandai Namco Filmworks'] }],
  ])
  const base = { lists: ['watched'] as const, query: '', from: null, to: null, order: { by: 'popular', dir: 'DESC' } as const, info }
  const ids = (r: RecordRow[]) => r.map((x) => x.entry.annictId)
  const sunrise = PICK_STUDIOS.find((s) => s.ids.includes(14))!

  it('ジャンル・制作会社で絞り、作品情報の無い作品は出さない', () => {
    expect(ids(fromMyLists(rows, base))).toEqual([1, 2, 3])
    // 2つ選ぶと、両方を持つ作品だけ
    expect(ids(fromMyLists(rows, { ...base, genres: ['Romance', 'Isekai'] }))).toEqual([1])
    expect(ids(fromMyLists(rows, { ...base, genres: ['Isekai'] }))).toEqual([1, 2])
    // サンライズのチップは、名前の変わったあとの Bandai Namco Filmworks の作品にも当たる
    expect(ids(fromMyLists(rows, { ...base, studio: sunrise }))).toEqual([2])
    expect(ids(fromMyLists(rows, { ...base, genres: ['Romance'], info: null }))).toEqual([])
  })
})

describe('fromStudio', () => {
  const media = (idMal: number, opts: Partial<Media> = {}): Media => ({
    idMal,
    title: { native: `作品${idMal}`, romaji: `Sakuhin ${idMal}`, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2020,
    genres: [],
    themes: [],
    demographics: [],
    studios: ['MAPPA'],
    cover: null,
    score: null,
    prequels: [],
    related: [],
    popularity: idMal,
    ...opts,
  })
  const list = [
    media(1, { seasonYear: 2018, genres: ['Action'], themes: ['Isekai'] }),
    media(2, { seasonYear: 2022, themes: ['Isekai'] }),
    media(3, { seasonYear: null }),
    media(4, { isAdult: true }),
    media(5, { format: 'PV' }),
    media(6, { seasonYear: 2024, title: { native: '呪術廻戦', romaji: 'Jujutsu Kaisen', english: 'Jujutsu Kaisen' } }),
  ]
  const base = { query: '', from: null, to: null, order: { by: 'popular', dir: 'DESC' } as const, genres: [] as string[] }
  const ids = (m: Media[]) => m.map((x) => x.idMal)

  it('人気順に並べ、成人向けと PV・CM・音楽は出さない', () => {
    expect(ids(fromStudio(list, base))).toEqual([6, 3, 2, 1])
    expect(ids(fromStudio(list, { ...base, order: { by: 'popular', dir: 'ASC' } }))).toEqual([1, 2, 3, 6])
  })

  it('放送時期の順は年で並べ、年の分からない作品は後ろ', () => {
    expect(ids(fromStudio(list, { ...base, order: { by: 'season', dir: 'DESC' } }))).toEqual([6, 2, 1, 3])
    expect(ids(fromStudio(list, { ...base, order: { by: 'season', dir: 'ASC' } }))).toEqual([1, 2, 6, 3])
  })

  it('作品名（日本語・英語・ローマ字）・ジャンル（テーマも）・放送年で絞る。年は から・まで の年を含み、年の分からない作品は出さない', () => {
    expect(ids(fromStudio(list, { ...base, query: 'jujutsu' }))).toEqual([6])
    expect(ids(fromStudio(list, { ...base, genres: ['Isekai'] }))).toEqual([2, 1])
    expect(ids(fromStudio(list, { ...base, genres: ['Isekai', 'Action'] }))).toEqual([1])
    expect(ids(fromStudio(list, { ...base, from: { year: 2022, name: 'autumn' }, to: { year: 2024, name: 'winter' } }))).toEqual([6, 2])
    expect(ids(fromStudio(list, { ...base, from: { year: 2024, name: 'winter' }, to: { year: 2018, name: 'spring' } }))).toEqual([6, 2, 1])
    expect(ids(fromStudio(list, { ...base, to: { year: 2019, name: 'autumn' } }))).toEqual([1])
  })
})

describe('axisTable', () => {
  it('答えた軸から、仮の題名とシートの絞り込みを作る', () => {
    const autumn = { year: 2026, name: 'autumn' } as const
    expect(axisTable({ kind: 'free' }, 3)).toEqual({ title: 'Tier表 3', preset: null })
    expect(axisTable({ kind: 'wanna' }, 2)).toEqual({ title: '見たい作品', preset: { lists: ['wanna'] } })
    expect(axisTable({ kind: 'season', season: autumn }, 2)).toEqual({ title: '2026年 秋のアニメ', preset: { from: autumn, to: autumn } })
    expect(axisTable({ kind: 'genre', genre: 'Romance' }, 2)).toEqual({ title: '恋愛のアニメ', preset: { genres: ['Romance'] } })
    const mappa = PICK_STUDIOS[0]
    expect(axisTable({ kind: 'studio', studio: mappa }, 2)).toEqual({ title: 'MAPPAの作品', preset: { studioId: mappa.id } })
  })
})
