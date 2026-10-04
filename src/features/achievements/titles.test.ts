import { describe, expect, it } from 'vitest'
import type { ViewerStats } from '../../lib/annict'
import { byRarity, coverageOf, evaluateTitles, HIDDEN_COUNT, RARITIES, type Coverage, type Facts } from './titles'

const stats = (patch: Partial<ViewerStats> = {}): ViewerStats => ({
  username: 'u',
  name: 'u',
  avatarUrl: null,
  createdAt: '2024-01-01T00:00:00Z',
  recordsCount: 0,
  watchedCount: 0,
  watchingCount: 0,
  wannaWatchCount: 0,
  onHoldCount: 0,
  stopWatchingCount: 0,
  followersCount: 0,
  followingsCount: 0,
  ...patch,
})

const facts = (patch: Partial<Facts> = {}): Facts => ({
  stats: stats(),
  watchedYears: [],
  coverage: new Map(),
  feats: {},
  now: new Date('2026-10-04T12:00:00'),
  ...patch,
})

const full: Coverage = { answered: 30, total: 30 }
const byId = (f: Facts) => new Map(evaluateTitles(f).map((t) => [t.id, t]))

describe('evaluateTitles', () => {
  it('gives nothing to a new user, but lists every visible title with its progress and seals all hidden ones', () => {
    const titles = evaluateTitles(facts())
    expect(titles.filter((t) => t.unlocked)).toHaveLength(0)
    expect(titles.filter((t) => t.group === 'hidden')).toHaveLength(HIDDEN_COUNT)
    expect(byId(facts()).get('season-full-4')?.progress).toEqual({ value: 0, goal: 4, unit: 'クール' })
  })

  it('counts seasons by how many of their popular works are answered, not by ratings', () => {
    const coverage = new Map<string, Coverage>([
      ['2019-winter', full],
      ['2019-spring', full],
      ['2019-summer', { answered: 15, total: 30 }],
      ['2019-autumn', { answered: 3, total: 30 }],
    ])
    const t = byId(facts({ coverage }))
    expect(t.get('season-half-1')?.unlocked).toBe(true)
    expect(t.get('season-full-1')?.unlocked).toBe(true)
    expect(t.get('season-full-4')?.unlocked).toBe(false)
    expect(t.get('season-full-4')?.progress?.value).toBe(2)
    // まだの年は、いちばん近い年を1つだけ進み具合つきで出す
    expect(t.get('year-2019')).toMatchObject({ unlocked: false, progress: { value: 2, goal: 4 } })
  })

  it('gives a year title for each year whose four seasons are all complete', () => {
    const coverage = new Map<string, Coverage>(['winter', 'spring', 'summer', 'autumn'].map((n) => [`2019-${n}`, full]))
    const t = byId(facts({ coverage }))
    expect(t.get('year-2019')).toMatchObject({ name: '2019年を統べる者', unlocked: true })
    expect(t.get('season-full-4')?.unlocked).toBe(true)
  })

  it('gives a decade title at 80% of the decade’s popular works answered', () => {
    const coverage = new Map<string, Coverage>([
      ['2003-spring', { answered: 8, total: 10 }],
      ['2005-autumn', { answered: 8, total: 10 }],
    ])
    expect(byId(facts({ coverage })).get('decade-2000')).toMatchObject({ unlocked: true, name: 'ゼロ年代の語り部' })
    coverage.set('2008-winter', { answered: 0, total: 10 })
    expect(byId(facts({ coverage })).get('decade-2000')).toMatchObject({ unlocked: false, progress: { value: 53, goal: 80, unit: '%' } })
  })

  it('unlocks hidden titles from what was built up on Annict and from moments in Anipair', () => {
    const t = byId(
      facts({
        stats: stats({ createdAt: '2015-06-01T00:00:00Z', recordsCount: 10000, watchedCount: 1000, wannaWatchCount: 300, stopWatchingCount: 40, onHoldCount: 10, followersCount: 100 }),
        watchedYears: [1985, 1995, 2005, 2015, 2025],
        feats: { lateNight: '2026-10-01T02:30:00Z' },
      }),
    )
    for (const id of ['hidden-dawn', 'hidden-veteran', 'hidden-records-1k', 'hidden-records-10k', 'hidden-watched-500', 'hidden-watched-1k', 'hidden-showa', 'hidden-decades', 'hidden-wanna', 'hidden-cut', 'hidden-guide', 'hidden-midnight']) {
      expect(t.get(id)?.unlocked, id).toBe(true)
    }
    expect(t.get('hidden-castle')?.unlocked).toBe(false)
  })

  it('counts the years since joining by the anniversary, and keeps Annict-based titles sealed when the numbers could not be read', () => {
    const now = new Date('2026-05-31T12:00:00')
    expect(byId(facts({ now, stats: stats({ createdAt: '2021-06-01T00:00:00Z' }) })).get('hidden-veteran')?.unlocked).toBe(false)
    expect(byId(facts({ now: new Date('2026-06-02T12:00:00'), stats: stats({ createdAt: '2021-06-01T00:00:00Z' }) })).get('hidden-veteran')?.unlocked).toBe(true)
    expect(evaluateTitles(facts({ stats: null })).filter((t) => t.unlocked)).toHaveLength(0)
  })
})

