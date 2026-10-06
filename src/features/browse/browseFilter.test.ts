import { describe, expect, it } from 'vitest'
import type { BrowseWork, StatusState } from '../../lib/annict'
import type { MediaInfo } from '../records/recordList'
import { EMPTY_BROWSE_FILTER, NO_PERIOD, applyBrowseFilter, browseFilterChoices, browseFilterCount, mineOf, periodActive, periodLabel, periodSlugs } from './browseFilter'

function w(id: number, state: StatusState | null, media = 'TV', year = 2026, season = 'AUTUMN'): BrowseWork {
  return { id: `W${id}`, annictId: id, title: `作品${id}`, media, seasonYear: year, seasonName: season, malAnimeId: String(100 + id), watchersCount: 1, viewerStatusState: state }
}

const works = [w(1, null), w(2, 'WATCHED', 'MOVIE', 2010, 'SPRING'), w(3, 'WANNA_WATCH', 'WEB'), w(4, 'ON_HOLD'), w(5, 'NO_STATE')]
const info = new Map<number, MediaInfo>([
  [101, { genres: ['Romance'], studios: ['ufotable'] }],
  [102, { genres: ['Action'], studios: ['ufotable'] }],
])
const ids = (l: BrowseWork[]) => l.map((x) => x.annictId)

describe('browseFilter', () => {
  it('maps my status, treating no state as not recorded and on hold as stopped', () => {
    expect(['WATCHED', 'WATCHING', 'WANNA_WATCH', 'ON_HOLD', 'STOP_WATCHING', 'NO_STATE', null].map((s) => mineOf(s as StatusState | null))).toEqual([
      'watched',
      'watching',
      'wanna',
      'stopped',
      'stopped',
      'none',
      'none',
    ])
  })

  it('filters by my status and format', () => {
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, mine: ['none'] }, null))).toEqual([1, 5])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, media: ['ova'] }, null))).toEqual([3])
  })

  it('filters by genre and studio from the work data', () => {
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, genres: ['Romance'] }, info))).toEqual([1])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, studios: ['ufotable'] }, info))).toEqual([1, 2])
  })

  it('separates works marked "not watched" on the rate screen from the unrecorded ones (only while they have no record)', () => {
    // 作品5と作品2を「見てない」にしている。作品2はあとで記録したので、記録の方
    const unseen = new Set([5, 2])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, mine: ['unseen'] }, null, unseen))).toEqual([5])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, mine: ['none'] }, null, unseen))).toEqual([1])
    expect(browseFilterChoices(works, null, unseen).mine).toMatchObject({ none: 1, unseen: 1, watched: 1 })
  })

  it('counts the period as one condition', () => {
    expect(browseFilterCount(EMPTY_BROWSE_FILTER, NO_PERIOD)).toBe(0)
    expect(browseFilterCount({ ...EMPTY_BROWSE_FILTER, mine: ['none'] }, { yearFrom: 2018, yearTo: 2020, seasons: ['SPRING'] })).toBe(2)
  })

  it('counts the choices in the loaded works', () => {
    const c = browseFilterChoices(works, info)
    expect(c.mine).toEqual({ none: 2, unseen: 0, watched: 1, watching: 0, wanna: 1, stopped: 1 })
    expect(c.studios).toEqual([{ name: 'ufotable', count: 2 }])
  })
})

describe('browse period', () => {
  it('turns the years and seasons into the cours Annict searches, oldest first', () => {
    expect(periodSlugs({ yearFrom: 2018, yearTo: 2019, seasons: ['SPRING', 'AUTUMN'] }, 1970, 2027)).toEqual(['2018-spring', '2018-autumn', '2019-spring', '2019-autumn'])
    // 季節が空なら4つとも。年が逆でも同じ
    expect(periodSlugs({ yearFrom: 2019, yearTo: 2018, seasons: [] }, 1970, 2027)).toHaveLength(8)
    // 年の片方が無ければ端まで（範囲の外は切る）
    expect(periodSlugs({ yearFrom: 2026, yearTo: null, seasons: ['WINTER'] }, 1970, 2027)).toEqual(['2026-winter', '2027-winter'])
    expect(periodSlugs({ yearFrom: null, yearTo: null, seasons: ['SUMMER'] }, 1970, 2027)).toHaveLength(58)
  })

  it('names the period shortly', () => {
    expect(periodLabel({ yearFrom: 2018, yearTo: 2020, seasons: ['SUMMER', 'SPRING'] })).toBe('2018〜2020年 春・夏')
    expect(periodLabel({ yearFrom: 2020, yearTo: 2020, seasons: [] })).toBe('2020年')
    expect(periodLabel({ yearFrom: 2018, yearTo: null, seasons: [] })).toBe('2018年〜')
    expect(periodLabel({ yearFrom: null, yearTo: 2010, seasons: [] })).toBe('〜2010年')
    expect(periodLabel({ yearFrom: null, yearTo: null, seasons: ['WINTER'] })).toBe('すべての年の 冬')
    expect(periodActive(NO_PERIOD)).toBe(false)
  })
})
