import { describe, expect, it } from 'vitest'
import type { LibraryEntry, MyReview, RatingState, StatusState, WorkCredits } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import type { RecordRow } from './recordList'
import {
  byYear,
  castAffinity,
  contrasts,
  formatShare,
  genreAxes,
  goldenPeriod,
  harshness,
  mainstream,
  monthlyPace,
  ratingCounts,
  seasonCounts,
  summarize,
  titleHead,
  topPeople,
} from './trends'

function row(id: number, state: StatusState, rating: RatingState | null, extra: Partial<LibraryEntry> = {}): RecordRow {
  const entry: LibraryEntry = { workId: `W${id}`, annictId: id, title: `作品${id}`, malAnimeId: String(id), state, stateAt: null, ...extra }
  const review: MyReview | null = rating
    ? { id: `R${id}`, body: '', createdAt: '', ratingOverallState: rating, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
    : null
  return { entry, review, cover: null }
}

function media(id: number, extra: Partial<Media> = {}): Media {
  return {
    idMal: id,
    title: { native: null, romaji: null, english: null },
    format: 'TV',
    status: null,
    isAdult: false,
    seasonYear: null,
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

describe('summarize and ratingCounts', () => {
  it('counts the buckets, the rated works and the completion rate', () => {
    const rows = [row(1, 'WATCHED', 'GREAT'), row(2, 'WATCHED', null), row(3, 'WATCHED', 'BAD'), row(4, 'STOP_WATCHING', 'AVERAGE'), row(5, 'WANNA_WATCH', null), row(6, 'WATCHING', null)]
    expect(summarize(rows)).toEqual({ watched: 3, watching: 1, wanna: 1, stopped: 1, rated: 3, completion: 0.75 })
    expect(ratingCounts(rows)).toEqual({ counts: { GREAT: 1, GOOD: 0, AVERAGE: 1, BAD: 1 }, unrated: 1 })
  })

  it('has no completion rate without watched or stopped works', () => {
    expect(summarize([row(1, 'WANNA_WATCH', null)]).completion).toBeNull()
  })
})

describe('harshness', () => {
  it('compares my ratings with the world score and needs at least five works', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row(i, 'WATCHED', 'GREAT'))
    const m = new Map([1, 2, 3, 4, 5].map((i) => [i, media(i, { score: 7 })]))
    // とても良い ≒ 9点、世間 7点 → +2 で甘口
    expect(harshness(rows, m)).toEqual({ diff: 2, n: 5, label: '世間より甘口' })
    expect(harshness(rows.slice(0, 4), m)).toBeNull()
    const harsh = [1, 2, 3, 4, 5].map((i) => row(i, 'WATCHED', 'AVERAGE'))
    expect(harshness(harsh, m)?.label).toBe('世間より辛口')
  })
})

describe('genreAxes', () => {
  it('takes the most watched genres and themes (two or more), with the average rating', () => {
    const rows = [row(1, 'WATCHED', 'GREAT'), row(2, 'WATCHED', 'BAD'), row(3, 'WATCHED', null), row(4, 'WANNA_WATCH', 'GREAT')]
    const m = new Map([
      [1, media(1, { genres: ['Drama', 'Romance'], themes: ['School'] })],
      [2, media(2, { genres: ['Drama'], themes: ['School'] })],
      [3, media(3, { genres: ['Drama', 'Romance'] })],
      [4, media(4, { genres: ['Romance'] })],
    ])
    expect(genreAxes(rows, m)).toEqual([
      { name: 'Drama', count: 3, average: 2.5 },
      { name: 'Romance', count: 2, average: 4 },
      { name: 'School', count: 2, average: 2.5 },
    ])
  })
})

describe('years', () => {
  const rows = [
    row(1, 'WATCHED', 'GREAT', { seasonYear: 2010 }),
    row(2, 'WATCHED', 'GREAT', { seasonYear: 2011 }),
    row(3, 'WATCHED', 'GOOD', { seasonYear: 2012 }),
    row(4, 'WATCHED', 'GREAT', { seasonYear: 2012 }),
    row(5, 'WATCHED', 'BAD', { seasonYear: 2014 }),
  ]

  it('lists every year from the oldest to the newest, with zero for empty years', () => {
    expect(byYear(rows).map((y) => [y.year, y.count])).toEqual([
      [2010, 1],
      [2011, 1],
      [2012, 2],
      [2013, 0],
      [2014, 1],
    ])
  })

  it('finds the best three years with at least four rated works', () => {
    expect(goldenPeriod(rows)).toEqual({ from: 2010, to: 2012, average: 3.75, n: 4 })
    expect(goldenPeriod(rows.slice(0, 3))).toBeNull()
  })
})

describe('formatShare and seasonCounts', () => {
  it('counts the watched works by format and season', () => {
    const rows = [row(1, 'WATCHED', null, { media: 'TV', seasonName: 'SPRING' }), row(2, 'WATCHED', null, { media: 'WEB', seasonName: 'SPRING' }), row(3, 'WANNA_WATCH', null, { media: 'TV' })]
    expect(formatShare(rows)).toEqual([
      { kind: 'tv', count: 1 },
      { kind: 'movie', count: 0 },
      { kind: 'ova', count: 1 },
      { kind: 'other', count: 0 },
    ])
    expect(seasonCounts(rows)).toEqual({ WINTER: 0, SPRING: 2, SUMMER: 0, AUTUMN: 0 })
  })
})

describe('contrasts', () => {
  it('finds hidden gems (I liked, the world scored low) and works I liked less than the world', () => {
    const rows = [row(1, 'WATCHED', 'GREAT'), row(2, 'WATCHED', 'GOOD'), row(3, 'WATCHED', 'AVERAGE'), row(4, 'WATCHED', 'GREAT')]
    const m = new Map([
      [1, media(1, { score: 6.2 })],
      [2, media(2, { score: 6.0 })],
      [3, media(3, { score: 8.9 })],
      [4, media(4, { score: 8.8 })],
    ])
    const c = contrasts(rows, m)
    expect(c.gems.map((x) => x.row.entry.annictId)).toEqual([1, 2])
    expect(c.overrated.map((x) => x.row.entry.annictId)).toEqual([3])
  })
})

describe('mainstream', () => {
  it('takes the median number of Annict watchers', () => {
    const rows = [100, 200, 300, 400, 500].map((n, i) => row(i, 'WATCHED', null, { watchersCount: n }))
    expect(mainstream(rows)).toEqual({ median: 300, label: '発掘派', n: 5 })
    const big = [9000, 10000, 12000, 20000, 30000].map((n, i) => row(i, 'WATCHED', null, { watchersCount: n }))
    expect(mainstream(big)?.label).toBe('王道派')
    expect(mainstream(rows.slice(0, 4))).toBeNull()
  })
})

describe('topPeople', () => {
  it('ranks voice actors, directors and studios that appear in two or more watched works', () => {
    const rows = [row(1, 'WATCHED', 'GREAT'), row(2, 'WATCHED', 'GOOD'), row(3, 'WATCHED', null), row(4, 'WANNA_WATCH', null)]
    const credits = new Map<string, WorkCredits>([
      ['W1', { casts: [{ annictId: 10, name: '声優A' }, { annictId: 11, name: '声優B' }], directors: [{ annictId: 20, name: '監督A' }] }],
      ['W2', { casts: [{ annictId: 10, name: '声優A' }], directors: [{ annictId: 20, name: '監督A' }] }],
      ['W3', { casts: [{ annictId: 10, name: '声優A' }, { annictId: 11, name: '声優B' }], directors: [] }],
      ['W4', { casts: [{ annictId: 11, name: '声優B' }], directors: [] }],
    ])
    const m = new Map([
      [1, media(1, { studios: ['ufotable'] })],
      [2, media(2, { studios: ['ufotable'] })],
    ])
    const p = topPeople(rows, credits, m)
    expect(p.casts).toEqual([
      { key: '10', name: '声優A', count: 3, average: 3.5 },
      { key: '11', name: '声優B', count: 2, average: 4 },
    ])
    expect(p.directors).toEqual([{ key: '20', name: '監督A', count: 2, average: 3.5 }])
    expect(p.studios).toEqual([{ key: 'ufotable', name: 'ufotable', count: 2, average: 3.5 }])
    expect(topPeople(rows, null, m).casts).toBeNull()
  })
})

describe('monthlyPace', () => {
  it('counts the works marked watched in each of the last twelve months', () => {
    const rows = [
      row(1, 'WATCHED', null, { stateAt: '2026-10-01T10:00:00Z' }),
      row(2, 'WATCHED', null, { stateAt: '2026-10-03T10:00:00Z' }),
      row(3, 'WATCHED', null, { stateAt: '2026-08-15T10:00:00Z' }),
      row(4, 'WATCHED', null, { stateAt: '2024-01-01T10:00:00Z' }),
    ]
    const pace = monthlyPace(rows, new Date(2026, 9, 5))
    expect(pace).toHaveLength(12)
    expect(pace[11]).toEqual({ label: '10月', count: 2 })
    expect(pace[9]).toEqual({ label: '8月', count: 1 })
    expect(pace[0].label).toBe('11月')
  })
})

describe('castAffinity', () => {
  // 世間はどれも 7.5 点。自分は 1〜4 が とても良い（+1.5）、5〜8 が 良い（±0）、9・10 が 普通（-1.5）。くせ（平均の差）は +0.3
  const ratings: RatingState[] = ['GREAT', 'GREAT', 'GREAT', 'GREAT', 'GOOD', 'GOOD', 'GOOD', 'GOOD', 'AVERAGE', 'AVERAGE']
  const rows = ratings.map((r, i) => row(i + 1, 'WATCHED', r))
  // 1 と 2 は同じシリーズ（2 の前作が 1）。9 と 10 も同じシリーズ
  const m = new Map(
    rows.map((_, i) => {
      const id = i + 1
      return [id, media(id, { score: 7.5, prequels: id === 2 ? [1] : [], related: id === 10 ? [{ kind: 'sequel', malId: 9 }] : [] })]
    }),
  )
  const cast = (id: number, name: string) => ({ annictId: id, name })
  const credits = new Map<string, WorkCredits>(
    rows.map((_, i) => {
      const id = i + 1
      const casts = [cast(1, 'どこにでも出る人')]
      // 隠れ推し: 1・2（同じシリーズ）と 3 → 2シリーズ
      if (id <= 3) casts.push(cast(2, '隠れ推し'))
      // シリーズの人: 9・10 だけ（1シリーズ）→ 出さない
      if (id >= 9) casts.push(cast(4, 'シリーズの人'))
      // 合わない人: 9 と 6（別シリーズ）。相方も同じ作品にだけ出ている → 1行にまとめる
      if (id === 9 || id === 6) casts.push(cast(5, '合わない人'), cast(6, '相方'))
      return [`W${id}`, { casts, directors: [] }]
    }),
  )

  it('ranks by how much higher than the world I rated their works, counting a series once', () => {
    const a = castAffinity(rows, credits, m)!
    // 隠れ推し: シリーズ(1,2) の平均 1.2 と 3 の 1.2 → 2.4 / (2 + 2) = 0.6
    expect(a.liked.map((x) => [x.name, Number(x.score.toFixed(2)), x.n, x.series])).toEqual([['隠れ推し', 0.6, 3, 2]])
    expect(a.liked[0].example).toEqual({ title: '作品1', rating: 'GREAT', world: 7.5 })
    // 合わない人と相方: (-1.8 + -0.3) / (2 + 2) = -0.525。シリーズの人は1シリーズだけなので出さない。全部に出る人は0に近い
    expect(a.unliked.map((x) => [x.name, Number(x.score.toFixed(3))])).toEqual([['合わない人・相方', -0.525]])
    expect(a.n).toBe(10)
  })

  it('needs five compared works to know the bias', () => {
    expect(castAffinity(rows.slice(0, 4), credits, m)).toBeNull()
  })
})

describe('titleHead', () => {
  it('joins split cours and films of the same title, but not different works', () => {
    expect(titleHead('グノーシア')).toBe(titleHead('グノーシア 第2クール'))
    expect(titleHead('劇場版 PSYCHO-PASS サイコパス')).toBe(titleHead('PSYCHO-PASS サイコパス 2'))
    expect(titleHead('僕のヒーローアカデミア')).not.toBe(titleHead('僕の心のヤバイやつ'))
  })
})
