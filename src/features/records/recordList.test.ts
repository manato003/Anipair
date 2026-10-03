import { describe, expect, it } from 'vitest'
import type { LibraryEntry, MyReview, RatingState, StatusState } from '../../lib/annict'
import { STATE_OPTIONS, countBuckets, filterRows, formatDate, optionState, sortRows, type RecordRow } from './recordList'

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
    expect(sortRows(filterRows(rows, 'other', ''), 'recent').map((r) => r.entry.annictId)).toEqual([8, 7])
    expect(sortRows(filterRows(rows, 'watched', ''), 'recent').map((r) => r.entry.annictId)).toEqual([4, 3, 5, 1, 2])
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
    expect(sortRows(list, 'recent').map((r) => r.entry.annictId)).toEqual([5, 3, 6, 2, 1, 4])
  })

  it('by rating: within the same rating, newest broadcast season first', () => {
    const r1 = row(1, 'WATCHED', 'GOOD', '2026-10-01T00:00:00Z')
    const r2 = row(2, 'WATCHED', 'GOOD', '2020-01-01T00:00:00Z')
    const list = [{ ...r1, entry: { ...r1.entry, seasonYear: 2001, seasonName: 'SPRING' } }, { ...r2, entry: { ...r2.entry, seasonYear: 2023, seasonName: 'SPRING' } }]
    expect(sortRows(list, 'rating').map((r) => r.entry.annictId)).toEqual([2, 1])
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
