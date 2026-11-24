import { describe, expect, it } from 'vitest'
import type { Media } from '../../lib/shikimori'
import { courDiscovery } from './discovery'

const media = (idMal: number, studios: string[], genres: string[]): Media => ({
  idMal,
  title: { native: null, romaji: null, english: null },
  format: 'TV',
  status: 'FINISHED',
  isAdult: false,
  seasonYear: 2026,
  genres,
  themes: [],
  demographics: [],
  studios,
  cover: null,
  score: null,
  prequels: [],
  related: [],
})

describe('courDiscovery: one finding for the cleared-season screen', () => {
  it('prefers a studio that made 3 or more of the anime watched', () => {
    const list = [media(1, ['MAPPA'], ['Action']), media(2, ['MAPPA'], ['Action']), media(3, ['MAPPA', 'MAPPA'], ['Drama']), media(4, ['Bones'], ['Action'])]
    expect(courDiscovery(list)).toEqual({ kind: 'studio', name: 'MAPPA', count: 3 })
  })

  it('falls back to a genre when no studio reaches 3, and picks by name on a tie', () => {
    const list = [media(1, ['A'], ['Fantasy', 'Action']), media(2, ['B'], ['Fantasy', 'Action']), media(3, ['C'], ['Fantasy', 'Action'])]
    expect(courDiscovery(list)).toEqual({ kind: 'genre', name: 'Action', count: 3 })
  })

  it('finds nothing when nothing repeats 3 times', () => {
    expect(courDiscovery([media(1, ['A'], ['X']), media(2, ['A'], ['X'])])).toBeNull()
    expect(courDiscovery([])).toBeNull()
  })
})
