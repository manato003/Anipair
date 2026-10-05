import { describe, expect, it } from 'vitest'
import type { LibraryEntry, MyReview, RatingState, StatusState } from '../../lib/annict'
import {
  EMPTY_FILTER,
  STATE_OPTIONS,
  activeFilterCount,
  applyFilter,
  countBuckets,
  filterChoices,
  filterRows,
  formatDate,
  mediaKindOf,
  optionState,
  sortNote,
  sortOptions,
  sortRows,
  type MediaInfo,
  type RecordRow,
} from './recordList'

function row(id: number, state: StatusState, rating: RatingState | null, stateAt: string | null, title = `作品${id}`): RecordRow {
  const entry: LibraryEntry = { workId: `W${id}`, annictId: id, title, malAnimeId: null, state, stateAt }
  const review: MyReview | null = rating
    ? { id: `R${id}`, body: '', createdAt: '', ratingOverallState: rating, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
    : null
  return { entry, review, cover: null }
}

const rows = [
  row(1, 'WATCHED', 'GOOD', '2026-09-01T00:00:00Z'),
  row(2, 'WATCHED', 'GREAT', '2026-08-01T00:00:00Z'),
  row(3, 'WATCHED', null, '2026-09-20T00:00:00Z'),
  row(4, 'WATCHED', 'BAD', '2026-09-25T00:00:00Z'),
  row(5, 'WATCHED', 'GREAT', '2026-09-10T00:00:00Z'),
  row(6, 'WANNA_WATCH', null, '2026-09-29T00:00:00Z', 'ゆるキャン△ SEASON２'),
  row(7, 'ON_HOLD', null, null),
  row(8, 'STOP_WATCHING', 'AVERAGE', '2026-07-01T00:00:00Z'),
  row(9, 'WATCHING', null, '2026-09-28T00:00:00Z'),
]

describe('countBuckets', () => {
  it('groups on hold and dropped together', () => {
    expect(countBuckets(rows)).toEqual({ watched: 5, wanna: 1, watching: 1, other: 2 })
  })
})

describe('sortRows', () => {
  it('by rating: great → good → average → bad → unrated, newest first within a rating', () => {
    expect(sortRows(filterRows(rows, 'watched', ''), 'rating').map((r) => r.entry.annictId)).toEqual([5, 2, 1, 4, 3])
  })

  it('by recency without broadcast seasons: newest record first, unknown dates last', () => {
    expect(sortRows(filterRows(rows, 'other', ''), 'aired').map((r) => r.entry.annictId)).toEqual([8, 7])
    expect(sortRows(filterRows(rows, 'watched', ''), 'aired').map((r) => r.entry.annictId)).toEqual([4, 3, 5, 1, 2])
  })

  it('by recency: newest broadcast season first (not the day it was recorded), unknown seasons last', () => {
    const aired = (id: number, year: number | null, season: string | null, stateAt: string, rating: RatingState | null = null) => {
      const r = row(id, 'WATCHED', rating, stateAt)
      return { ...r, entry: { ...r.entry, seasonYear: year, seasonName: season } }
    }
    const list = [
      aired(1, 2010, 'SPRING', '2026-10-01T00:00:00Z'),
      aired(2, 2024, 'WINTER', '2026-01-01T00:00:00Z'),
      aired(3, 2024, 'AUTUMN', '2025-01-01T00:00:00Z'),
      aired(4, null, null, '2026-10-02T00:00:00Z'),
      aired(5, 2024, 'AUTUMN', '2025-06-01T00:00:00Z'),
      aired(6, 2024, null, '2024-01-01T00:00:00Z'),
    ]
    // 2024年秋と、季節不明の2024年（年の最後＝秋と同じ扱い）は、記録の新しい順 → 2024年冬 → 2010年 → 放送時期不明
    expect(sortRows(list, 'aired').map((r) => r.entry.annictId)).toEqual([5, 3, 6, 2, 1, 4])
  })

  it('by rating: within the same rating, newest broadcast season first', () => {
    const r1 = row(1, 'WATCHED', 'GOOD', '2026-10-01T00:00:00Z')
    const r2 = row(2, 'WATCHED', 'GOOD', '2020-01-01T00:00:00Z')
    const list = [{ ...r1, entry: { ...r1.entry, seasonYear: 2001, seasonName: 'SPRING' } }, { ...r2, entry: { ...r2.entry, seasonYear: 2023, seasonName: 'SPRING' } }]
    expect(sortRows(list, 'rating').map((r) => r.entry.annictId)).toEqual([2, 1])
  })
})

describe('sortRows with a direction', () => {
  const ids = (list: RecordRow[]) => list.map((r) => r.entry.annictId)
  const watched = filterRows(rows, 'watched', '')

  it('by rating ascending: bad first, but unrated still last', () => {
    expect(ids(sortRows(watched, 'rating', 'asc'))).toEqual([4, 1, 5, 2, 3])
  })

  it('by the day it was recorded, newest or oldest first; unknown dates always last', () => {
    expect(ids(sortRows(watched, 'recorded', 'desc'))).toEqual([4, 3, 5, 1, 2])
    expect(ids(sortRows(watched, 'recorded', 'asc'))).toEqual([2, 1, 5, 3, 4])
    expect(ids(sortRows(filterRows(rows, 'other', ''), 'recorded', 'asc'))).toEqual([8, 7])
  })

  it('by broadcast season ascending: oldest first, unknown seasons still last', () => {
    const aired = (id: number, year: number | null) => {
      const r = row(id, 'WATCHED', null, '2026-01-01T00:00:00Z')
      return { ...r, entry: { ...r.entry, seasonYear: year, seasonName: 'SPRING' } }
    }
    const list = [aired(1, 2020), aired(2, null), aired(3, 2001), aired(4, 2012)]
    expect(ids(sortRows(list, 'aired', 'asc'))).toEqual([3, 4, 1, 2])
    expect(ids(sortRows(list, 'aired', 'desc'))).toEqual([1, 4, 3, 2])
  })

  it('popular: by the number of Annict watchers, unknown last either way', () => {
    const pop = (id: number, n: number | undefined) => {
      const r = row(id, 'WATCHED', null, '2026-01-01T00:00:00Z')
      return { ...r, entry: { ...r.entry, watchersCount: n } }
    }
    const list = [pop(1, 300), pop(2, undefined), pop(3, 9000), pop(4, 50)]
    expect(ids(sortRows(list, 'popular', 'desc'))).toEqual([3, 1, 4, 2])
    expect(ids(sortRows(list, 'popular', 'asc'))).toEqual([4, 1, 3, 2])
  })
})

describe('sortOptions and sortNote', () => {
  it('offers rating only for watched, the taste order only for wanna, and popularity everywhere', () => {
    expect(sortOptions('watched').map((o) => o.label)).toEqual(['評価順', '人気順', '記録順', '放送日順'])
    expect(sortOptions('wanna').map((o) => o.label)).toEqual(['記録順', '人気順', '放送日順', 'おすすめ順'])
    expect(sortOptions('watching').map((o) => o.label)).toEqual(['記録順', '人気順', '放送日順'])
    expect(sortOptions('other').map((o) => o.label)).toEqual(['記録順', '人気順', '放送日順'])
  })

  it('says in words which way the list runs', () => {
    expect(sortNote({ key: 'rating', dir: 'desc' })).toMatch(/^評価の高い順/)
    expect(sortNote({ key: 'rating', dir: 'asc' })).toMatch(/^評価の低い順/)
    expect(sortNote({ key: 'recorded', dir: 'asc' })).toBe('Annict に記録した日の古い順です。')
    expect(sortNote({ key: 'popular', dir: 'desc' })).toBe('Annict でこの作品を記録した人の多い順です。')
    expect(sortNote({ key: 'aired', dir: 'desc' })).toMatch(/^放送の新しい順/)
  })
})

describe('applyFilter', () => {
  const withWork = (id: number, rating: RatingState | null, year: number, season: string, media: string, mal: number) => {
    const r = row(id, 'WATCHED', rating, '2026-01-01T00:00:00Z')
    return { ...r, entry: { ...r.entry, seasonYear: year, seasonName: season, media, malAnimeId: String(mal) } }
  }
  const list = [
    withWork(1, 'GREAT', 2010, 'SPRING', 'TV', 101),
    withWork(2, 'GOOD', 2015, 'AUTUMN', 'MOVIE', 102),
    withWork(3, null, 2020, 'WINTER', 'WEB', 103),
    withWork(4, 'BAD', 2024, 'SUMMER', 'TV', 104),
  ]
  const info = new Map<number, MediaInfo>([
    [101, { genres: ['Drama', 'Romance'], studios: ['Kyoto Animation'] }],
    [102, { genres: ['Action'], studios: ['ufotable'] }],
    [103, { genres: ['Romance'], studios: ['ufotable'] }],
  ])
  const ids = (l: RecordRow[]) => l.map((r) => r.entry.annictId)

  it('keeps everything with no conditions', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0)
    expect(ids(applyFilter(list, EMPTY_FILTER, null))).toEqual([1, 2, 3, 4])
  })

  it('matches any choice within a condition, and all conditions together', () => {
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, ratings: ['GREAT', 'NONE'] }, null))).toEqual([1, 3])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, yearFrom: 2012, yearTo: 2020 }, null))).toEqual([2, 3])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, yearFrom: 2016 }, null))).toEqual([3, 4])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, seasons: ['SPRING', 'SUMMER'] }, null))).toEqual([1, 4])
    // 配信（WEB）は OVA と同じまとまり
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, media: ['ova'] }, null))).toEqual([3])
    const f = { ...EMPTY_FILTER, media: ['tv' as const], ratings: ['GREAT' as const] }
    expect(activeFilterCount(f)).toBe(2)
    expect(ids(applyFilter(list, f, null))).toEqual([1])
  })

  it('filters by genre and studio from the work data; works without data do not match', () => {
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, genres: ['Romance'] }, info))).toEqual([1, 3])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, studios: ['ufotable'] }, info))).toEqual([2, 3])
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, genres: ['Romance'], studios: ['ufotable'] }, info))).toEqual([3])
    // 作品の情報をまだ読んでいなければ、ジャンルの条件には何も当てはまらない
    expect(ids(applyFilter(list, { ...EMPTY_FILTER, genres: ['Romance'] }, null))).toEqual([])
  })

  it('offers the years, genres and studios found in the records, most common first', () => {
    const c = filterChoices(list, info)
    expect(c.years).toEqual([2024, 2020, 2015, 2010])
    expect(c.genres).toEqual([
      { name: 'Romance', count: 2 },
      { name: 'Action', count: 1 },
      { name: 'Drama', count: 1 },
    ])
    expect(c.studios[0]).toEqual({ name: 'ufotable', count: 2 })
  })

  it('maps Annict media to the filter kinds', () => {
    expect(['TV', 'MOVIE', 'OVA', 'WEB', 'OTHER', null].map(mediaKindOf)).toEqual(['tv', 'movie', 'ova', 'ova', 'other', 'other'])
  })
})

