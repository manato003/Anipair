// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from './shikimori'

const mediaWithPoster = (id: number): Media => ({
  idMal: id,
  title: { native: null, romaji: null, english: null },
  format: 'TV',
  status: 'FINISHED',
  isAdult: false,
  seasonYear: null,
  genres: [],
  themes: [],
  demographics: [],
  studios: [],
  cover: { url: `https://s.example/${id}.jpg`, thumb: `https://s.example/${id}-m.webp`, landscape: false },
  score: null,
  prequels: [],
  related: [],
})

let shikiFails = false
vi.mock('./shikimori', () => ({
  fetchMedia: vi.fn(async (ids: number[]) => {
    if (shikiFails) throw new Error('offline')
    // 100 番台だけポスターがある
    return new Map(ids.filter((i) => i >= 100 && i < 200).map((i) => [i, mediaWithPoster(i)]))
  }),
}))

const { annictImageOf, fetchCovers, quickCovers } = await import('./covers')
const { fetchMedia } = await import('./shikimori')

beforeEach(() => {
  localStorage.clear()
  shikiFails = false
  vi.mocked(fetchMedia).mockClear()
})

describe('annictImageOf', () => {
  it('takes recommendedImageUrl, then facebookOgImageUrl, https only', () => {
    expect(annictImageOf({ recommendedImageUrl: 'https://a.example/r.jpg', facebookOgImageUrl: 'https://a.example/o.jpg' })).toBe('https://a.example/r.jpg')
    expect(annictImageOf({ recommendedImageUrl: '', facebookOgImageUrl: 'https://a.example/o.jpg' })).toBe('https://a.example/o.jpg')
    expect(annictImageOf({ recommendedImageUrl: 'http://a.example/r.jpg', facebookOgImageUrl: 'https://a.example/o.jpg' })).toBe('https://a.example/o.jpg')
    expect(annictImageOf({ recommendedImageUrl: null, facebookOgImageUrl: 'http://a.example/o.jpg' })).toBeNull()
    expect(annictImageOf(null)).toBeNull()
  })
})

describe('fetchCovers: the Shikimori poster first, the Annict (official site) image as the fallback', () => {
  const src = (annictId: number, mal: number | null, imageUrl: string | null = null) => ({ annictId, malAnimeId: mal === null ? null : String(mal), imageUrl })

  it('uses the poster when there is one, even if Annict has an image', async () => {
    const got = await fetchCovers([src(1, 101, 'https://og.example/1.jpg')])
    expect(got.get(1)).toEqual({ url: 'https://s.example/101.jpg', thumb: 'https://s.example/101-m.webp', landscape: false })
  })

  it('falls back to the Annict image (marked landscape) when Shikimori has no poster', async () => {
    const got = await fetchCovers([src(2, 300, 'https://og.example/2.jpg')])
    expect(got.get(2)).toEqual({ url: 'https://og.example/2.jpg', thumb: 'https://og.example/2.jpg', landscape: true })
  })

  it('falls back to the Annict image for a work without a MyAnimeList id, and gives nothing when there is no image either', async () => {
    const got = await fetchCovers([src(3, null, 'https://og.example/3.jpg'), src(4, null), src(5, 300)])
    expect(got.get(3)?.landscape).toBe(true)
    expect(got.has(4)).toBe(false)
    expect(got.has(5)).toBe(false)
  })

  it('keeps going with the Annict images when Shikimori cannot be reached', async () => {
    shikiFails = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const got = await fetchCovers([src(1, 101, 'https://og.example/1.jpg'), src(2, 102)])
    expect(got.get(1)?.landscape).toBe(true)
    expect(got.has(2)).toBe(false)
    warn.mockRestore()
  })

  it('keeps the posters on this device, and asks only for the works it has not seen', async () => {
    await fetchCovers([src(1, 101), src(2, 102)])
    expect(JSON.parse(localStorage.getItem('animax.covers.v2')!)['101'].o).toBe('https://s.example/101.jpg')
    vi.mocked(fetchMedia).mockClear()
    const got = await fetchCovers([src(1, 101), src(3, 103)])
    expect(vi.mocked(fetchMedia).mock.calls[0][0]).toEqual([103])
    expect(got.size).toBe(2)
  })

  it('does not ask Shikimori when everything is already kept', async () => {
    await fetchCovers([src(1, 101)])
    vi.mocked(fetchMedia).mockClear()
    await fetchCovers([src(1, 101)])
    expect(fetchMedia).not.toHaveBeenCalled()
  })

  it('removes the previous version of the cover cache (it held another source)', async () => {
    localStorage.setItem('animax.covers.v1', '{"1":{"url":"https://old.example/1.jpg","color":null}}')
    await fetchCovers([src(1, 101)])
    expect(localStorage.getItem('animax.covers.v1')).toBeNull()
  })
})

describe('quickCovers (no network)', () => {
  it('uses the posters kept on this device, then the Annict image', () => {
    localStorage.setItem('animax.covers.v2', JSON.stringify({ '101': { o: 'https://s.example/101.jpg', m: 'https://s.example/101-m.webp' } }))
    const got = quickCovers([
      { annictId: 1, malAnimeId: '101', imageUrl: 'https://og.example/1.jpg' },
      { annictId: 2, malAnimeId: '999', imageUrl: 'https://og.example/2.jpg' },
      { annictId: 3, malAnimeId: null, imageUrl: null },
    ])
    expect(got.get(1)?.landscape).toBe(false)
    expect(got.get(2)).toEqual({ url: 'https://og.example/2.jpg', thumb: 'https://og.example/2.jpg', landscape: true })
    expect(got.has(3)).toBe(false)
    expect(fetchMedia).not.toHaveBeenCalled()
  })
})
