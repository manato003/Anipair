// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { allSeasonSlugs, isLateNight, isStale, loadFeats, loadSeasonTops, parseSeasonTops, parseTitlesState, recordFeat, recordTimeFeats, rememberSeasonTop } from './achievementStore'

afterEach(() => localStorage.clear())

const DAY = 24 * 60 * 60 * 1000

describe('season tops', () => {
  it('keeps only well-formed entries', () => {
    const tops = parseSeasonTops({ '2020-spring': { at: 1, ids: [1, 2] }, bad: { at: 1, ids: [1] }, '2020-summer': { at: 'x', ids: [] }, '2020-autumn': { at: 1, ids: [1.5] } })
    expect([...tops.keys()]).toEqual(['2020-spring'])
    expect(parseSeasonTops(null).size).toBe(0)
  })

  it('remembers the list a deck loaded', () => {
    rememberSeasonTop('2026-autumn', [5, 6], 100)
    expect(loadSeasonTops().get('2026-autumn')).toEqual({ at: 100, ids: [5, 6] })
  })

  it('re-reads recent seasons after 7 days and older ones after 90 days', () => {
    const now = new Date('2026-10-04T00:00:00')
    const at = (days: number) => ({ at: now.getTime() - days * DAY, ids: [1] })
    expect(isStale('2026-summer', undefined, now)).toBe(true)
    expect(isStale('2026-summer', at(6), now)).toBe(false)
    expect(isStale('2025-summer', at(8), now)).toBe(true)
    expect(isStale('2010-summer', at(30), now)).toBe(false)
    expect(isStale('2010-summer', at(91), now)).toBe(true)
  })

  it('counts every season from the oldest to the current one', () => {
    const slugs = allSeasonSlugs(new Date('2026-10-04T00:00:00'))
    expect(slugs[0]).toBe('1970-winter')
    expect(slugs[slugs.length - 1]).toBe('2026-autumn')
    expect(slugs).toHaveLength((2026 - 1970) * 4 + 4)
  })
})

describe('titles state and feats', () => {
  it('falls back to a fresh state for broken values', () => {
    expect(parseTitlesState('x')).toEqual({ equipped: null, seen: [], awakened: false })
    expect(parseTitlesState({ equipped: 'a', seen: ['b', 3], awakened: true })).toEqual({ equipped: 'a', seen: ['b'], awakened: true })
  })

  it('records a feat only the first time', () => {
    recordFeat('lateNight', new Date('2026-10-01T02:30:00Z'))
    recordFeat('lateNight', new Date('2026-10-02T02:30:00Z'))
    expect(loadFeats()).toEqual({ lateNight: '2026-10-01T02:30:00.000Z' })
  })

  it('records the time-of-day moments: late night, early morning and New Year\u2019s Day', () => {
    recordTimeFeats(new Date('2026-01-01T05:30:00'))
    expect(Object.keys(loadFeats()).sort()).toEqual(['earlyMorning', 'newYear'])
    recordTimeFeats(new Date('2026-03-01T12:00:00'))
    expect(Object.keys(loadFeats())).toHaveLength(2)
    recordTimeFeats(new Date('2026-03-01T02:10:00'))
    expect(loadFeats().lateNight).toBeTruthy()
  })

  it('treats 2:00 to 3:59 as late night', () => {
    expect(isLateNight(new Date('2026-10-04T01:59:00'))).toBe(false)
    expect(isLateNight(new Date('2026-10-04T02:00:00'))).toBe(true)
    expect(isLateNight(new Date('2026-10-04T03:59:00'))).toBe(true)
    expect(isLateNight(new Date('2026-10-04T04:00:00'))).toBe(false)
  })
})
