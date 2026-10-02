import { describe, expect, it } from 'vitest'
import type { AniMedia } from '../../lib/anilist'
import { DEFAULT_FILTER, isDefaultFilter, matchesFilter, parseMatchFilter, type MatchFilter } from './matchFilter'
import { rankCandidates } from './taste'

function media(idMal: number, extra: Partial<AniMedia> = {}): AniMedia {
  return {
    id: idMal + 100000,
    idMal,
    title: { native: `作品${idMal}`, romaji: null, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2020,
    genres: [],
    tags: [],
    studios: [],
    cover: null,
    prequels: [],
    recommendations: [],
    ...extra,
  }
}

describe('parseMatchFilter', () => {
  it('falls back to the default (everything on, any year) for missing or broken values', () => {
    for (const v of [null, undefined, 'x', 5, [], {}, { formats: [], fromYear: null }, { formats: 'tv' }]) {
      expect(parseMatchFilter(v)).toEqual(DEFAULT_FILTER)
    }
  })

  it('keeps a valid saved filter', () => {
    expect(parseMatchFilter({ formats: ['movie', 'tv'], fromYear: 2010 })).toEqual({ formats: ['tv', 'movie'], fromYear: 2010 })
  })

  it('drops unknown formats and years, and never ends up with zero formats', () => {
    expect(parseMatchFilter({ formats: ['tv', 'radio'], fromYear: 1999 })).toEqual({ formats: ['tv'], fromYear: null })
    expect(parseMatchFilter({ formats: ['radio'], fromYear: 2020 })).toEqual({ formats: ['tv', 'movie', 'ova'], fromYear: 2020 })
  })

  it('the default is recognised as the default', () => {
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true)
    expect(isDefaultFilter({ formats: ['tv'], fromYear: null })).toBe(false)
    expect(isDefaultFilter({ ...DEFAULT_FILTER, fromYear: 2000 })).toBe(false)
  })
})

describe('matchesFilter', () => {
  const only = (formats: MatchFilter['formats']): MatchFilter => ({ formats, fromYear: null })

  it('groups TV_SHORT with TV, and OVA with ONA', () => {
    expect(matchesFilter({ format: 'TV_SHORT', seasonYear: 2020 }, only(['tv']))).toBe(true)
    expect(matchesFilter({ format: 'MOVIE', seasonYear: 2020 }, only(['tv']))).toBe(false)
    expect(matchesFilter({ format: 'ONA', seasonYear: 2020 }, only(['ova']))).toBe(true)
    expect(matchesFilter({ format: 'OVA', seasonYear: 2020 }, only(['ova']))).toBe(true)
    expect(matchesFilter({ format: 'MOVIE', seasonYear: 2020 }, only(['movie']))).toBe(true)
  })

  it('lets unknown format and year through only when that condition is "all"', () => {
    expect(matchesFilter({ format: null, seasonYear: null }, DEFAULT_FILTER)).toBe(true)
    expect(matchesFilter({ format: null, seasonYear: 2020 }, only(['tv']))).toBe(false)
    expect(matchesFilter({ format: 'TV', seasonYear: null }, { ...DEFAULT_FILTER, fromYear: 2000 })).toBe(false)
  })
})

describe('rankCandidates with a filter', () => {
  const profile = new Map<string, number>()
  const pool = [10, 11, 12, 13, 14].map((malId, i) => ({ malId, recScore: 10 - i, from: [] }))
  const details = new Map([
    [10, media(10, { format: 'TV', seasonYear: 1999 })],
    [11, media(11, { format: 'MOVIE', seasonYear: 2015 })],
    [12, media(12, { format: 'OVA', seasonYear: 2021 })],
    [13, media(13, { format: 'TV', seasonYear: null })],
    [14, media(14, { format: 'ONA', seasonYear: 2024, isAdult: true })],
  ])
  const ids = (filter?: MatchFilter) => rankCandidates(pool, details, profile, new Set(), filter).map((c) => c.media.idMal)

  it('is today\'s behaviour without a filter or with the default one', () => {
    expect(ids()).toEqual([10, 11, 12, 13])
    expect(ids(DEFAULT_FILTER)).toEqual([10, 11, 12, 13])
  })

  it('filters by format', () => {
    expect(ids({ formats: ['tv'], fromYear: null })).toEqual([10, 13])
    expect(ids({ formats: ['movie'], fromYear: null })).toEqual([11])
    expect(ids({ formats: ['ova'], fromYear: null })).toEqual([12])
    expect(ids({ formats: ['movie', 'ova'], fromYear: null })).toEqual([11, 12])
  })

  it('filters by year, and drops works with an unknown year unless the year is "all"', () => {
    expect(ids({ ...DEFAULT_FILTER, fromYear: 2000 })).toEqual([11, 12])
    expect(ids({ ...DEFAULT_FILTER, fromYear: 2010 })).toEqual([11, 12])
    expect(ids({ ...DEFAULT_FILTER, fromYear: 2020 })).toEqual([12])
  })

  it('keeps the hard filters (adult) whatever the filter says', () => {
    expect(ids({ formats: ['ova'], fromYear: 2020 })).not.toContain(14)
  })
})
