import { describe, expect, it } from 'vitest'
import { clampSeason, compareSeasons, parseSlug, previousSeason, seasonLabel, seasonOf, toSlug, yearsDescending, type Season } from './season'

describe('seasonOf', () => {
  it.each([
    [0, 'winter'], [2, 'winter'],
    [3, 'spring'], [5, 'spring'],
    [6, 'summer'], [8, 'summer'],
    [9, 'autumn'], [11, 'autumn'],
  ] as const)('month index %i is %s', (month, name) => {
    expect(seasonOf(new Date(2026, month, 15))).toEqual({ year: 2026, name })
  })
})

describe('previousSeason', () => {
  it('steps back within a year', () => {
    expect(previousSeason({ year: 2026, name: 'summer' })).toEqual({ year: 2026, name: 'spring' })
    expect(previousSeason({ year: 2026, name: 'autumn' })).toEqual({ year: 2026, name: 'summer' })
  })

  it('crosses from winter to the previous autumn', () => {
    expect(previousSeason({ year: 2026, name: 'winter' })).toEqual({ year: 2025, name: 'autumn' })
  })

  it('visits every season exactly once per year going back', () => {
    let s: Season = { year: 2026, name: 'autumn' }
    const seen: string[] = []
    for (let i = 0; i < 8; i++) {
      seen.push(toSlug(s))
      s = previousSeason(s)
    }
    expect(seen).toEqual([
      '2026-autumn', '2026-summer', '2026-spring', '2026-winter',
      '2025-autumn', '2025-summer', '2025-spring', '2025-winter',
    ])
  })
})

describe('parseSlug', () => {
  it('round-trips with toSlug', () => {
    const s: Season = { year: 1998, name: 'spring' }
    expect(parseSlug(toSlug(s))).toEqual(s)
  })

  it.each([null, 42, '', '2026', '2026-fall', '26-summer', '2026-summer ', { year: 2026 }])('rejects %j', (v) => {
    expect(parseSlug(v)).toBeNull()
  })
})

it('labels seasons in Japanese', () => {
  expect(seasonLabel({ year: 2023, name: 'autumn' })).toBe('2023年 秋')
})

describe('clampSeason', () => {
  const min: Season = { year: 1970, name: 'winter' }
  const max: Season = { year: 2026, name: 'autumn' }

  it('compares by year first, then by season order', () => {
    expect(compareSeasons({ year: 2025, name: 'autumn' }, { year: 2026, name: 'winter' })).toBeLessThan(0)
    expect(compareSeasons({ year: 2026, name: 'summer' }, { year: 2026, name: 'spring' })).toBeGreaterThan(0)
    expect(compareSeasons({ year: 2026, name: 'spring' }, { year: 2026, name: 'spring' })).toBe(0)
  })

  it('leaves a season inside the range as it is', () => {
    expect(clampSeason({ year: 2012, name: 'spring' }, min, max)).toEqual({ year: 2012, name: 'spring' })
    expect(clampSeason(min, min, max)).toEqual(min)
    expect(clampSeason(max, min, max)).toEqual(max)
  })

  it('pulls a later season back to the max, e.g. picking this year with a season that has not come yet', () => {
    const now: Season = { year: 2026, name: 'summer' }
    expect(clampSeason({ year: 2026, name: 'autumn' }, min, now)).toEqual(now)
    expect(clampSeason({ year: 2030, name: 'winter' }, min, now)).toEqual(now)
  })

  it('pulls an earlier season up to the min', () => {
    expect(clampSeason({ year: 1969, name: 'autumn' }, min, max)).toEqual(min)
  })
})

describe('yearsDescending', () => {
  it('lists years from the max down to the min, newest first', () => {
    expect(yearsDescending({ year: 2023, name: 'winter' }, { year: 2026, name: 'autumn' })).toEqual([2026, 2025, 2024, 2023])
  })

  it('is a single year when both ends share it', () => {
    expect(yearsDescending({ year: 2026, name: 'winter' }, { year: 2026, name: 'winter' })).toEqual([2026])
  })
})