describe('filterRows', () => {
  it('matches titles regardless of full-width and half-width forms', () => {
    expect(filterRows(rows, 'wanna', 'season2').map((r) => r.entry.annictId)).toEqual([6])
    expect(filterRows(rows, 'watched', 'season2')).toEqual([])
  })
})

it('formatDate shows the local date and nothing for unknown dates', () => {
  expect(formatDate(null)).toBe('')
  expect(formatDate('nope')).toBe('')
  expect(formatDate(new Date(2026, 8, 30, 12).toISOString())).toBe('2026/9/30')
})

describe('state options', () => {
  it('offers exactly one way to say "stopped watching", saved as STOP_WATCHING', () => {
    expect(STATE_OPTIONS.map((o) => o.label)).toEqual(['見た', '見てる', '見たい', '視聴中断'])
    expect(STATE_OPTIONS.find((o) => o.label === '視聴中断')?.state).toBe('STOP_WATCHING')
  })

  it('shows on hold (set on the Annict site) as 視聴中断, and leaves the others as they are', () => {
    expect(optionState('ON_HOLD')).toBe('STOP_WATCHING')
    expect(optionState('STOP_WATCHING')).toBe('STOP_WATCHING')
    expect(optionState('WATCHED')).toBe('WATCHED')
    expect(optionState(null)).toBeNull()
  })
})
