import { describe, expect, it } from 'vitest'
import type { LibraryEntry, RatingState, StatusState } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import { SERIES_BONUS, SERIES_LIMIT, SIMILAR_RANK_DECAY, addSeries, seriesBonus, buildProfile, buildSeeds, collectPool, contentScore, explain, features, genreName, rankCandidates, seedWeight, seenMalIds, type Seed } from './taste'

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

function entry(annictId: number, state: StatusState, malAnimeId: string | null = String(annictId)): LibraryEntry {
  return { workId: `W${annictId}`, annictId, title: `作品${annictId}`, malAnimeId, state, stateAt: null }
}

describe('seedWeight', () => {
  it.each<[StatusState, RatingState | undefined, number]>([
    ['WATCHED', 'GREAT', 2],
    ['WATCHED', 'GOOD', 1],
    ['WATCHED', 'AVERAGE', 0],
    ['WATCHED', 'BAD', -1.5],
    ['WATCHED', undefined, 0.5],
    ['WATCHING', undefined, 0.5],
    ['STOP_WATCHING', undefined, -1],
    ['STOP_WATCHING', 'GREAT', -1],
    ['WANNA_WATCH', undefined, 0],
    ['ON_HOLD', undefined, 0],
  ])('%s with %s weighs %d', (state, rating, w) => {
    expect(seedWeight(state, rating)).toBe(w)
  })
})

describe('buildSeeds / seenMalIds', () => {
  const library = [
    entry(1, 'WATCHED'),
    entry(2, 'WATCHED'),
    entry(3, 'WANNA_WATCH'),
    entry(4, 'WATCHED', null),
    entry(5, 'STOP_WATCHING'),
    entry(6, 'WATCHED'),
  ]
  const ratings = new Map<number, RatingState>([
    [1, 'GREAT'],
    [2, 'AVERAGE'],
    [4, 'GREAT'],
    [6, 'BAD'],
  ])

  it('skips zero-weight records and works without a MyAnimeList ID', () => {
    expect(buildSeeds(library, ratings).map((s) => [s.malId, s.weight])).toEqual([
      [1, 2],
      [5, -1],
      [6, -1.5],
    ])
  })

  it('counts everything except want-to-watch as seen', () => {
    expect([...seenMalIds(library)].sort((a, b) => a - b)).toEqual([1, 2, 5, 6])
  })
})

describe('features', () => {
  it('puts genres and themes at weight 1, demographics at half, studios at 0.8 (Shikimori has no relevance numbers)', () => {
    const f = features(media(1, { genres: ['Drama'], themes: ['Iyashikei'], demographics: ['Seinen'], studios: ['Madhouse'] }))
    expect([...f]).toEqual([
      ['g:Drama', 1],
      ['t:Iyashikei', 1],
      ['d:Seinen', 0.5],
      ['s:Madhouse', 0.8],
    ])
  })
})

describe('features: Award Winning', () => {
  it('is not a taste signal and is left out', () => {
    expect([...features(media(1, { themes: ['Award Winning', 'Isekai'] })).keys()]).toEqual(['t:Isekai'])
  })
})

describe('buildProfile', () => {
  it('adds features weighted by rating and normalises by the total weight', () => {
    const seeds: Seed[] = [
      { malId: 1, title: 'A', weight: 2 },
      { malId: 2, title: 'B', weight: -1 },
    ]
    const m = new Map([
      [1, media(1, { genres: ['Music'], themes: ['Iyashikei'], studios: ['KyoAni'] })],
      [2, media(2, { genres: ['Music', 'Horror'] })],
    ])
    const p = buildProfile(seeds, m)
    expect(p.get('g:Music')).toBeCloseTo((2 - 1) / 3)
    expect(p.get('g:Horror')).toBeCloseTo(-1 / 3)
    expect(p.get('t:Iyashikei')).toBeCloseTo(2 / 3)
    expect(p.get('s:KyoAni')).toBeCloseTo((2 * 0.8) / 3)
  })

  it('skips seeds whose information could not be read', () => {
    const p = buildProfile([{ malId: 9, title: 'X', weight: 2 }], new Map())
    expect(p.size).toBe(0)
  })
})

