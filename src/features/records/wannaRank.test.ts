import { describe, expect, it } from 'vitest'
import type { Media } from '../../lib/shikimori'
import { collectPool, type Seed } from '../match/taste'
import { orderByScore, scoreWanna } from './wannaRank'

function media(idMal: number, extra: Partial<Media> = {}): Media {
  return {
    idMal,
    title: { native: `作品${idMal}`, romaji: null, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2020,
    genres: [],
    themes: [],
    demographics: [],
    studios: [],
    cover: null,
    score: null,
    prequels: [],
    related: [],
    ...extra,
  }
}

const seed: Seed = { malId: 1, title: '好きな作品', weight: 2 }
const profile = new Map([
  ['g:Music', 0.9],
  ['g:Horror', -0.7],
])

describe('scoreWanna', () => {
  // 好きな作品 1 に似た作品は 10 と 12 だけ。11 は似た作品に無い。12 は続編（前作は未視聴）、13 は成人向け、14 は劇場版
  const similar = new Map([[1, [10, 12]]])
  const details = new Map([
    [10, media(10, { genres: ['Music'] })],
    [11, media(11, { genres: ['Music'] })],
    [12, media(12, { genres: ['Horror'], prequels: [999] })],
    [13, media(13, { isAdult: true, genres: ['Music'] })],
    [14, media(14, { format: 'MOVIE', genres: ['Music'] })],
  ])
  const pool = collectPool([seed], similar, new Set())

  it('scores every wanna work that has data, without dropping sequels, adult works or other formats', () => {
    const scores = scoreWanna([10, 11, 12, 13, 14, 15], details, pool, profile)
    expect([...scores.keys()].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14])
  })

  it('uses the same formula as the matching: similarity strength plus 0.6 of the content match', () => {
    const scores = scoreWanna([10, 11], details, pool, profile)
    // 10 は似ている度合いも中身も最大 → 1 + 0.6。11 は似た作品の一覧に無い（0）ので中身の分だけ
    expect(scores.get(10)!.score).toBeCloseTo(1.6, 5)
    expect(scores.get(11)!.score).toBeCloseTo(0.6, 5)
  })

  it('a disliked genre pulls the score down even when the work is among the similar ones', () => {
    const scores = scoreWanna([10, 12], details, pool, profile)
    expect(scores.get(12)!.score).toBeLessThan(scores.get(11)?.score ?? 0.6)
    expect(scores.get(10)!.score).toBeGreaterThan(scores.get(12)!.score)
  })

  it('gives the first explanation as the reason, or null when there is none', () => {
    const scores = scoreWanna([10, 14], details, pool, profile)
    expect(scores.get(10)!.reason).toBe('『好きな作品』が好きな人のおすすめ')
    expect(scores.get(14)!.reason).toBe('好きなジャンル: 音楽')
    const none = scoreWanna([11], new Map([[11, media(11)]]), [], new Map())
    expect(none.get(11)!.reason).toBeNull()
  })

  it('only counts the similar-work list for the wanna works themselves', () => {
    // 似た作品に 10 と 12 があるが、見たいのは 11 だけ
    const scores = scoreWanna([11], details, pool, profile)
    expect([...scores.keys()]).toEqual([11])
    expect(scores.get(11)!.score).toBeCloseTo(0.6, 5)
  })
})

describe('orderByScore', () => {
  const items = [
    { id: 'a', mal: 1 },
    { id: 'b', mal: null },
    { id: 'c', mal: 2 },
    { id: 'd', mal: 3 },
    { id: 'e', mal: 4 },
  ]
  const scores = new Map([
    [1, { score: 0.5, reason: null }],
    [2, { score: 1.2, reason: null }],
    [4, { score: 0.5, reason: null }],
  ])

  it('orders by score, ties keep the given order, and works without a score go last in the given order', () => {
    expect(orderByScore(items, (x) => x.mal, scores).map((x) => x.id)).toEqual(['c', 'a', 'e', 'b', 'd'])
  })

  it('keeps the given order when nothing has a score', () => {
    expect(orderByScore(items, (x) => x.mal, new Map()).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
