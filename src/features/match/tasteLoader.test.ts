// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AniMedia } from '../../lib/anilist'
import type { LibraryEntry, RatingState } from '../../lib/annict'

let library: LibraryEntry[] = []
let ratings = new Map<number, RatingState>()
let failNext = false

const media = (idMal: number): AniMedia => ({
  id: idMal,
  idMal,
  title: { native: null, romaji: null, english: null },
  format: 'TV',
  status: 'FINISHED',
  isAdult: false,
  seasonYear: 2020,
  genres: ['Music'],
  tags: [],
  studios: [],
  cover: null,
  prequels: [],
  recommendations: [],
})

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchLibrary: vi.fn(async () => {
    if (failNext) {
      failNext = false
      throw new Error('offline')
    }
    return library
  }),
  fetchMyRatings: vi.fn(async () => ratings),
}))
vi.mock('../../lib/anilist', () => ({
  fetchMediaByMal: vi.fn(async (ids: number[]) => new Map(ids.map((i) => [i, media(i)]))),
}))

const { loadTaste, forgetTaste, MAX_SEEDS } = await import('./tasteLoader')
const { fetchLibrary } = await import('../../lib/annict')
const { fetchMediaByMal } = await import('../../lib/anilist')

const entry = (annictId: number, state: LibraryEntry['state']): LibraryEntry => ({
  workId: `W${annictId}`,
  annictId,
  title: `作品${annictId}`,
  malAnimeId: String(annictId),
  state,
  stateAt: null,
})

beforeEach(() => {
  forgetTaste()
  failNext = false
  library = [entry(1, 'WATCHED'), entry(2, 'WATCHED'), entry(3, 'WANNA_WATCH')]
  ratings = new Map([
    [1, 'GREAT'],
    [2, 'BAD'],
  ])
  vi.mocked(fetchLibrary).mockClear()
  vi.mocked(fetchMediaByMal).mockClear()
})

describe('loadTaste', () => {
  it('builds seeds, the strongest ones first, the media for them, and a profile', async () => {
    const taste = await loadTaste('t')
    expect(taste.library).toBe(library)
    expect(taste.ratings).toBe(ratings)
    // 見たい（3）は手がかりにならない。重みの絶対値が大きい順（GREAT=2、BAD=-1.5）
    expect(taste.topSeeds.map((s) => s.malId)).toEqual([1, 2])
    expect([...taste.seedMedia.keys()]).toEqual([1, 2])
    expect(taste.profile.get('g:Music')).toBeCloseTo((2 - 1.5) / 3.5, 5)
  })

  it('keeps at most MAX_SEEDS seeds', async () => {
    library = Array.from({ length: MAX_SEEDS + 20 }, (_, i) => entry(i + 1, 'WATCHED'))
    ratings = new Map()
    expect((await loadTaste('t')).topSeeds).toHaveLength(MAX_SEEDS)
  })

  it('does not call AniList when nothing is liked yet', async () => {
    ratings = new Map([
      [1, 'BAD'],
      [2, 'BAD'],
    ])
    const taste = await loadTaste('t')
    expect(taste.seedMedia.size).toBe(0)
    expect(fetchMediaByMal).not.toHaveBeenCalled()
  })

  it('reuses what it read for the same token, and forgetTaste makes it read again', async () => {
    const first = loadTaste('t')
    expect(loadTaste('t')).toBe(first)
    await first
    expect(fetchLibrary).toHaveBeenCalledTimes(1)
    forgetTaste()
    await loadTaste('t')
    expect(fetchLibrary).toHaveBeenCalledTimes(2)
  })

  it('reads again for another token', async () => {
    await loadTaste('a')
    await loadTaste('b')
    expect(fetchLibrary).toHaveBeenCalledTimes(2)
  })

  it('drops a failed load so the next call tries again', async () => {
    failNext = true
    await expect(loadTaste('t')).rejects.toThrow('offline')
    await expect(loadTaste('t')).resolves.toMatchObject({ topSeeds: expect.any(Array) })
    expect(fetchLibrary).toHaveBeenCalledTimes(2)
  })

  it('reports its steps only when it actually loads', async () => {
    const steps: string[] = []
    await loadTaste('t', (s) => steps.push(s))
    expect(steps).toEqual(['Annict の記録を読んでいます', '好みを調べています'])
    const again: string[] = []
    await loadTaste('t', (s) => again.push(s))
    expect(again).toEqual([])
  })
})