describe('collectPool', () => {
  const seeds: Seed[] = [
    { malId: 1, title: '好き', weight: 2 },
    { malId: 2, title: 'まあ好き', weight: 0.5 },
    { malId: 3, title: '苦手', weight: -1.5 },
  ]
  // 似た作品は似ている順。位置が下がるほど弱く効く
  const similar = new Map<number, number[]>([
    [1, [10, 11, 99]],
    [2, [11, 12]],
    [3, [12, 10]],
  ])
  const at = (rank: number) => 1 / (1 + rank * SIMILAR_RANK_DECAY)

  it('weights by position in the list, subtracts those from disliked works, and drops excluded works', () => {
    const pool = collectPool(seeds, similar, new Set([99]))
    const score = (id: number) => pool.find((p) => p.malId === id)?.recScore
    expect(score(10)).toBeCloseTo(2 * at(0) - 1.5 * at(1))
    expect(score(11)).toBeCloseTo(2 * at(1) + 0.5 * at(0))
    // 苦手な作品に似ている分が強いので落ちる
    expect(score(12)).toBeUndefined()
    expect(pool.map((p) => p.malId)).toEqual([11, 10])
    expect(pool[0].from.map((s) => s.title)).toEqual(['好き', 'まあ好き'])
  })

  it('does not suggest the seed itself, and skips seeds with no list', () => {
    const pool = collectPool([{ malId: 1, title: 'A', weight: 1 }, { malId: 7, title: 'B', weight: 1 }], new Map([[1, [1, 2]]]), new Set())
    expect(pool.map((p) => p.malId)).toEqual([2])
  })

  it('gives the top of a list the full weight and a far-down place much less', () => {
    expect(at(0)).toBe(1)
    expect(at(39)).toBeCloseTo(0.146, 3)
    const pool = collectPool([{ malId: 1, title: 'A', weight: 1 }], new Map([[1, Array.from({ length: 41 }, (_, i) => i + 100)]]), new Set())
    expect(pool[0].malId).toBe(100)
    expect(pool.at(-1)?.malId).toBe(140)
  })
})

describe('rankCandidates', () => {
  const profile = new Map([
    ['g:Music', 0.9],
    ['g:Horror', -0.7],
  ])
  const pool = [10, 11, 12, 13, 14, 15, 16, 17].map((malId) => ({ malId, recScore: 3, from: [] }))
  const details = new Map([
    [10, media(10, { genres: ['Horror'] })],
    [11, media(11, { genres: ['Music'] })],
    [12, media(12, { isAdult: true, genres: ['Music'] })],
    [13, media(13, { status: 'NOT_YET_RELEASED', genres: ['Music'] })],
    [14, media(14, { format: 'MUSIC', genres: ['Music'] })],
    [15, media(15, { prequels: [500], genres: ['Music'] })],
    [16, media(16, { prequels: [501], genres: ['Music'] })],
    // 17 は情報が取れなかった
  ])

  it('filters out adult, unreleased, music videos, unknown works and sequels of unseen works', () => {
    const ranked = rankCandidates(pool, details, profile, new Set([501]))
    expect(ranked.map((c) => c.media.idMal).sort((a, b) => a - b)).toEqual([10, 11, 16])
  })

  it('orders equal recommendations by how well they match the profile', () => {
    const ranked = rankCandidates(pool, details, profile, new Set([501]))
    expect(ranked.map((c) => c.media.idMal)).toEqual([11, 16, 10])
  })

  it('lets a strong recommendation outrank a better content match when the work is neutral to the profile', () => {
    const d2 = new Map([...details, [18, media(18, { genres: ['Adventure'] })]])
    const p2 = [
      { malId: 18, recScore: 9, from: [] },
      { malId: 11, recScore: 1, from: [] },
    ]
    expect(rankCandidates(p2, d2, profile, new Set()).map((c) => c.media.idMal)).toEqual([18, 11])
  })

  it('pushes a disliked genre down even when it is strongly recommended', () => {
    const p2 = [
      { malId: 10, recScore: 9, from: [] },
      { malId: 11, recScore: 1, from: [] },
    ]
    expect(rankCandidates(p2, details, profile, new Set()).map((c) => c.media.idMal)).toEqual([11, 10])
  })

  it('marks sequels of seen works in the reasons', () => {
    const ranked = rankCandidates(pool, details, profile, new Set([501]))
    expect(ranked.find((c) => c.media.idMal === 16)?.reasons).toContain('前作を見ています')
  })
})

describe('contentScore', () => {
  it('is zero for a work with no features', () => {
    expect(contentScore(media(1), new Map([['g:Music', 1]]))).toBe(0)
  })
})

describe('explain', () => {
  it('names the two most liked seeds, liked genres in Japanese, and a liked studio', () => {
    const m = media(1, { genres: ['Horror', 'Slice of Life', 'Music', 'Drama'], themes: ['Iyashikei', 'Gore', 'Isekai', 'Mystery Box'], studios: ['Kyoto Animation', 'Other'] })
    const profile = new Map([
      ['g:Music', 0.4],
      ['g:Slice of Life', 0.9],
      ['g:Horror', -0.5],
      ['g:Drama', 0.1],
      ['t:Iyashikei', 0.7],
      ['t:Mystery Box', 0.6],
      ['t:Isekai', 0.3],
      ['t:Gore', -0.2],
      ['s:Kyoto Animation', 0.5],
      ['s:Other', 0.1],
    ])
    const from: Seed[] = [
      { malId: 2, title: 'まあ好き', weight: 0.5 },
      { malId: 3, title: '最高', weight: 2 },
      { malId: 4, title: '好き', weight: 1 },
    ]
    expect(explain(m, { malId: 1, recScore: 1, from }, profile, false)).toEqual([
      '『最高』『好き』が好きな人のおすすめ',
      '好きなジャンル: 日常・音楽',
      // テーマは上位2つ。日本語の名前が無いものは英語のまま
      '好きなテーマ: 癒し系・Mystery Box',
      '好きな制作会社: Kyoto Animation',
    ])
  })

  it('leaves out the genre and theme lines when none is liked', () => {
    const m = media(1, { genres: ['Horror'], themes: ['Gore'] })
    const profile = new Map([
      ['g:Horror', -0.5],
      ['t:Gore', -0.2],
    ])
    expect(explain(m, { malId: 1, recScore: 1, from: [] }, profile, false)).toEqual([])
  })
})

