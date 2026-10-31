import { describe, expect, it } from 'vitest'
import type { Media } from '../../lib/shikimori'
import { likedOf, pendingOf, pickMatch, ratingCounts, sharedGenres, tierRowsOf, topGenre, usableMedia } from './demo'
import { DEMO_IDS, DEMO_QUEUE, DEMO_SAMPLE, DEMO_SHELVES, type DemoAnswer } from './demoWorks'

function media(id: number, over: Partial<Media> = {}): Media {
  return {
    idMal: id,
    title: { native: `作品${id}`, romaji: `Work ${id}`, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2023,
    genres: [],
    themes: [],
    demographics: [],
    studios: [],
    cover: { url: `o${id}`, thumb: `m${id}`, landscape: false },
    score: null,
    prequels: [],
    related: [],
    ...over,
  }
}

const answersOf = (pairs: [number, DemoAnswer][]) => new Map(pairs)

describe('demo works', () => {
  // 手で選んだ並び（30〜40）。棚は3段、同じ作品を2回入れない。カードとおまかせの作品は棚の中から
  it('has 30 to 40 anime on three shelves, without duplicates, and the queue comes from the shelves', () => {
    expect(DEMO_SHELVES).toHaveLength(3)
    expect(DEMO_IDS.length).toBeGreaterThanOrEqual(30)
    expect(DEMO_IDS.length).toBeLessThanOrEqual(40)
    expect(new Set(DEMO_IDS).size).toBe(DEMO_IDS.length)
    for (const id of [...DEMO_QUEUE, ...DEMO_SAMPLE.keys()]) expect(DEMO_IDS).toContain(id)
    for (const id of DEMO_SAMPLE.keys()) expect(DEMO_QUEUE).toContain(id)
  })
})

describe('usableMedia', () => {
  it('needs a Japanese title and a poster, and no adult anime', () => {
    expect(usableMedia(media(1))).toBe(true)
    expect(usableMedia(undefined)).toBe(false)
    expect(usableMedia(media(1, { title: { native: null, romaji: 'x', english: null } }))).toBe(false)
    expect(usableMedia(media(1, { cover: null }))).toBe(false)
    expect(usableMedia(media(1, { isAdult: true }))).toBe(false)
  })
})

describe('pendingOf', () => {
  const all = () => true
  it('puts the anime picked on a shelf first, and skips answered and unusable anime', () => {
    expect(pendingOf([1, 2, 3, 4], answersOf([[2, 'GOOD']]), null, all)).toEqual([1, 3, 4])
    expect(pendingOf([1, 2, 3], new Map(), 9, all)).toEqual([9, 1, 2, 3])
    expect(pendingOf([1, 2, 3], new Map(), 2, all)).toEqual([2, 1, 3])
    expect(pendingOf([1, 2, 3], new Map(), null, (id) => id !== 1)).toEqual([2, 3])
  })

  // 答えた作品を棚から選び直したら、答え直せるように先頭に出す
  it('shows an answered anime again when picked on a shelf', () => {
    expect(pendingOf([1, 2], answersOf([[1, 'BAD']]), 1, all)).toEqual([1, 2])
  })
})

describe('likedOf', () => {
  it('lists Great first, then Good, each in the order answered', () => {
    const answers = answersOf([
      [1, 'GOOD'],
      [2, 'GREAT'],
      [3, 'AVERAGE'],
      [4, 'GREAT'],
      [5, 'WANNA'],
    ])
    expect(likedOf([1, 2, 3, 4, 5], answers)).toEqual([2, 4, 1])
  })
})

describe('pickMatch', () => {
  const pool = new Map([1, 2, 10, 11, 12, 20].map((id) => [id, media(id)]))

  it('asks for the similar anime of the first liked anime that has none yet', () => {
    expect(pickMatch([1, 2], new Map(), pool, new Set())).toEqual({ kind: 'need', basis: 1 })
    expect(pickMatch([], new Map(), pool, new Set())).toEqual({ kind: 'none' })
  })

  it('picks the first similar anime not answered or decided, and moves on to the next liked anime', () => {
    const similar = new Map([
      [1, [10, 11]],
      [2, [20]],
    ])
    expect(pickMatch([1, 2], similar, pool, new Set())).toEqual({ kind: 'pick', id: 10, basis: 1 })
    expect(pickMatch([1, 2], similar, pool, new Set([10]))).toEqual({ kind: 'pick', id: 11, basis: 1 })
    expect(pickMatch([1, 2], similar, pool, new Set([10, 11]))).toEqual({ kind: 'pick', id: 20, basis: 2 })
    expect(pickMatch([1, 2], similar, pool, new Set([10, 11, 20]))).toEqual({ kind: 'none' })
  })

  // 同じシリーズ（続編・前作）は、似た作品にあっても出さない
  it('skips anime in the same series as the basis', () => {
    const withSeries = new Map(pool)
    withSeries.set(1, media(1, { related: [{ kind: 'sequel', malId: 10 }] }))
    withSeries.set(11, media(11, { related: [{ kind: 'prequel', malId: 1 }] }))
    expect(pickMatch([1], new Map([[1, [10, 11, 12]]]), withSeries, new Set())).toEqual({ kind: 'pick', id: 12, basis: 1 })
  })
})

describe('sharedGenres', () => {
  it('shows the genres shared with the basis, or the anime’s own when none are shared', () => {
    const pick = media(10, { genres: ['Action', 'Comedy'], themes: ['School'] })
    expect(sharedGenres(pick, media(1, { genres: ['Comedy'], themes: ['School'] }))).toEqual(['Comedy', 'School'])
    expect(sharedGenres(pick, media(1, { genres: ['Drama'] }))).toEqual(['Action', 'Comedy', 'School'])
  })
})

describe('tierRowsOf', () => {
  it('places rated anime by rating, keeps moved anime where they were moved, and leaves out unrated answers', () => {
    const answers = answersOf([
      [1, 'GREAT'],
      [2, 'BAD'],
      [3, 'NONE'],
      [4, 'GOOD'],
      [5, 'GREAT'],
    ])
    expect(tierRowsOf([1, 2, 3, 4, 5], answers, new Map())).toEqual([[1, 5], [4], [], [2], []])
    expect(tierRowsOf([1, 2, 3, 4, 5], answers, new Map([[1, 4]]))).toEqual([[5], [4], [], [2], [1]])
  })
})

describe('ratingCounts and topGenre', () => {
  it('counts each rating and finds the genre most common among liked anime', () => {
    const counts = ratingCounts(answersOf([
      [1, 'GREAT'],
      [2, 'GREAT'],
      [3, 'BAD'],
      [4, 'SKIP'],
    ]))
    expect([...counts]).toEqual([
      ['GREAT', 2],
      ['GOOD', 0],
      ['AVERAGE', 0],
      ['BAD', 1],
    ])
    const m = new Map([
      [1, media(1, { genres: ['Drama', 'Fantasy'] })],
      [2, media(2, { genres: ['Fantasy'] })],
    ])
    expect(topGenre([1, 2], m)).toBe('Fantasy')
    expect(topGenre([], m)).toBeNull()
  })
})
