// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 間隔の待ちは無し（間隔そのものは throttle.test.ts で確かめている）
vi.mock('./throttle', () => ({ createThrottle: () => <T,>(task: () => Promise<T>) => task() }))

const { fetchMedia, fetchRelated, fetchSimilar, fetchSimilarMany, normalize, peekMedia, resetShikimoriMemory, shikimoriUrl, workData } = await import('./shikimori')

const fetchMock = vi.fn<(url: string) => Promise<Response>>()

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

const raw = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Work ${id}`,
  japanese: `作品${id}`,
  english: null,
  kind: 'tv',
  rating: 'pg_13',
  status: 'released',
  score: 8.1,
  year: 2020,
  poster: { o: `https://s.example/${id}.jpg`, m: `https://s.example/${id}-m.webp` },
  genres: [
    { n: 'Drama', k: 'genre' },
    { n: 'Iyashikei', k: 'theme' },
    { n: 'Seinen', k: 'demographic' },
  ],
  studios: ['Madhouse'],
  prequels: [7],
  ...extra,
})

beforeEach(() => {
  localStorage.clear()
  resetShikimoriMemory()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('normalize', () => {
  it('maps a trimmed Shikimori work to our own Media', () => {
    expect(normalize(raw(5))).toEqual({
      idMal: 5,
      title: { native: '作品5', romaji: 'Work 5', english: null },
      format: 'TV',
      status: 'FINISHED',
      isAdult: false,
      seasonYear: 2020,
      genres: ['Drama'],
      themes: ['Iyashikei'],
      demographics: ['Seinen'],
      studios: ['Madhouse'],
      cover: { url: 'https://s.example/5.jpg', thumb: 'https://s.example/5-m.webp', landscape: false },
      score: 8.1,
      prequels: [7],
    })
  })

  it.each([
    ['tv', 'TV'],
    ['movie', 'MOVIE'],
    ['ova', 'OVA'],
    ['ona', 'ONA'],
    ['tv_special', 'TV_SPECIAL'],
    ['special', 'SPECIAL'],
    ['music', 'MUSIC'],
    ['pv', 'PV'],
    ['cm', 'CM'],
    ['weird', null],
  ])('maps the kind %s to %s', (kind, format) => {
    expect(normalize(raw(1, { kind }))?.format).toBe(format)
  })

  it.each([
    ['released', 'FINISHED'],
    ['ongoing', 'RELEASING'],
    ['anons', 'NOT_YET_RELEASED'],
    ['mystery', null],
  ])('maps the status %s to %s', (status, expected) => {
    expect(normalize(raw(1, { status }))?.status).toBe(expected)
  })

  it('treats rx as adult, and Hentai or Erotica too, but not r_plus', () => {
    expect(normalize(raw(1, { rating: 'rx' }))?.isAdult).toBe(true)
    expect(normalize(raw(1, { rating: 'r_plus' }))?.isAdult).toBe(false)
    expect(normalize(raw(1, { rating: 'pg_13', genres: [{ n: 'Hentai', k: 'genre' }] }))?.isAdult).toBe(true)
    expect(normalize(raw(1, { genres: [{ n: 'Erotica', k: 'genre' }] }))?.isAdult).toBe(true)
    expect(normalize(raw(1, { genres: [{ n: 'Ecchi', k: 'genre' }] }))?.isAdult).toBe(false)
  })

  it('has no cover without a poster, and no score for 0 or null', () => {
    expect(normalize(raw(1, { poster: null }))?.cover).toBeNull()
    expect(normalize(raw(1, { score: 0 }))?.score).toBeNull()
    expect(normalize(raw(1, { score: null }))?.score).toBeNull()
  })

  it('rejects an entry without a usable id', () => {
    expect(normalize(raw(0))).toBeNull()
    expect(normalize(raw(-3))).toBeNull()
  })
})

describe('fetchMedia', () => {
  it('asks the proxy (not Shikimori directly) with sorted ids, and returns the works found', async () => {
    fetchMock.mockResolvedValue(reply({ animes: [raw(2), raw(9)] }))
    const got = await fetchMedia([9, 2, 2, 404])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/shiki?op=animes&ids=2,9,404')
    expect([...got.keys()]).toEqual([9, 2])
    expect(got.get(2)?.title.native).toBe('作品2')
  })

  it('splits into batches of 50', async () => {
    fetchMock.mockImplementation(async (url) => {
      const ids = new URL(url, 'http://x').searchParams.get('ids')!.split(',').map(Number)
      return reply({ animes: ids.map((i) => raw(i)) })
    })
    const ids = Array.from({ length: 120 }, (_, i) => i + 1)
    const got = await fetchMedia(ids)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(got.size).toBe(120)
  })

  it('does not ask again for what it has, including works that came back empty', async () => {
    fetchMock.mockResolvedValue(reply({ animes: [raw(1)] }))
    await fetchMedia([1, 2])
    await fetchMedia([1, 2])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(peekMedia(1)?.idMal).toBe(1)
    expect(peekMedia(2)).toBeNull()
    expect(peekMedia(3)).toBeUndefined()
  })

  it('does not call the network for an empty list', async () => {
    expect((await fetchMedia([])).size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a rate limit, a missing proxy and other failures in Japanese', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'rate_limited' }, 429))
    await expect(fetchMedia([1])).rejects.toThrow('利用制限')
    fetchMock.mockResolvedValueOnce(new Response('<html>404</html>', { status: 404 }))
    await expect(fetchMedia([2])).rejects.toThrow('中継が動いていません')
    fetchMock.mockResolvedValueOnce(reply({ error: 'upstream_error' }, 502))
    await expect(fetchMedia([3])).rejects.toThrow('upstream_error')
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(fetchMedia([4])).rejects.toThrow('接続できませんでした')
  })

  it('does not remember a failed batch (it can be asked again)', async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: 'x' }, 502))
    await expect(fetchMedia([1])).rejects.toThrow()
    expect(peekMedia(1)).toBeUndefined()
    fetchMock.mockResolvedValueOnce(reply({ animes: [raw(1)] }))
    expect((await fetchMedia([1])).size).toBe(1)
  })
})

