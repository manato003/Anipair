// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { askableWatching, markStillWatching, snoozedWatching, stillAiring, unmarkStillWatching } from './stillWatching'

// 2026年秋（10〜12月）の途中
const NOW = new Date(2026, 9, 20, 12).getTime()
const NEXT_COUR = new Date(2027, 0, 5, 12).getTime()

afterEach(() => localStorage.clear())

describe('when a watching work is asked "finished?"', () => {
  it('not while its cour is airing (or yet to come), but after it ends; unknown cours are asked', () => {
    expect(stillAiring({ seasonYear: 2026, seasonName: 'AUTUMN' }, NOW)).toBe(true)
    expect(stillAiring({ seasonYear: 2027, seasonName: 'WINTER' }, NOW)).toBe(true)
    expect(stillAiring({ seasonYear: 2026, seasonName: 'SUMMER' }, NOW)).toBe(false)
    expect(stillAiring({ seasonYear: null, seasonName: null }, NOW)).toBe(false)
    expect(stillAiring({ seasonYear: 2026, seasonName: 'AUTUMN' }, NEXT_COUR)).toBe(false)
  })

  it('"still watching" keeps it out until the cour it was answered in ends', () => {
    markStillWatching(1, NOW)
    expect(snoozedWatching(NOW + 30 * 24 * 60 * 60 * 1000).has(1)).toBe(true)
    expect(snoozedWatching(NEXT_COUR).has(1)).toBe(false)
  })

  it('forgets an answer that was undone, and drops answers from past cours when saving', () => {
    markStillWatching(1, NOW)
    markStillWatching(2, NOW)
    unmarkStillWatching(1, NOW)
    expect([...snoozedWatching(NOW)]).toEqual([2])
    markStillWatching(3, NEXT_COUR)
    expect(Object.keys(JSON.parse(localStorage.getItem('animax.stillWatching.v1')!))).toEqual(['3'])
  })

  it('keeps only the works to ask', () => {
    markStillWatching(3, NOW)
    const works = [
      { annictId: 1, seasonYear: 2026, seasonName: 'AUTUMN' },
      { annictId: 2, seasonYear: 2026, seasonName: 'SPRING' },
      { annictId: 3, seasonYear: 2025, seasonName: 'WINTER' },
      { annictId: 4, seasonYear: null, seasonName: null },
    ]
    expect(askableWatching(works, NOW).map((w) => w.annictId)).toEqual([2, 4])
  })

  it('ignores broken data, survives logging in again, and is put aside when someone else signs in', async () => {
    localStorage.setItem('animax.stillWatching.v1', JSON.stringify({ x: 1, 3: 'no' }))
    expect(snoozedWatching(NOW).size).toBe(0)
    const { saveAnnictToken, switchAccount } = await import('../../lib/storage')
    switchAccount('u1')
    saveAnnictToken('a')
    markStillWatching(1, NOW)
    // 同じ人がログインし直した（新しいトークン）
    saveAnnictToken('b')
    expect(snoozedWatching(NOW).has(1)).toBe(true)
    // 別の人
    switchAccount('u2', 'b')
    expect(localStorage.getItem('animax.stillWatching.v1')).toBeNull()
  })
})
