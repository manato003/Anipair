import { describe, expect, it, vi } from 'vitest'
import type { BrowseWork } from '../../lib/annict'
import type { FindCondition, Media } from '../../lib/shikimori'
import { findPage, narrowOf } from './conditionSearch'

describe('narrowOf', () => {
  const ids = new Map([
    ['MAPPA', 569],
    ['Wit Studio', 858],
    ['Madhouse', 11],
    ['Bones', 4],
  ])

  it('turns genre and studio names into Shikimori ids, in order', () => {
    expect(narrowOf(['Fantasy', 'Action'], ['Wit Studio', 'MAPPA'], ids)).toEqual({ genres: [1, 10], studios: [569, 858] })
  })

  it('drops genres without an id but gives up when a studio has none (studios are “any of”) or too many are chosen', () => {
    expect(narrowOf(['Shounen', 'Action'], [], ids)).toEqual({ genres: [1], studios: [] })
    expect(narrowOf(['Shounen'], [], ids)).toBeNull()
    expect(narrowOf([], ['Unknown'], ids)).toBeNull()
    expect(narrowOf([], ['MAPPA', 'Wit Studio', 'Madhouse', 'Bones'], ids)).toBeNull()
    expect(narrowOf([], [], ids)).toBeNull()
  })
})

function media(idMal: number, popularity: number): Media {
  return { idMal, popularity, seasonYear: 2024, title: { native: null, romaji: null, english: null } } as Media
}

function work(mal: number): BrowseWork {
  return { id: `W${mal}`, annictId: mal + 1000, title: `作品${mal}`, media: 'TV', seasonYear: 2024, seasonName: 'SPRING', malAnimeId: String(mal), watchersCount: 1, viewerStatusState: null }
}

describe('findPage', () => {
  const period = { from: '2022-spring', to: '2026-autumn' }
  const link = { byIds: vi.fn(async () => []), resolve: vi.fn(async (_t: string, medias: readonly Media[]) => new Map(medias.filter((m) => m.idMal !== 3).map((m) => [m.idMal, work(m.idMal)]))), link: vi.fn() }

  it('asks once per studio and merges them by popularity, leaving out works not on Annict', async () => {
    const calls: FindCondition[] = []
    const find = vi.fn(async (c: FindCondition) => {
      calls.push(c)
      return c.studio === 569
        ? { medias: [media(1, 900), media(3, 500)], annict: new Map(), full: false }
        : { medias: [media(2, 700), media(1, 900)], annict: new Map(), full: true }
    })
    const page = await findPage('t', { genres: [10], studios: [569, 858] }, period, 'popularity', 1, { ...link, find })
    expect(calls.map((c) => c.studio)).toEqual([569, 858])
    expect(calls[0]).toMatchObject({ genres: [10], from: '2022-spring', to: '2026-autumn', order: 'popularity' })
    expect(page.works.map((w) => w.malAnimeId)).toEqual(['1', '2'])
    expect(page).toMatchObject({ hasNext: true, endCursor: '2', capped: false })
  })

  it('asks without a studio when only genres are chosen, and stops at the relay’s last page', async () => {
    const find = vi.fn(async () => ({ medias: [media(1, 1)], annict: new Map(), full: true }))
    const page = await findPage('t', { genres: [10], studios: [] }, period, 'aired_on', 4, { ...link, find })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ studio: null, order: 'aired_on' }), 4)
    expect(page).toMatchObject({ hasNext: false, endCursor: null, capped: true })
  })
})
