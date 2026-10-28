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
  [103, { genres: ['Fantasy', 'Isekai'], studios: ['MAPPA'] }],
  [104, { genres: ['Fantasy'], studios: ['MAPPA', 'ufotable'] }],
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
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, studios: ['ufotable'] }, info))).toEqual([1, 2, 4])
  })

  it('keeps only works that match every condition: all the chosen genres, and any of the chosen records, formats and studios', () => {
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, genres: ['Fantasy'] }, info))).toEqual([3, 4])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, genres: ['Fantasy', 'Isekai'] }, info))).toEqual([3])
    // 記録・形式・制作会社は1作品に1つなので、項目の中はどれか
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, studios: ['MAPPA', 'Kyoto Animation'] }, info))).toEqual([3, 4])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, genres: ['Isekai'], studios: ['MAPPA', 'ufotable'] }, info))).toEqual([3])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, mine: ['none', 'wanna'] }, null))).toEqual([1, 3, 5])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, mine: ['wanna', 'stopped'], genres: ['Fantasy'] }, info))).toEqual([3, 4])
    expect(ids(applyBrowseFilter(works, { ...EMPTY_BROWSE_FILTER, mine: ['wanna'], genres: ['Fantasy'] }, info))).toEqual([3])
  })

  it('counts each choice within the current result, so a chip shows what adding it leaves', () => {
    const c = browseFilterChoices(works, info, new Set(), { ...EMPTY_BROWSE_FILTER, genres: ['Fantasy'] })
    // 並びは読み込んだ作品での多い順のまま。いまの結果（作品3・4）に無いジャンルは出さない
    expect(c.genres).toEqual([
      { name: 'Fantasy', count: 2 },
      { name: 'Isekai', count: 1 },
    ])
    expect(c.studios).toEqual([
      { name: 'ufotable', count: 1 },
      { name: 'MAPPA', count: 2 },
    ])
    // 自分の記録は、ほかの項目で絞った中の数
    expect(c.mine).toMatchObject({ wanna: 1, stopped: 1, none: 0 })
    // 制作会社は「どれか」なので、制作会社を外して絞った中の数（MAPPA を選んでも ufotable の数は残る）
    const byStudio = browseFilterChoices(works, info, new Set(), { ...EMPTY_BROWSE_FILTER, genres: ['Fantasy'], studios: ['MAPPA'] })
    expect(byStudio.studios).toEqual([
      { name: 'ufotable', count: 1 },
      { name: 'MAPPA', count: 2 },
    ])
    // 選んでいるものは、結果が0でも外せるように残す
    const none = browseFilterChoices(works, info, new Set(), { ...EMPTY_BROWSE_FILTER, genres: ['Romance', 'Action'] })
    expect(none.genres).toEqual([
      { name: 'Action', count: 0 },
      { name: 'Romance', count: 0 },
    ])
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
    expect(browseFilterCount({ ...EMPTY_BROWSE_FILTER, mine: ['none'] }, { from: { year: 2018, name: 'spring' }, to: null })).toBe(2)
  })

  it('counts the choices in the loaded works', () => {
    const c = browseFilterChoices(works, info)
    expect(c.mine).toEqual({ none: 2, unseen: 0, watched: 1, watching: 0, wanna: 1, stopped: 1 })
    expect(c.studios).toEqual([
      { name: 'ufotable', count: 3 },
      { name: 'MAPPA', count: 2 },
    ])
  })
})

describe('browse period', () => {
  const oldest = { year: 1970, name: 'winter' } as const
  const latest = { year: 2027, name: 'winter' } as const

  it('turns the first and last cour into every cour between them, oldest first', () => {
    expect(periodSlugs({ from: { year: 2018, name: 'autumn' }, to: { year: 2019, name: 'spring' } }, oldest, latest)).toEqual(['2018-autumn', '2019-winter', '2019-spring'])
    // 逆に選んでいても同じ
    expect(periodSlugs({ from: { year: 2019, name: 'spring' }, to: { year: 2018, name: 'autumn' } }, oldest, latest)).toHaveLength(3)
    // 片方が無ければ端まで（範囲の外は切る）
    expect(periodSlugs({ from: { year: 2026, name: 'autumn' }, to: null }, oldest, latest)).toEqual(['2026-autumn', '2027-winter'])
    expect(periodSlugs({ from: null, to: { year: 1970, name: 'spring' } }, oldest, latest)).toEqual(['1970-winter', '1970-spring'])
    expect(periodSlugs({ from: { year: 2030, name: 'winter' }, to: null }, oldest, latest)).toEqual([])
  })

  it('names the period shortly', () => {
    expect(periodLabel({ from: { year: 2022, name: 'spring' }, to: { year: 2026, name: 'autumn' } })).toBe('2022年 春〜2026年 秋')
    expect(periodLabel({ from: { year: 2026, name: 'autumn' }, to: { year: 2022, name: 'spring' } })).toBe('2022年 春〜2026年 秋')
    expect(periodLabel({ from: { year: 2020, name: 'summer' }, to: { year: 2020, name: 'summer' } })).toBe('2020年 夏')
    expect(periodLabel({ from: { year: 2018, name: 'winter' }, to: null })).toBe('2018年 冬〜')
    expect(periodLabel({ from: null, to: { year: 2010, name: 'autumn' } })).toBe('〜2010年 秋')
    expect(periodActive(NO_PERIOD)).toBe(false)
  })
})