describe('fetchSimilar', () => {
  it('asks for the similar works of one id and keeps the order', async () => {
    fetchMock.mockResolvedValue(reply({ ids: [30, 10, 20] }))
    expect(await fetchSimilar(5)).toEqual([30, 10, 20])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/shiki?op=similar&id=5')
  })

  it('keeps the list on this device (30 days) and in memory, so it asks once', async () => {
    fetchMock.mockResolvedValue(reply({ ids: [1, 2] }))
    await fetchSimilar(5)
    await fetchSimilar(5)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(localStorage.getItem('animax.similar.v1')!)
    expect(saved['5'].ids).toEqual([1, 2])
    // 起動し直し（メモリを捨てる）ても、端末の控えを使う
    resetShikimoriMemory()
    expect(await fetchSimilar(5)).toEqual([1, 2])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks again once the saved list is older than 30 days', async () => {
    localStorage.setItem('animax.similar.v1', JSON.stringify({ '5': { at: Date.now() - 31 * 24 * 60 * 60 * 1000, ids: [9] } }))
    fetchMock.mockResolvedValue(reply({ ids: [1] }))
    expect(await fetchSimilar(5)).toEqual([1])
  })

  it('rejects an answer in the wrong shape', async () => {
    fetchMock.mockResolvedValue(reply({ ids: ['x'] }))
    await expect(fetchSimilar(5)).rejects.toThrow('読めませんでした')
  })
})

describe('fetchSimilarMany', () => {
  it('goes one work at a time, reporting the progress, and stops at the first failure', async () => {
    fetchMock.mockImplementation(async (url) => {
      const id = Number(new URL(url, 'http://x').searchParams.get('id'))
      return id === 3 ? reply({ error: 'x' }, 502) : reply({ ids: [id + 100] })
    })
    const progress: string[] = []
    await expect(fetchSimilarMany([1, 2, 3, 4], (d, t) => progress.push(`${d}/${t}`))).rejects.toThrow()
    expect(progress).toEqual(['1/4', '2/4'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // 取れた分は端末に残っているので、次は続きから
    fetchMock.mockClear()
    fetchMock.mockImplementation(async () => reply({ ids: [1] }))
    const got = await fetchSimilarMany([1, 2, 3])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect([...got.keys()]).toEqual([1, 2, 3])
  })
})

describe('provider interface', () => {
  it('exposes the three operations a replacement provider has to implement', async () => {
    expect(Object.keys(workData).sort()).toEqual(['fetchMedia', 'fetchRelated', 'fetchSimilar'])
    fetchMock.mockImplementation(async () => reply({ animes: [raw(5, { prequels: [3, 4] })] }))
    expect(await fetchRelated(5)).toEqual({ prequels: [3, 4] })
    expect(await fetchRelated(6)).toEqual({ prequels: [] })
  })

  it('builds the Shikimori page address from the MyAnimeList id', () => {
    expect(shikimoriUrl(52991)).toBe('https://shikimori.io/animes/52991')
  })
})