describe('genreName', () => {
  it('translates the Shikimori genres, themes and demographics, and leaves unknown names as they are', () => {
    expect(genreName('Slice of Life')).toBe('日常')
    expect(genreName('Award Winning')).toBe('受賞作')
    expect(genreName('Seinen')).toBe('青年向け')
    expect(genreName('Brand New Theme')).toBe('Brand New Theme')
  })
})

describe('addSeries (#36: the series of anime you liked comes first)', () => {
  const great: Seed = { malId: 1, title: '好きな作品', weight: 2 }
  const good: Seed = { malId: 2, title: 'まあ好き', weight: 1 }
  const bad: Seed = { malId: 3, title: '苦手', weight: -1.5 }
  const seedMedia = new Map([
    [1, media(1, { related: [{ kind: 'sequel', malId: 11 }, { kind: 'side_story', malId: 12 }, { kind: 'summary', malId: 13 }, { kind: 'adaptation', malId: 14 }, { kind: 'sequel', malId: 15 }, { kind: 'parent_story', malId: 16 }, { kind: 'spin_off', malId: 17 }] })],
    [2, media(2, { related: [{ kind: 'sequel', malId: 11 }, { kind: 'prequel', malId: 21 }] })],
    [3, media(3, { related: [{ kind: 'sequel', malId: 31 }] })],
  ])

  it('adds sequels, prequels and side stories of liked anime, but not the franchise root (parent_story), spin-offs, summaries, adaptations, disliked anime or excluded ones', () => {
    const out = addSeries([], [great, good, bad], seedMedia, new Set([15]))
    expect(out.map((e) => e.malId).sort((a, b) => a - b)).toEqual([11, 12, 21])
    // 2つの好きな作品のシリーズなら、評価の高い方を理由にする
    expect(out.find((e) => e.malId === 11)?.series).toBe(great)
    expect(out.find((e) => e.malId === 21)?.series).toBe(good)
  })

  it('marks a candidate already in the pool instead of adding it twice', () => {
    const out = addSeries([{ malId: 11, recScore: 3, from: [good] }], [great], seedMedia, new Set())
    const e = out.filter((x) => x.malId === 11)
    expect(e).toHaveLength(1)
    expect(e[0].recScore).toBe(3)
    expect(e[0].series).toBe(great)
  })

  it('adds at most SERIES_LIMIT new candidates', () => {
    const many = new Map([[1, media(1, { related: Array.from({ length: SERIES_LIMIT + 5 }, (_, i) => ({ kind: 'side_story', malId: 100 + i })) })]])
    expect(addSeries([], [great], many, new Set())).toHaveLength(SERIES_LIMIT)
  })

  it('ranks the sequel of a much-liked anime above an otherwise equal candidate, and says why first', () => {
    const pool = addSeries([{ malId: 50, recScore: 1, from: [great] }, { malId: 11, recScore: 1, from: [great] }], [great], seedMedia, new Set())
    const details = new Map([
      [50, media(50)],
      [11, media(11, { prequels: [1] })],
    ])
    const ranked = rankCandidates(pool, details, new Map(), new Set([1]))
    expect(ranked.map((c) => c.media.idMal)).toEqual([11, 50])
    expect(ranked[0].score - ranked[1].score).toBeCloseTo(SERIES_BONUS)
    expect(ranked[0].reasons[0]).toBe('好きな『好きな作品』のシリーズ作品')
    // 「前作を見ています」は、シリーズの理由と重ねない
    expect(ranked[0].reasons).not.toContain('前作を見ています')
  })

  it('gives side stories a smaller boost, and none to very short ones', () => {
    const side = { malId: 12, recScore: 0, from: [], series: great, seriesKind: 'side_story' }
    expect(seriesBonus(side, media(12, { duration: 24 }))).toBeCloseTo(SERIES_BONUS * 0.35)
    expect(seriesBonus(side, media(12, { duration: 3 }))).toBe(0)
    expect(seriesBonus({ ...side, seriesKind: 'sequel' }, media(12, { duration: 3 }))).toBeCloseTo(SERIES_BONUS)
    // 良い（重み 1）の作品の続編は半分
    expect(seriesBonus({ ...side, series: good, seriesKind: 'sequel' }, media(12))).toBeCloseTo(SERIES_BONUS / 2)
  })
})
