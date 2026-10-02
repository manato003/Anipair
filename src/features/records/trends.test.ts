import { describe, expect, it } from 'vitest'
import type { LibraryEntry, RatingState, StatusState } from '../../lib/annict'
import { genreName } from '../match/taste'
import { ratingDistribution, topTrends } from './trends'

const entry = (annictId: number, state: StatusState): LibraryEntry => ({ workId: `W${annictId}`, annictId, title: `作品${annictId}`, malAnimeId: null, state, stateAt: null })

describe('ratingDistribution', () => {
  it('counts each rating, and watched works without a rating separately', () => {
    const library = [entry(1, 'WATCHED'), entry(2, 'WATCHED'), entry(3, 'WATCHED'), entry(4, 'WATCHED'), entry(5, 'WATCHED'), entry(6, 'WATCHED'), entry(7, 'WANNA_WATCH')]
    const ratings = new Map<number, RatingState>([
      [1, 'GREAT'],
      [2, 'GREAT'],
      [3, 'GOOD'],
      [4, 'BAD'],
    ])
    expect(ratingDistribution(library, ratings)).toEqual({
      ratings: { GREAT: 2, GOOD: 1, AVERAGE: 0, BAD: 1 },
      watchedUnrated: 2,
      rated: 4,
    })
  })

  it('counts a rating on a work that is not "watched" (e.g. rated while watching), but not one that left the library', () => {
    const library = [entry(1, 'WATCHING')]
    const ratings = new Map<number, RatingState>([
      [1, 'GOOD'],
      [99, 'GREAT'],
    ])
    const d = ratingDistribution(library, ratings)
    expect(d.ratings.GOOD).toBe(1)
    expect(d.ratings.GREAT).toBe(0)
    expect(d.watchedUnrated).toBe(0)
  })

  it('is all zeros for an empty library', () => {
    expect(ratingDistribution([], new Map())).toEqual({ ratings: { GREAT: 0, GOOD: 0, AVERAGE: 0, BAD: 0 }, watchedUnrated: 0, rated: 0 })
  })
})

describe('topTrends', () => {
  const profile = new Map<string, number>([
    ['g:Fantasy', 0.9],
    ['g:Music', 0.5],
    ['g:Drama', 0.3],
    ['g:Action', 0.2],
    ['g:Comedy', 0.1],
    ['g:Romance', 0.05],
    ['g:Horror', -0.8],
    ['g:Ecchi', -0.4],
    ['g:Sports', -0.2],
    ['g:Mecha', -0.1],
    ['g:Mystery', 0],
    ['t:Isekai', 0.7],
    ['t:Gore', -0.6],
    ['s:Bones', 0.8],
    ['s:Madhouse', 0.4],
    ['s:Trigger', -0.5],
  ])
  const t = topTrends(profile)

  it('takes the top 5 liked genres by weight, leaving out the disliked and the neutral', () => {
    expect(t.genres.map((g) => g.name)).toEqual(['Fantasy', 'Music', 'Drama', 'Action', 'Comedy'])
  })

  it('takes the top 3 disliked genres, most negative first, and only themes/genres that are actually negative', () => {
    expect(t.dislikedGenres.map((g) => g.name)).toEqual(['Horror', 'Ecchi', 'Sports'])
    expect(t.dislikedThemes.map((g) => g.name)).toEqual(['Gore'])
  })

  it('keeps themes and studios apart from genres, and lists liked ones only', () => {
    expect(t.themes.map((x) => x.name)).toEqual(['Isekai'])
    expect(t.studios.map((x) => x.name)).toEqual(['Bones', 'Madhouse'])
  })

  it('limits themes to 8', () => {
    const many = new Map(Array.from({ length: 12 }, (_, i) => [`t:Theme${String(i).padStart(2, '0')}`, 1 - i / 100] as const))
    expect(topTrends(many).themes).toHaveLength(8)
  })

  it('has nothing to show for an empty profile, and orders ties by name so the list does not shuffle', () => {
    const e = topTrends(new Map())
    expect(e).toEqual({ genres: [], themes: [], studios: [], dislikedGenres: [], dislikedThemes: [] })
    const ties = topTrends(new Map([['g:B', 1], ['g:A', 1]]))
    expect(ties.genres.map((g) => g.name)).toEqual(['A', 'B'])
  })
})

describe('names', () => {
  it('uses Japanese for known genres and themes, and the English name otherwise', () => {
    expect(genreName('Fantasy')).toBe('ファンタジー')
    expect(genreName('Unknown Genre')).toBe('Unknown Genre')
    expect(genreName('Isekai')).toBe('異世界')
    expect(genreName('Rare Theme')).toBe('Rare Theme')
  })
})