describe('more coverage titles', () => {
  const full: Coverage = { answered: 30, total: 30 }
  const seasons = (slugs: string[]) => new Map<string, Coverage>(slugs.map((slug) => [slug, full]))

  it('gives a season title for five complete seasons of the same name', () => {
    const t = byId(facts({ coverage: seasons(['2001-autumn', '2003-autumn', '2008-autumn', '2015-autumn', '2020-autumn', '2020-winter']) }))
    expect(t.get('season-name-autumn')).toMatchObject({ name: '紅葉の観測者', unlocked: true })
    expect(t.get('season-name-winter')).toMatchObject({ unlocked: false, progress: { value: 1, goal: 5 } })
  })

  it('counts the longest run of consecutive complete seasons, across years', () => {
    const run = ['2019-spring', '2019-summer', '2019-autumn', '2020-winter', '2020-spring', '2020-summer', '2020-autumn', '2021-winter']
    expect(byId(facts({ coverage: seasons(run) })).get('season-streak-8')?.unlocked).toBe(true)
    const broken = byId(facts({ coverage: seasons(run.filter((s) => s !== '2020-spring')) })).get('season-streak-8')
    expect(broken).toMatchObject({ unlocked: false, progress: { value: 4 } })
  })

  it('knows the current season and old seasons', () => {
    const now = new Date('2026-10-04T12:00:00')
    const t = byId(facts({ now, coverage: new Map<string, Coverage>([['2026-autumn', { answered: 12, total: 30 }], ['1985-spring', full]]) }))
    expect(t.get('season-current')).toMatchObject({ unlocked: false, progress: { value: 12, goal: 30 } })
    expect(t.get('season-old')?.unlocked).toBe(true)
    expect(byId(facts({ now, coverage: seasons(['2026-autumn']) })).get('season-current')?.unlocked).toBe(true)
  })

  it('counts complete years, and the three recent eras at half', () => {
    const years = [2016, 2017, 2018].flatMap((y) => ['winter', 'spring', 'summer', 'autumn'].map((n) => `${y}-${n}`))
    expect(byId(facts({ coverage: seasons(years) })).get('years-3')?.unlocked).toBe(true)
    const half: Coverage = { answered: 15, total: 30 }
    const eras = new Map<string, Coverage>([['2005-spring', half], ['2015-spring', half], ['2025-spring', { answered: 14, total: 30 }]])
    expect(byId(facts({ coverage: eras })).get('decade-three-eras')).toMatchObject({ unlocked: false, progress: { value: 2, goal: 3 } })
    eras.set('2025-spring', half)
    expect(byId(facts({ coverage: eras })).get('decade-three-eras')?.unlocked).toBe(true)
  })

  it('unlocks the new hidden titles from Annict and from moments in Anipair', () => {
    const t = byId(
      facts({
        now: new Date('2026-10-04T12:00:00'),
        stats: stats({ createdAt: '2015-01-10T00:00:00Z', watchedCount: 2000, wannaWatchCount: 1000, watchingCount: 20, followersCount: 1000, followingsCount: 100 }),
        watchedYears: [1965, 1975, 1985, 1995, 2005, 2015, 2025],
        feats: { earlyMorning: '2026-10-01T05:30:00Z', newYear: '2026-01-01T10:00:00Z' },
      }),
    )
    for (const id of ['hidden-watched-100', 'hidden-watched-2k', 'hidden-wanna-1k', 'hidden-watching', 'hidden-decade-friend', 'hidden-genesis', 'hidden-stars', 'hidden-bonds', 'hidden-dawn-era', 'hidden-all-eras', 'hidden-dawn-hour', 'hidden-new-year']) {
      expect(t.get(id)?.unlocked, id).toBe(true)
    }
  })
})

describe('special titles', () => {
  it('gives the creator title only to the Annict account of its creator', () => {
    expect(byId(facts({ stats: stats({ username: 'shimbaco' }) })).get('special-creator')).toMatchObject({ unlocked: true, group: 'special', rarity: 'origin' })
    expect(byId(facts({ stats: stats({ username: 'someone' }) })).get('special-creator')?.unlocked).toBe(false)
    expect(byId(facts({ stats: null })).get('special-creator')?.unlocked).toBe(false)
  })

  it('gives the supporter title only when the profile shows the supporter badge', () => {
    expect(byId(facts({ supporter: true })).get('special-supporter')).toMatchObject({ unlocked: true, group: 'special', rarity: 'patron' })
    expect(byId(facts({ supporter: false })).get('special-supporter')?.unlocked).toBe(false)
    expect(byId(facts({ supporter: null })).get('special-supporter')?.unlocked).toBe(false)
  })
})

describe('rarity', () => {
  it('gives every title a rarity, with the hardest ones at the top', () => {
    const t = byId(facts())
    for (const title of t.values()) expect(RARITIES).toContain(title.rarity)
    expect(t.get('season-full-1')?.rarity).toBe('bronze')
    expect(t.get('season-full-100')?.rarity).toBe('radiant')
    expect(t.get('hidden-records-10k')?.rarity).toBe('radiant')
    expect(t.get('hidden-wanna')?.rarity).toBe('crimson')
  })

  it('sorts from the lowest rarity to the highest', () => {
    const sorted = evaluateTitles(facts()).sort(byRarity).map((x) => x.rarity)
    expect(sorted[0]).toBe('bronze')
    expect(sorted[sorted.length - 1]).toBe('origin')
  })
})

describe('coverageOf', () => {
  it('counts answered works among each season’s popular works, and skips seasons with none', () => {
    const tops = new Map([
      ['2020-spring', [1, 2, 3, 4]],
      ['1970-winter', []],
    ])
    expect([...coverageOf(tops, new Set([2, 4, 99]))]).toEqual([['2020-spring', { answered: 2, total: 4 }]])
  })
})
