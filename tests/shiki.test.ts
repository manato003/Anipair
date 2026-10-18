import { describe, expect, it, vi } from 'vitest'
import { GET, handleShiki, localTake, storeFromEnv, upstashStore, type ShikiStore } from '../api/shiki'

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
  episodes: 28,
  episodesAired: 28,
  duration: 24,
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
    expect(headers['User-Agent']).toBe('Anipair (https://anipair.com/)')
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
        eps: 28,
        aired: 28,
        dur: 24,
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
        // 点数を付けた人の数の合計（RAW に scoresStats が無ければ 0）
        sc: 0,
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

  it('turns unknown episode counts and lengths into 0', async () => {
    const raw = { ...RAW, episodes: null, episodesAired: 'x', duration: undefined }
    const res = await handleShiki(req('?op=animes&ids=1'), upstream(200, { data: { animes: [raw] } }))
    const { animes } = (await json(res)) as { animes: Record<string, unknown>[] }
    expect(animes[0]).toMatchObject({ eps: 0, aired: 0, dur: 0 })
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

  it('accepts only the versions the app uses for anime and studio lookups (other versions would bypass the CDN copy)', async () => {
    const fetchFn = upstream(200, { data: { animes: [RAW] } })
    for (const v of ['1', '3', '7', '99', '06', '0']) {
      expect((await handleShiki(req(`?op=animes&ids=1&v=${v}`), fetchFn)).status).toBe(400)
      expect((await handleShiki(req(`?op=studio&id=1&page=1&v=${v}`), fetchFn)).status).toBe(400)
    }
    expect(fetchFn).not.toHaveBeenCalled()
    for (const v of ['4', '5', '6']) expect((await handleShiki(req(`?op=animes&ids=1&v=${v}`), fetchFn)).status).toBe(200)
    expect((await handleShiki(req('?op=animes&ids=1'), fetchFn)).status).toBe(200)
  })
})

