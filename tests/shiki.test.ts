import { describe, expect, it, vi } from 'vitest'
import { GET, handleShiki } from '../api/shiki'

type Fetch = (url: string, init: RequestInit) => Promise<Response>

const req = (query: string, method = 'GET') => new Request(`https://anipair.example/api/shiki${query}`, { method })

function upstream(status: number, body: unknown) {
  return vi.fn<Fetch>(async () => new Response(JSON.stringify(body), { status }))
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

const RAW = {
  malId: '52991',
  name: 'Sousou no Frieren',
  japanese: '葬送のフリーレン',
  english: "Frieren: Beyond Journey's End",
  kind: 'tv',
  rating: 'pg_13',
  status: 'released',
  score: 9.25,
  airedOn: { year: 2023 },
  poster: { originalUrl: 'https://shikimori.io/uploads/poster/animes/52991/o.jpeg', mainUrl: 'https://shikimori.io/uploads/poster/animes/52991/main-m.webp' },
  genres: [
    { name: 'Adventure', kind: 'genre' },
    { name: 'Award Winning', kind: 'theme' },
    { name: 'Shounen', kind: 'demographic' },
  ],
  studios: [{ id: '11', name: 'Madhouse' }],
  related: [
    { relationKind: 'sequel', anime: { malId: '59978' } },
    { relationKind: 'prequel', anime: { malId: '777' } },
    { relationKind: 'prequel', anime: null },
    { relationKind: 'adaptation', anime: null },
  ],
  statusesStats: [
    { status: 'completed', count: 100 },
    { status: 'planned', count: 20 },
  ],
  // 返さない項目
  russian: 'secret-extra',
}

describe('handleShiki animes', () => {
  it('asks Shikimori GraphQL with the app User-Agent and a fixed query', async () => {
    const fetchFn = upstream(200, { data: { animes: [RAW] } })
    await handleShiki(req('?op=animes&ids=9253,52991'), fetchFn)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://shikimori.io/api/graphql')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('Anipair (https://anipair.vercel.app/)')
    const body = JSON.parse(String(init.body))
    expect(body.variables).toEqual({ ids: '9253,52991' })
    expect(body.query).toContain('animes(ids: $ids, limit: 50)')
    // 利用者の入力は問い合わせの文字列に混ざらない
    expect(body.query).not.toContain('9253')
  })

  it('returns trimmed JSON with the long CDN cache', async () => {
    const res = await handleShiki(req('?op=animes&ids=52991'), upstream(200, { data: { animes: [RAW] } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=604800, stale-while-revalidate=86400')
    const { animes } = (await json(res)) as { animes: Record<string, unknown>[] }
    expect(animes).toEqual([
      {
        id: 52991,
        name: 'Sousou no Frieren',
        japanese: '葬送のフリーレン',
        english: "Frieren: Beyond Journey's End",
        kind: 'tv',
        rating: 'pg_13',
        status: 'released',
        score: 9.25,
        year: 2023,
        poster: { o: 'https://shikimori.io/uploads/poster/animes/52991/o.jpeg', m: 'https://shikimori.io/uploads/poster/animes/52991/main-m.webp' },
        genres: [
          { n: 'Adventure', k: 'genre' },
          { n: 'Award Winning', k: 'theme' },
          { n: 'Shounen', k: 'demographic' },
        ],
        studios: ['Madhouse'],
        st: [{ i: 11, n: 'Madhouse' }],
        prequels: [777],
        related: [
          { k: 'sequel', id: 59978 },
          { k: 'prequel', id: 777 },
        ],
        // リストに入れている人の数の合計
        pop: 120,
      },
    ])
  })

  it('turns a missing or zero score into null, and drops a poster that is not https', async () => {
    const raw = { ...RAW, score: 0, poster: { originalUrl: 'http://x/o.jpg', mainUrl: 'https://x/m.webp' }, airedOn: null }
    const res = await handleShiki(req('?op=animes&ids=1'), upstream(200, { data: { animes: [raw, { malId: 'bad' }, { ...RAW, malId: '2', score: null }] } }))
    const { animes } = (await json(res)) as { animes: Record<string, unknown>[] }
    expect(animes.map((a) => a.id)).toEqual([52991, 2])
    expect(animes[0]).toMatchObject({ score: null, poster: null, year: null })
  })

  it.each([
    ['no ids', '?op=animes'],
    ['empty ids', '?op=animes&ids='],
    ['a non-number', '?op=animes&ids=1,abc'],
    ['zero', '?op=animes&ids=0'],
    ['a negative number', '?op=animes&ids=-1'],
    ['a leading zero', '?op=animes&ids=01'],
    ['a decimal', '?op=animes&ids=1.5'],
    ['a trailing comma', '?op=animes&ids=1,'],
    ['an injection attempt', '?op=animes&ids=1%22)%7B%7D'],
    ['an id that is too long', '?op=animes&ids=1234567890'],
    ['more than 50 ids', `?op=animes&ids=${Array.from({ length: 51 }, (_, i) => i + 1).join(',')}`],
  ])('rejects %s without calling Shikimori', async (_name, query) => {
    const fetchFn = upstream(200, { data: { animes: [] } })
    const res = await handleShiki(req(query), fetchFn)
    expect(res.status).toBe(400)
    expect(await json(res)).toEqual({ error: 'bad_request' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('accepts exactly 50 ids', async () => {
    const fetchFn = upstream(200, { data: { animes: [] } })
    const res = await handleShiki(req(`?op=animes&ids=${Array.from({ length: 50 }, (_, i) => i + 1).join(',')}`), fetchFn)
    expect(res.status).toBe(200)
  })
})

// 2026-10-06 の点検: 余計な引数や並びの違う ids で CDN の控えを素通りし、毎回 Shikimori に問い合わせさせられた
describe('handleShiki keeps one URL per answer', () => {
  it('sends ids that are not sorted or have duplicates to the sorted URL, without asking Shikimori', async () => {
    const fetchFn = upstream(200, { data: { animes: [RAW] } })
    const res = await handleShiki(req('?op=animes&ids=52991,9253,9253&v=4'), fetchFn)
    expect(res.status).toBe(308)
    expect(res.headers.get('Location')).toBe('/api/shiki?op=animes&ids=9253%2C52991&v=4')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses unknown or repeated parameters, and a version that is not a short number', async () => {
    const fetchFn = upstream(200, { data: { animes: [RAW] } })
    for (const query of ['?op=animes&ids=1&x=nonce', '?op=similar&id=1&v=4', '?op=animes&ids=1&ids=2', '?op=animes&ids=1&v=abc', '?op=people&q=a&id=1', '?op=nope']) {
      expect((await handleShiki(req(query), fetchFn)).status).toBe(400)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('handleShiki similar', () => {
  it('asks the REST endpoint for that id with the app User-Agent and returns the ids in order', async () => {
    const fetchFn = upstream(200, [{ id: 33352, name: 'x' }, { id: 41025 }, { name: 'no id' }, { id: 35851 }])
    const res = await handleShiki(req('?op=similar&id=52991'), fetchFn)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://shikimori.io/api/animes/52991/similar')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Anipair (https://anipair.vercel.app/)')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('s-maxage=604800')
    expect(await json(res)).toEqual({ ids: [33352, 41025, 35851] })
  })

  it('keeps at most 100', async () => {
    const res = await handleShiki(req('?op=similar&id=1'), upstream(200, Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }))))
    expect(((await json(res)).ids as number[]).length).toBe(100)
  })

  it('answers an empty list (cached) for an id Shikimori does not know', async () => {
    const res = await handleShiki(req('?op=similar&id=99999999'), upstream(404, { code: 404 }))
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ids: [] })
    expect(res.headers.get('cache-control')).toContain('s-maxage')
  })

  it.each([['no id', '?op=similar'], ['a non-number', '?op=similar&id=abc'], ['zero', '?op=similar&id=0'], ['two ids', '?op=similar&id=1,2'], ['a path', '?op=similar&id=1/../x']])(
    'rejects %s',
    async (_name, query) => {
      const fetchFn = upstream(200, [])
      const res = await handleShiki(req(query), fetchFn)
      expect(res.status).toBe(400)
      expect(fetchFn).not.toHaveBeenCalled()
    },
  )
})

describe('handleShiki in general', () => {
  it.each(['', '?op=other', '?op=', '?url=https://example.com', '?op=animes_all'])('rejects the query %j (an allow-list, not a proxy)', async (query) => {
    const fetchFn = upstream(200, {})
    const res = await handleShiki(req(query), fetchFn)
    expect(res.status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each(['POST', 'PUT', 'DELETE'])('answers 405 to %s', async (method) => {
    const fetchFn = upstream(200, {})
    const res = await handleShiki(req('?op=animes&ids=1', method), fetchFn)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps 429 to rate_limited without caching', async () => {
    const res = await handleShiki(req('?op=similar&id=1'), upstream(429, {}))
    expect(res.status).toBe(429)
    expect(await json(res)).toEqual({ error: 'rate_limited' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('retry-after')).toBe('5')
  })

  it.each([500, 503, 403])('maps upstream %i to upstream_error without caching', async (status) => {
    const res = await handleShiki(req('?op=animes&ids=1'), upstream(status, {}))
    expect(res.status).toBe(502)
    expect(await json(res)).toEqual({ error: 'upstream_error' })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('maps a network failure and a timeout to upstream_unreachable', async () => {
    const res = await handleShiki(req('?op=animes&ids=1'), vi.fn<Fetch>(async () => Promise.reject(new Error('boom'))))
    expect(res.status).toBe(502)
    expect(await json(res)).toEqual({ error: 'upstream_unreachable' })
  })

  it.each([
    ['animes', '?op=animes&ids=1', { data: {} }],
    ['animes', '?op=animes&ids=1', { nope: 1 }],
    ['similar', '?op=similar&id=1', { not: 'a list' }],
  ])('maps an unexpected %s answer to upstream_error', async (_name, query, body) => {
    const res = await handleShiki(req(query), upstream(200, body))
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('maps an answer that is not JSON to upstream_error', async () => {
    const res = await handleShiki(req('?op=similar&id=1'), vi.fn<Fetch>(async () => new Response('<html>', { status: 200 })))
    expect(res.status).toBe(502)
  })

  it('sets an abort signal so a stuck upstream does not hang the function', async () => {
    const fetchFn = upstream(200, { data: { animes: [] } })
    await handleShiki(req('?op=animes&ids=1'), fetchFn)
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('never writes to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined))
    try {
      await handleShiki(req('?op=animes&ids=1'), upstream(200, { data: { animes: [RAW] } }))
      await handleShiki(req('?op=similar&id=1'), upstream(500, {}))
      await handleShiki(req('?op=animes&ids=1'), vi.fn<Fetch>(async () => Promise.reject(new Error('boom'))))
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })

  it('the exported GET handler answers (it uses the global fetch, which we stub here)', async () => {
    const original = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify([{ id: 5 }]), { status: 200 })) as typeof fetch
    try {
      const res = await GET(req('?op=similar&id=1'))
      expect(await json(res)).toEqual({ ids: [5] })
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('handleShiki people (find a person by name)', () => {
  it('asks GraphQL with the name only as a variable and returns id, name and Japanese name', async () => {
    const fetchFn = upstream(200, { data: { people: [{ id: '14441', name: 'Sumire Uesaka', japanese: '上坂 すみれ', extra: 'x' }, { id: null }] } })
    const res = await handleShiki(req(`?op=people&q=${encodeURIComponent('上坂すみれ')}`), fetchFn)
    const body = JSON.parse(String(fetchFn.mock.calls[0][1].body))
    expect(body.variables).toEqual({ search: '上坂すみれ' })
    expect(body.query).toContain('people(search: $search, limit: 8)')
    expect(body.query).not.toContain('上坂')
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ people: [{ id: 14441, name: 'Sumire Uesaka', japanese: '上坂 すみれ' }] })
  })

  it('rejects an empty, too long or control-character name without asking Shikimori', async () => {
    const fetchFn = upstream(200, {})
    for (const q of ['', '%20%20', encodeURIComponent('あ'.repeat(61)), '%00x']) {
      expect((await handleShiki(req(`?op=people&q=${q}`), fetchFn)).status).toBe(400)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('handleShiki person (the works of a person)', () => {
  it('asks the REST endpoint and returns de-duplicated anime ids for voice roles and staff work', async () => {
    const fetchFn = upstream(200, {
      id: 14441,
      roles: [{ characters: [{ id: 1 }], animes: [{ id: 10 }, { id: 11 }] }, { animes: [{ id: 10 }, { id: 'x' }] }],
      works: [{ anime: { id: 20 }, role: 'Исполнение' }, { anime: null, manga: { id: 5 } }, { anime: { id: 20 }, role: 'Музыка' }, { anime: { id: 21 } }],
      website: 'secret-extra',
    })
    const res = await handleShiki(req('?op=person&id=14441'), fetchFn)
    expect(fetchFn.mock.calls[0][0]).toBe('https://shikimori.io/api/people/14441')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=604800')
    // スタッフは作品ごとに役割（ロシア語のまま）をまとめる
    expect(await json(res)).toEqual({
      cast: [10, 11],
      staff: [
        { id: 20, r: ['Исполнение', 'Музыка'] },
        { id: 21, r: [] },
      ],
    })
  })

  it('answers empty lists (cached) for a person Shikimori does not know, and rejects a bad id', async () => {
    const res = await handleShiki(req('?op=person&id=999999'), upstream(404, {}))
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ cast: [], staff: [] })
    expect((await handleShiki(req('?op=person&id=abc'), upstream(200, {}))).status).toBe(400)
  })
})

describe('handleShiki studio (the works of a studio)', () => {
  it('asks GraphQL for one page, newest first, and returns the same trimmed shape as animes with studio ids', async () => {
    const fetchFn = upstream(200, { data: { animes: [{ ...RAW, studios: [{ id: '11', name: 'Madhouse' }] }] } })
    const res = await handleShiki(req('?op=studio&id=11&page=2'), fetchFn)
    const body = JSON.parse(String(fetchFn.mock.calls[0][1].body))
    expect(body.variables).toEqual({ studio: '11', page: 2 })
    expect(body.query).toContain('order: aired_on')
    const out = (await json(res)) as { animes: { id: number; studios: string[]; st: { i: number; n: string }[] }[] }
    expect(out.animes[0].id).toBe(52991)
    expect(out.animes[0].studios).toEqual(['Madhouse'])
    expect(out.animes[0].st).toEqual([{ i: 11, n: 'Madhouse' }])
  })

  it('reads page 1 by default and refuses pages past the limit', async () => {
    const fetchFn = upstream(200, { data: { animes: [] } })
    await handleShiki(req('?op=studio&id=11'), fetchFn)
    expect(JSON.parse(String(fetchFn.mock.calls[0][1].body)).variables.page).toBe(1)
    expect((await handleShiki(req('?op=studio&id=11&page=5'), fetchFn)).status).toBe(400)
    expect((await handleShiki(req('?op=studio&page=1'), fetchFn)).status).toBe(400)
  })
})

