import { describe, expect, it } from 'vitest'
import type { AnnictWork, StatusState } from '../../lib/annict'
import { malIdsOf, pickQueue, toCards } from './queue'

function work(annictId: number, state: StatusState | null, extra: Partial<AnnictWork> = {}): AnnictWork {
  return {
    id: `W${annictId}`,
    annictId,
    title: `作品${annictId}`,
    media: 'TV',
    malAnimeId: String(annictId + 1000),
    watchersCount: 100,
    viewerStatusState: state,
    ogImageUrl: null,
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
  it('prefers the AniList cover, then the Annict image, then nothing', () => {
    const works = [
      work(1, null, { ogImageUrl: 'https://og.example/1.jpg' }),
      work(2, null, { ogImageUrl: 'https://og.example/2.jpg' }),
      work(3, null, { malAnimeId: null }),
    ]
    const covers = new Map([[1001, { url: 'https://anilist.example/1.jpg', color: '#112233' }]])
    expect(toCards(works, covers).map((c) => c.cover)).toEqual([
      { url: 'https://anilist.example/1.jpg', color: '#112233' },
      { url: 'https://og.example/2.jpg', color: null },
      null,
    ])
  })
})

it('malIdsOf skips works without a usable MyAnimeList ID', () => {
  const works = [work(1, null), work(2, null, { malAnimeId: null }), work(3, null, { malAnimeId: 'abc' })]
  expect(malIdsOf(works)).toEqual([1001])
})