describe('handleShiki similar', () => {
  it('asks the REST endpoint for that id with the app User-Agent and returns the ids in order', async () => {
    const fetchFn = upstream(200, [{ id: 33352, name: 'x' }, { id: 41025 }, { name: 'no id' }, { id: 35851 }])
    const res = await handleShiki(req('?op=similar&id=52991'), fetchFn)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://shikimori.io/api/animes/52991/similar')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Anipair (https://anipair.com/)')
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

  it('from v=4, adds the characters (id and romaji name) to each voice role, with no extra lookups', async () => {
    const person = {
      roles: [
        { characters: [{ id: 184947, name: 'Frieren' }], animes: [{ id: 52991 }, { id: 59978 }] },
        { characters: [{ id: 7, name: 'Somebody' }, { id: 8 }], animes: [{ id: 52991 }] },
      ],
      works: [],
    }
    const fetchFn = upstream(200, person)
    const res = await handleShiki(req('?op=person&id=17215&v=4'), fetchFn)
    // 1回の問い合わせで Shikimori へ出るのは1回だけ（日本語名は画面が op=characters で引く）
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(await json(res)).toEqual({
      cast: [
        {
          id: 52991,
          ch: [
            { i: 184947, n: 'Frieren' },
            { i: 7, n: 'Somebody' },
            { i: 8, n: null },
          ],
        },
        { id: 59978, ch: [{ i: 184947, n: 'Frieren' }] },
      ],
      staff: [],
    })
  })

  it('accepts only the versions in use for a person, so changing v cannot skip the CDN cache', async () => {
    const fetchFn = upstream(200, { roles: [], works: [] })
    for (const v of ['3', '5', '99', '04', '0']) expect((await handleShiki(req(`?op=person&id=17215&v=${v}`), fetchFn)).status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
    expect((await handleShiki(req('?op=person&id=17215&v=2'), fetchFn)).status).toBe(200)
    expect((await handleShiki(req('?op=person&id=17215&v=4'), fetchFn)).status).toBe(200)
  })

  it('answers empty lists (cached) for a person Shikimori does not know, and rejects a bad id', async () => {
    const res = await handleShiki(req('?op=person&id=999999'), upstream(404, {}))
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ cast: [], staff: [] })
    expect((await handleShiki(req('?op=person&id=abc'), upstream(200, {}))).status).toBe(400)
  })
})

describe('handleShiki characters (Japanese names of characters)', () => {
  it('asks GraphQL once for up to 50 characters and returns the Japanese names with the space between family and given name removed', async () => {
    const fetchFn = upstream(200, { data: { characters: [{ id: '184947', japanese: 'フリーレン' }, { id: '8', japanese: '竈門 炭治郎' }, { id: '9', japanese: null }] } })
    const res = await handleShiki(req('?op=characters&ids=8,9,184947'), fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchFn.mock.calls[0][1].body as string).variables).toEqual({ ids: '8,9,184947' })
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=604800')
    expect(await json(res)).toEqual({
      characters: [
        { id: 184947, ja: 'フリーレン' },
        { id: 8, ja: '竈門炭治郎' },
      ],
    })
  })

  it('sends a differently ordered list to the sorted URL (one cache entry per set), and rejects extra parameters', async () => {
    const fetchFn = upstream(200, { data: { characters: [] } })
    const res = await handleShiki(req('?op=characters&ids=9,8,8'), fetchFn)
    expect(res.status).toBe(308)
    expect(res.headers.get('Location')).toBe('/api/shiki?op=characters&ids=8%2C9')
    expect((await handleShiki(req('?op=characters&ids=8&v=1'), fetchFn)).status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
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


// 2026-10-12: Upstash Redis に Shikimori の公開データを作品ごとに控え、Shikimori へ送る回数を全利用者で数える
function fakeStore(opts: { wait?: number | null; broken?: boolean } = {}) {
  const data = new Map<string, { value: string; ttl: number }>()
  let takes = 0
  const store: ShikiStore = {
    async get(keys) {
      if (opts.broken) throw new Error('down')
      return keys.map((k) => data.get(k)?.value ?? null)
    },
    async set(entries) {
      if (opts.broken) throw new Error('down')
      for (const e of entries) data.set(e.key, { value: e.value, ttl: e.ttl })
    },
    async take() {
      if (opts.broken) throw new Error('down')
      takes++
      return opts.wait ?? null
    },
  }
  return { store, data, takes: () => takes }
}

describe('handleShiki with the shared store (Upstash)', () => {
  const AIRING = { ...RAW, malId: '60000', status: 'ongoing' }

  it('keeps each anime by itself (90 days when finished, 1 day while airing, 7 days for unknown ids) and asks Shikimori only for the missing ones', async () => {
    const s = fakeStore()
    const fetchFn = upstream(200, { data: { animes: [RAW, AIRING] } })
    const first = await handleShiki(req('?op=animes&ids=777,52991,60000'), fetchFn, s.store)
    expect(((await json(first)).animes as unknown[]).length).toBe(2)
    expect(s.data.get('shiki:1:anime:52991')?.ttl).toBe(90 * 86400)
    expect(s.data.get('shiki:1:anime:60000')?.ttl).toBe(86400)
    expect(s.data.get('shiki:1:anime:777')).toEqual({ value: 'null', ttl: 7 * 86400 })
    // 別の並び（別の人の頼み）でも、控えにある作品は聞かない。無い作品だけを聞く
    const fetch2 = upstream(200, { data: { animes: [{ ...RAW, malId: '5114' }] } })
    const second = await handleShiki(req('?op=animes&ids=777,5114,52991'), fetch2, s.store)
    expect(JSON.parse(String(fetch2.mock.calls[0][1].body)).variables).toEqual({ ids: '5114' })
    const ids = ((await json(second)).animes as { id: number }[]).map((a) => a.id).sort((a, b) => a - b)
    expect(ids).toEqual([5114, 52991])
    // 全部控えにあれば、Shikimori にも数える回数にも触れない
    const fetch3 = upstream(200, {})
    const before = s.takes()
    const third = await handleShiki(req('?op=animes&ids=777,52991'), fetch3, s.store)
    expect(third.status).toBe(200)
    expect(fetch3).not.toHaveBeenCalled()
    expect(s.takes()).toBe(before)
  })

  it('keeps similar lists for 90 days, including the empty list for an unknown id', async () => {
    const s = fakeStore()
    await handleShiki(req('?op=similar&id=52991'), upstream(200, [{ id: 1 }, { id: 2 }]), s.store)
    await handleShiki(req('?op=similar&id=99999999'), upstream(404, {}), s.store)
    expect(s.data.get('shiki:1:similar:52991')).toEqual({ value: '{"ids":[1,2]}', ttl: 90 * 86400 })
    expect(s.data.get('shiki:1:similar:99999999')?.value).toBe('{"ids":[]}')
    const fetchFn = upstream(200, [])
    const res = await handleShiki(req('?op=similar&id=52991'), fetchFn, s.store)
    expect(await json(res)).toEqual({ ids: [1, 2] })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does not ask Shikimori past the shared limit; tells the app how long to wait, without caching', async () => {
    const s = fakeStore({ wait: 12 })
    const fetchFn = upstream(200, [])
    const res = await handleShiki(req('?op=similar&id=52991'), fetchFn, s.store)
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('12')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(fetchFn).not.toHaveBeenCalled()
    expect(s.data.size).toBe(0)
  })

  it('still answers when the store is down (asks Shikimori directly, as before)', async () => {
    const s = fakeStore({ broken: true })
    const fetchFn = upstream(200, { data: { animes: [RAW] } })
    const res = await handleShiki(req('?op=animes&ids=52991'), fetchFn, s.store)
    expect(res.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('does not count or store a request it refuses', async () => {
    const s = fakeStore()
    expect((await handleShiki(req('?op=similar&id=abc'), upstream(200, []), s.store)).status).toBe(400)
    expect(s.takes()).toBe(0)
    expect(s.data.size).toBe(0)
  })
})

describe('upstashStore', () => {
  const answer = (results: unknown[]) => vi.fn<Fetch>(async () => new Response(JSON.stringify(results.map((result) => ({ result }))), { status: 200 }))

  it('talks to the REST pipeline with the token, and reads many keys at once', async () => {
    const fetchFn = answer([['a', null]])
    const store = upstashStore('https://x.upstash.io/', 'tok', fetchFn)
    expect(await store.get(['k1', 'k2'])).toEqual(['a', null])
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://x.upstash.io/pipeline')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(init.body))).toEqual([['MGET', 'k1', 'k2']])
  })

  it('counts per second and per minute, and asks to wait past 4 a second or 80 a minute', async () => {
    const at = Date.UTC(2026, 9, 12, 0, 0, 45)
    expect(await upstashStore('https://x', 't', answer([1, 1, 1, 1])).take(at)).toBeNull()
    expect(await upstashStore('https://x', 't', answer([5, 1, 30, 1])).take(at)).toBe(1)
    expect(await upstashStore('https://x', 't', answer([1, 1, 81, 1])).take(at)).toBe(15)
  })

  it('fails (so the handler goes on without it) on an error answer', async () => {
    const fetchFn = vi.fn<Fetch>(async () => new Response(JSON.stringify([{ error: 'WRONGPASS' }]), { status: 200 }))
    await expect(upstashStore('https://x', 't', fetchFn).get(['k'])).rejects.toThrow()
  })

  it('is used only when both environment variables are set', () => {
    expect(storeFromEnv({})).toBeNull()
    expect(storeFromEnv({ KV_REST_API_URL: 'https://x' })).toBeNull()
    expect(storeFromEnv({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' })).not.toBeNull()
  })
})

// 2026-10-13 のコードレビュー #31
describe('handleShiki: review #31', () => {
  it('refuses inherited names as the operation or version (400, not 500)', async () => {
    for (const op of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const res = await handleShiki(req(`?op=${op}`), upstream(200, {}))
      expect(res.status).toBe(400)
    }
    expect((await handleShiki(req('?op=animes&ids=1&v=constructor'), upstream(200, {}))).status).toBe(400)
  })

  it('answers many similar lists at once from the store only, never asking Shikimori, and lists the missing ones', async () => {
    const s = fakeStore()
    s.data.set('shiki:1:similar:5', { value: '{"ids":[7,8]}', ttl: 1 })
    s.data.set('shiki:1:similar:9', { value: '{"ids":[]}', ttl: 1 })
    const fetchFn = upstream(200, [])
    const res = await handleShiki(req('?op=similar&ids=5,6,9'), fetchFn, s.store)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await json(res)).toEqual({ found: { '5': [7, 8], '9': [] }, missing: [6] })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(s.takes()).toBe(0)
    // 控えが無い（手元）ときは、全部 missing
    expect(await json(await handleShiki(req('?op=similar&ids=5,6'), fetchFn))).toEqual({ found: {}, missing: [5, 6] })
    // id と ids の両方・壊れた ids は断る
    expect((await handleShiki(req('?op=similar&ids=5&id=6'), fetchFn, s.store)).status).toBe(400)
    expect((await handleShiki(req('?op=similar&ids=a'), fetchFn, s.store)).status).toBe(400)
  })

  it('keeps a conservative limit inside the function when the store cannot be reached', async () => {
    const at = Date.UTC(2026, 9, 13, 0, 0, 10, 500)
    // 1秒2回まで、そのあとは1秒待ってもらう
    expect(localTake(at)).toBeNull()
    expect(localTake(at)).toBeNull()
    expect(localTake(at)).toBe(1)
    const s = fakeStore({ broken: true })
    const fetchFn = upstream(200, [])
    const res = await handleShiki(req('?op=similar&id=52991'), fetchFn, s.store, () => at)
    expect(res.status).toBe(429)
    expect(fetchFn).not.toHaveBeenCalled()
    // Upstash を使わない設定（手元・E2E）では数えない
    expect((await handleShiki(req('?op=similar&id=52991'), fetchFn, null, () => at)).status).toBe(200)
  })
})
