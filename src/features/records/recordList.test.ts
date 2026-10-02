import { describe, expect, it } from 'vitest'
import type { LibraryEntry, MyReview, RatingState, StatusState } from '../../lib/annict'
import { countBuckets, filterRows, formatDate, sortRows, type RecordRow } from './recordList'

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

  it('by recency: newest first, unknown dates last', () => {
    expect(sortRows(filterRows(rows, 'other', ''), 'recent').map((r) => r.entry.annictId)).toEqual([8, 7])
    expect(sortRows(filterRows(rows, 'watched', ''), 'recent').map((r) => r.entry.annictId)).toEqual([4, 3, 5, 1, 2])
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
