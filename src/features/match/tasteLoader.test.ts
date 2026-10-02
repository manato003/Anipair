// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, RatingState } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'

let library: LibraryEntry[] = []
let ratings = new Map<number, RatingState>()
let failNext = false

const media = (idMal: number): Media => ({
  idMal,
  title: { native: null, romaji: null, english: null },
  format: 'TV',
  status: 'FINISHED',
  isAdult: false,
  seasonYear: 2020,
  genres: ['Music'],
  themes: [],
  demographics: [],
  studios: [],
  cover: null,
  score: null,
  prequels: [],
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
vi.mock('../../lib/shikimori', () => ({
  fetchMedia: vi.fn(async (ids: number[]) => new Map(ids.map((i) => [i, media(i)]))),
  // 似た作品は、作品 N に対して N+100, N+200 を返す偽物
  fetchSimilarMany: vi.fn(async (ids: number[], onProgress?: (done: number, total: number) => void) => {
    ids.forEach((_id, i) => onProgress?.(i + 1, ids.length))
    return new Map(ids.map((i) => [i, [i + 100, i + 200]]))
  }),
}))

const { loadTaste, forgetTaste, pickSimilarSeeds, MAX_SEEDS, MAX_SIMILAR_LIKED, MAX_SIMILAR_DISLIKED } = await import('./tasteLoader')
const { fetchLibrary } = await import('../../lib/annict')
const { fetchMedia, fetchSimilarMany } = await import('../../lib/shikimori')

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
  vi.mocked(fetchMedia).mockClear()
  vi.mocked(fetchSimilarMany).mockClear()
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
    // 似た作品は、好きな作品と苦手な作品の両方について集める（好きな方が先）
    expect(taste.similarSeeds.map((s) => s.malId)).toEqual([1, 2])
    expect([...taste.similar.entries()]).toEqual([
      [1, [101, 201]],
      [2, [102, 202]],
    ])
  })

  it('looks up similar works for at most 32 liked and 8 disliked seeds, the strongest first', async () => {
    library = Array.from({ length: 60 }, (_, i) => entry(i + 1, 'WATCHED'))
    // 1〜40 は好き（GREAT=2 が先、そのあと GOOD=1）、41〜60 は苦手
    ratings = new Map(library.map((e) => [e.annictId, e.annictId <= 20 ? 'GREAT' : e.annictId <= 40 ? 'GOOD' : 'BAD']))
    const taste = await loadTaste('t')
    const ids = taste.similarSeeds.map((s) => s.malId)
    expect(ids).toHaveLength(MAX_SIMILAR_LIKED + MAX_SIMILAR_DISLIKED)
    expect(ids.slice(0, 20).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(ids.slice(0, MAX_SIMILAR_LIKED).every((id) => id <= 40)).toBe(true)
    expect(ids.slice(MAX_SIMILAR_LIKED).every((id) => id > 40)).toBe(true)
    expect(fetchSimilarMany).toHaveBeenCalledTimes(1)
  })

  it('keeps at most MAX_SEEDS seeds', async () => {
    library = Array.from({ length: MAX_SEEDS + 20 }, (_, i) => entry(i + 1, 'WATCHED'))
    ratings = new Map()
    expect((await loadTaste('t')).topSeeds).toHaveLength(MAX_SEEDS)
  })

  it('does not call Shikimori when nothing is liked yet', async () => {
    ratings = new Map([
      [1, 'BAD'],
      [2, 'BAD'],
    ])
    const taste = await loadTaste('t')
    expect(taste.seedMedia.size).toBe(0)
    expect(taste.similarSeeds).toEqual([])
    expect(fetchMedia).not.toHaveBeenCalled()
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
    expect(steps).toEqual(['Annict の記録を読んでいます', '好みを調べています', '似た作品を調べています（1/2）', '似た作品を調べています（2/2）'])
    const again: string[] = []
    await loadTaste('t', (s) => again.push(s))
    expect(again).toEqual([])
  })
})

describe('pickSimilarSeeds', () => {
  it('takes the strongest liked seeds and a few disliked ones, liked first', () => {
    const seeds = [
      ...Array.from({ length: 40 }, (_, i) => ({ malId: i + 1, title: `L${i}`, weight: 1 + (i % 2) })),
      ...Array.from({ length: 12 }, (_, i) => ({ malId: 100 + i, title: `D${i}`, weight: -1 })),
      { malId: 500, title: 'zero', weight: 0 },
    ]
    const picked = pickSimilarSeeds(seeds)
    expect(picked.filter((s) => s.weight > 0)).toHaveLength(32)
    expect(picked.filter((s) => s.weight < 0)).toHaveLength(8)
    expect(picked.some((s) => s.weight === 0)).toBe(false)
    // 重み 2 の作品（20件）は全部入る
    expect(picked.filter((s) => s.weight === 2)).toHaveLength(20)
    expect(picked.findIndex((s) => s.weight < 0)).toBe(32)
  })
})
