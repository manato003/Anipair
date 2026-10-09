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
  related: [],
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
}))
// 感想の共有の控え。評価だけを持つ偽物の感想で返す
vi.mock('../../lib/myReviews', () => ({
  refreshMyReviews: vi.fn(async () => new Map([...ratings].map(([id, r]) => [id, { id: `R${id}`, body: '', createdAt: '', ratingOverallState: r }]))),
}))
vi.mock('../../lib/shikimori', () => ({
  fetchMedia: vi.fn(async (ids: number[]) => new Map(ids.map((i) => [i, media(i)]))),
  // 似た作品は、作品 N に対して N+100, N+200 を返す偽物
  isSimilarCached: vi.fn(() => false),
  fetchSimilarMany: vi.fn(async (ids: number[], onProgress?: (done: number, total: number) => void) => {
    ids.forEach((_id, i) => onProgress?.(i + 1, ids.length))
    return new Map(ids.map((i) => [i, [i + 100, i + 200]]))
  }),
}))

const { loadTaste, forgetTaste, prefetchTaste, resetPrefetchedTaste, pickSimilarSeeds, MAX_SEEDS, LONG_WAIT_NOTE, LONG_WAIT_UNCACHED } = await import('./tasteLoader')
const { fetchLibrary } = await import('../../lib/annict')
const { fetchMedia, fetchSimilarMany, isSimilarCached } = await import('../../lib/shikimori')
const { refreshMyReviews } = await import('../../lib/myReviews')

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
  resetPrefetchedTaste()
  failNext = false
  library = [entry(1, 'WATCHED'), entry(2, 'WATCHED'), entry(3, 'WANNA_WATCH')]
  ratings = new Map([
    [1, 'GREAT'],
    [2, 'BAD'],
  ])
  vi.mocked(fetchLibrary).mockClear()
  vi.mocked(fetchMedia).mockClear()
  vi.mocked(fetchSimilarMany).mockClear()
  vi.mocked(refreshMyReviews).mockClear()
})

describe('loadTaste', () => {
  it('builds seeds, the strongest ones first, the media for them, and a profile', async () => {
    const taste = await loadTaste('t')
    expect(taste.library).toBe(library)
    expect(taste.ratings).toEqual(ratings)
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

  it('looks up similar works for every liked and disliked seed (even beyond the top seeds), liked first and the strongest first', async () => {
    library = Array.from({ length: MAX_SEEDS + 40 }, (_, i) => entry(i + 1, 'WATCHED'))
    // 1〜20 はとても良い、21〜40 は良い、41〜60 は良くない、そのあとは評価なしの見た（好き 0.5）
    ratings = new Map(library.slice(0, 60).map((e) => [e.annictId, e.annictId <= 20 ? 'GREAT' : e.annictId <= 40 ? 'GOOD' : 'BAD']))
    const taste = await loadTaste('t')
    const ids = taste.similarSeeds.map((s) => s.malId)
    expect(ids).toHaveLength(MAX_SEEDS + 40)
    expect(ids.slice(0, 20).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(ids.slice(-20).every((id) => id > 40 && id <= 60)).toBe(true)
    expect(fetchSimilarMany).toHaveBeenCalledTimes(1)
  })

  it('adds a note about the wait only when many similar lists are not on the device yet', async () => {
    library = Array.from({ length: LONG_WAIT_UNCACHED + 5 }, (_, i) => entry(i + 1, 'WATCHED'))
    ratings = new Map()
    const notes: (string | undefined)[] = []
    await loadTaste('t', (_step, note) => notes.push(note))
    expect(notes.at(-1)).toBe(LONG_WAIT_NOTE)

    forgetTaste()
    vi.mocked(isSimilarCached).mockImplementation((id) => id > 10)
    const later: (string | undefined)[] = []
    await loadTaste('t', (_step, note) => later.push(note))
    expect(later.every((n) => n === undefined)).toBe(true)
    vi.mocked(isSimilarCached).mockImplementation(() => false)
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
    expect(steps).toEqual(['Annict の記録を読み込み中', '好みを分析しています', '似た作品を検索中（1/2）', '似た作品を検索中（2/2）'])
    const again: string[] = []
    await loadTaste('t', (s) => again.push(s))
    expect(again).toEqual([])
  })
})

describe('loadTaste and the shared reviews', () => {
  it('reads the ratings from the shared reviews with an incremental refresh (not a full walk)', async () => {
    await loadTaste('t')
    expect(refreshMyReviews).toHaveBeenCalledTimes(1)
    expect(refreshMyReviews).toHaveBeenCalledWith('t')
  })

  it('asks Shikimori with the default (foreground) priority', async () => {
    await loadTaste('t')
    expect(fetchMedia).toHaveBeenCalledWith([1, 2], {})
    expect(vi.mocked(fetchSimilarMany).mock.calls[0][2]).toEqual({})
  })
})

describe('prefetchTaste', () => {
  it('runs the same steps with Shikimori in background priority', async () => {
    await prefetchTaste('t')
    expect(fetchLibrary).toHaveBeenCalledTimes(1)
    expect(refreshMyReviews).toHaveBeenCalledWith('t')
    expect(fetchMedia).toHaveBeenCalledWith([1, 2], { background: true })
    expect(fetchSimilarMany).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchSimilarMany).mock.calls[0][0]).toEqual([1, 2])
    expect(vi.mocked(fetchSimilarMany).mock.calls[0][2]).toEqual({ background: true })
  })

  it('does not fill the shared taste cache (a later loadTaste reads fresh)', async () => {
    await prefetchTaste('t')
    ratings = new Map([
      [1, 'GREAT'],
      [2, 'GREAT'],
    ])
    const taste = await loadTaste('t')
    expect(fetchLibrary).toHaveBeenCalledTimes(2)
    expect(taste.ratings.get(2)).toBe('GREAT')
  })

  it('runs once per token in a session, even when it failed', async () => {
    failNext = true
    await expect(prefetchTaste('t')).resolves.toBeUndefined()
    await prefetchTaste('t')
    expect(fetchLibrary).toHaveBeenCalledTimes(1)
    await prefetchTaste('other')
    expect(fetchLibrary).toHaveBeenCalledTimes(2)
  })

  it('swallows errors', async () => {
    failNext = true
    await expect(prefetchTaste('t')).resolves.toBeUndefined()
  })

  it('does nothing when the taste for this token is already loaded or loading', async () => {
    const loading = loadTaste('t')
    await prefetchTaste('t')
    await loading
    expect(fetchLibrary).toHaveBeenCalledTimes(1)
  })
})

describe('pickSimilarSeeds', () => {
  it('takes every liked seed (strongest first) and then every disliked one, without the zero-weight ones', () => {
    const seeds = [
      ...Array.from({ length: 40 }, (_, i) => ({ malId: i + 1, title: `L${i}`, weight: 1 + (i % 2) })),
      ...Array.from({ length: 12 }, (_, i) => ({ malId: 100 + i, title: `D${i}`, weight: -1 })),
      { malId: 500, title: 'zero', weight: 0 },
    ]
    const picked = pickSimilarSeeds(seeds)
    expect(picked.filter((s) => s.weight > 0)).toHaveLength(40)
    expect(picked.filter((s) => s.weight < 0)).toHaveLength(12)
    expect(picked.some((s) => s.weight === 0)).toBe(false)
    expect(picked.slice(0, 20).every((s) => s.weight === 2)).toBe(true)
    expect(picked.findIndex((s) => s.weight < 0)).toBe(40)
  })
})
