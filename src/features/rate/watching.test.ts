import { describe, expect, it } from 'vitest'
import type { LibraryEntry } from '../../lib/annict'
import type { Cover } from '../../lib/storage'
import { pickWatching, toWatchCards } from './watching'

const entry = (annictId: number, state: LibraryEntry['state'], stateAt: string | null, malAnimeId: string | null = String(100 + annictId)): LibraryEntry => ({
  workId: `W${annictId}`,
  annictId,
  title: `作品${annictId}`,
  malAnimeId,
  state,
  stateAt,
})

describe('pickWatching', () => {
  it('keeps only works being watched, oldest start first, unknown dates last', () => {
    const library = [
      entry(1, 'WATCHING', '2026-09-01T00:00:00Z'),
      entry(2, 'WATCHED', '2026-01-01T00:00:00Z'),
      entry(3, 'WATCHING', '2026-07-01T00:00:00Z'),
      entry(4, 'WATCHING', null),
      entry(5, 'ON_HOLD', '2026-02-01T00:00:00Z'),
      entry(6, 'WATCHING', '2026-08-01T00:00:00Z'),
    ]
    expect(pickWatching(library).map((e) => e.annictId)).toEqual([3, 6, 1, 4])
  })

  it('does not change the order of works with unknown dates among themselves', () => {
    expect(pickWatching([entry(1, 'WATCHING', null), entry(2, 'WATCHING', null)]).map((e) => e.annictId)).toEqual([1, 2])
  })
})

describe('covers', () => {
  it('matches covers by the Annict id and tolerates works without one', () => {
    const cover: Cover = { url: 'https://img.example/1.jpg', thumb: 'https://img.example/1-s.jpg', landscape: true }
    const entries = [entry(1, 'WATCHING', null), entry(2, 'WATCHING', null, null)]
    expect(toWatchCards(entries, new Map([[1, cover]])).map((c) => c.cover)).toEqual([cover, null])
  })
})
