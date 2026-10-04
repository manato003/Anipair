import { describe, expect, it } from 'vitest'
import type { AnnictWork, StatusState } from '../../lib/annict'
import type { Cover } from '../../lib/storage'
import { pickQueue, toCards } from './queue'

function work(annictId: number, state: StatusState | null, extra: Partial<AnnictWork> = {}): AnnictWork {
  return {
    id: `W${annictId}`,
    annictId,
    title: `作品${annictId}`,
    media: 'TV',
    malAnimeId: String(annictId + 1000),
    watchersCount: 100,
    viewerStatusState: state,
    imageUrl: null,
    ...extra,
  }
}

describe('pickQueue', () => {
  it('keeps only works with no status that were not skipped, in the original order', () => {
    const works = [
      work(1, 'NO_STATE'),
      work(2, 'WATCHED'),
      work(3, null),
      work(4, 'WANNA_WATCH'),
      work(5, 'NO_STATE'),
      work(6, 'STOP_WATCHING'),
      work(7, 'NO_STATE'),
    ]
    expect(pickQueue(works, new Set([5])).map((w) => w.annictId)).toEqual([1, 3, 7])
  })
})

describe('toCards', () => {
  it('puts the cover decided in lib/covers (keyed by the Annict id) on each card, or nothing', () => {
    const works = [work(1, null), work(2, null), work(3, null, { malAnimeId: null })]
    const cover: Cover = { url: 'https://img.example/1.jpg', thumb: 'https://img.example/1-s.jpg', landscape: false }
    expect(toCards(works, new Map([[2, cover]])).map((c) => c.cover)).toEqual([null, cover, null])
  })
})
