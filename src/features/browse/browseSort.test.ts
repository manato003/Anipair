import { describe, expect, it } from 'vitest'
import type { BrowseWork } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import { bayesScores, rankByTaste, reverseScored, sortByScore } from './browseSort'

function w(annictId: number, mal: number | null, watchers: number): BrowseWork {
  return {
    id: `W${annictId}`,
    annictId,
    title: `作品${annictId}`,
    media: 'TV',
    seasonYear: 2026,
    seasonName: 'SUMMER',
    malAnimeId: mal === null ? null : String(mal),
    watchersCount: watchers,
    viewerStatusState: null,
  }
}

it('orders by score, puts unscored works last, and breaks ties by watchers', () => {
  const works = [w(1, 101, 900), w(2, 102, 50), w(3, null, 5000), w(4, 104, 300), w(5, 105, 10), w(6, 106, 700), w(7, 107, 20)]
  const scores = new Map<number, number | null>([
    [101, 70],
    [102, 91],
    [104, 83],
    [105, null],
    [106, 83],
    // 107 は問い合わせても返ってこなかった
  ])
  expect(sortByScore(works, scores).map((x) => x.annictId)).toEqual([2, 6, 4, 1, 3, 7, 5])
})

it('pulls the score of a work rated by few people toward the average (Bayesian average), so a handful of high scores does not come first', () => {
  // 作品1: 9.0 を 30人、作品2: 8.6 を 5万人、作品3: 7.0 を 4万人、作品4: 6.0 を 3万人
  const works = [w(1, 101, 10), w(2, 102, 9000), w(3, 103, 8000), w(4, 104, 7000)]
  const scores = new Map<number, number | null>([
    [101, 9.0],
    [102, 8.6],
    [103, 7.0],
    [104, 6.0],
  ])
  const counts = new Map<number, number | null>([
    [101, 30],
    [102, 50000],
    [103, 40000],
    [104, 30000],
  ])
  expect(sortByScore(works, scores, counts).map((x) => x.annictId)).toEqual([2, 1, 3, 4])
  const bayes = bayesScores(works, scores, counts)
  // 大勢が付けた点数は、平均よりはっきり上に残る（k は一覧の人数の中央値なので、少しは平均に寄る）
  expect(bayes.get(2)).toBeGreaterThan(80)
  // 数人だけの 9.0 は、一覧の平均（76.5）の近くまで寄る
  expect(bayes.get(1)).toBeLessThan(77)
  // 人数が分からなければ、今までどおり点数の高い順
  expect(sortByScore(works, scores).map((x) => x.annictId)).toEqual([1, 2, 3, 4])
})

it('does not change the input array', () => {
  const works = [w(1, 101, 1), w(2, 102, 2)]
  sortByScore(works, new Map([[102, 90]]))
  expect(works.map((x) => x.annictId)).toEqual([1, 2])
})

describe('rankByTaste', () => {
  function media(idMal: number, genres: string[]): Media {
    return {
      idMal,
      title: { native: `作品${idMal}`, romaji: null, english: null },
      format: 'TV',
      status: 'FINISHED',
      isAdult: false,
      seasonYear: 2026,
      genres,
      themes: [],
      demographics: [],
      studios: [],
      cover: null,
      score: null,
      prequels: [],
      related: [],
    }
  }

  // 好きな作品 1 に似た作品は 102（1位）と 103（2位）。ジャンルは Music が好き、Horror が苦手
  const taste = {
    similarSeeds: [{ malId: 1, title: '好きな作品', weight: 2 }],
    similar: new Map([[1, [102, 103]]]),
    profile: new Map([
      ['g:Music', 0.9],
      ['g:Horror', -0.7],
    ]),
  }
  const details = new Map([
    [101, media(101, ['Music'])],
    [102, media(102, ['Music'])],
    [103, media(103, [])],
    [106, media(106, ['Horror'])],
  ])
  // 作品 4 は MAL の ID が無い、作品 5 は Shikimori に情報が無い
  const works = [w(1, 101, 10), w(2, 102, 20), w(3, 103, 30), w(4, null, 40), w(5, 105, 50), w(6, 106, 60)]

  it('orders like the wanna list, and puts works without a score last in their original order', () => {
    const { works: ordered } = rankByTaste(works, details, taste)
    expect(ordered.map((x) => x.annictId)).toEqual([2, 3, 1, 6, 4, 5])
  })

  it('gives the reason of each scored work, and none to the others', () => {
    const { reasons } = rankByTaste(works, details, taste)
    expect(reasons.get(2)).toContain('『好きな作品』が好きな人のおすすめ')
    expect(reasons.get(3)).toContain('『好きな作品』')
    expect(reasons.get(1)).toContain('好きなジャンル')
    // 苦手なジャンルだけの作品・情報の無い作品には出さない
    expect([...reasons.keys()].sort()).toEqual([1, 2, 3])
  })

  it('keeps every work, does not change the input, and survives an empty season', () => {
    const copy = [...works]
    expect(rankByTaste(works, details, taste).works).toHaveLength(works.length)
    expect(works).toEqual(copy)
    expect(rankByTaste([], new Map(), taste)).toEqual({ works: [], reasons: new Map(), scored: new Set() })
  })

  it('leaves the original order when nothing has data', () => {
    expect(rankByTaste(works, new Map(), taste).works.map((x) => x.annictId)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('reverseScored', () => {
  it('reverses only the scored ones and keeps the unscored ones last, in either direction', () => {
    expect(reverseScored([1, 2, 3, 9, 8], (n) => n < 5)).toEqual([3, 2, 1, 9, 8])
  })
})
