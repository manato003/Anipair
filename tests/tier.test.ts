import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { CREATE_PER_IP, ITEMS_MAX, TIER_MAX, cardTierColor, handleTier, memoryStore, pageHtml, parseShared, upstashStore, type TierStore } from '../api/tier'

const ORIGIN = 'https://app.example'
const TABLE = { title: '2026年 秋アニメ Tier表', tiers: [{ name: 'S', items: [52991, 1] }, { name: 'A', items: [] }] }
const TEMPLATE = '<html><head><meta name="description" content="アプリの説明" />\n<title>Anipair</title></head><body></body></html>'

function req(method: string, init: { query?: string; body?: unknown; origin?: string | null; key?: string; ip?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const origin = init.origin === undefined ? ORIGIN : init.origin
  if (origin) headers.Origin = origin
  if (init.key) headers.Authorization = `Bearer ${init.key}`
  if (init.ip) headers['X-Real-IP'] = init.ip
  return new Request(`${ORIGIN}/api/tier${init.query ?? ''}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  })
}

async function create(store: TierStore, body: unknown = TABLE, ip = '203.0.113.1') {
  const res = await handleTier(req('POST', { body, ip }), { store })
  return { res, body: (await res.json()) as { id?: string; key?: string; error?: string } }
}

describe('handleTier', () => {
  it('creates a table, returns an id and an edit key, and lets anyone read it without the key', async () => {
    const store = memoryStore()
    const { res, body } = await create(store)
    expect(res.status).toBe(201)
    expect(body.id).toMatch(/^[0-9A-Za-z]{10}$/)
    expect(body.key!.length).toBeGreaterThanOrEqual(40)

    const read = await handleTier(req('GET', { query: `?id=${body.id}`, origin: null }), { store })
    expect(read.status).toBe(200)
    expect(read.headers.get('cache-control')).toContain('s-maxage=60')
    const got = (await read.json()) as Record<string, unknown>
    expect(got.title).toBe(TABLE.title)
    expect(got.tiers).toEqual(TABLE.tiers)
    // 鍵もそのハッシュも、読む人には返さない
    expect(JSON.stringify(got)).not.toContain(body.key!)
    expect(got).not.toHaveProperty('hash')
  })

  it('stores only a hash of the edit key', async () => {
    const store = memoryStore()
    const { body } = await create(store)
    const raw = (await store.get(body.id!))!
    expect(raw).not.toContain(body.key!)
    expect(JSON.parse(raw).hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('updates and deletes only with the right key', async () => {
    const store = memoryStore()
    const { body } = await create(store)
    const next = { ...TABLE, title: '並べ直した' }

    expect((await handleTier(req('PUT', { query: `?id=${body.id}`, body: next }), { store })).status).toBe(401)
    expect((await handleTier(req('PUT', { query: `?id=${body.id}`, body: next, key: 'x'.repeat(43) }), { store })).status).toBe(403)
    const ok = await handleTier(req('PUT', { query: `?id=${body.id}`, body: next, key: body.key }), { store })
    expect(ok.status).toBe(200)
    const read = (await (await handleTier(req('GET', { query: `?id=${body.id}` }), { store })).json()) as { title: string }
    expect(read.title).toBe('並べ直した')

    expect((await handleTier(req('DELETE', { query: `?id=${body.id}`, key: 'x'.repeat(43) }), { store })).status).toBe(403)
    expect((await handleTier(req('DELETE', { query: `?id=${body.id}`, key: body.key }), { store })).status).toBe(200)
    expect((await handleTier(req('GET', { query: `?id=${body.id}` }), { store })).status).toBe(404)
    // 消したあとに直そうとしても、作り直さない
    expect((await handleTier(req('PUT', { query: `?id=${body.id}`, body: next, key: body.key }), { store })).status).toBe(404)
    expect(await store.get(body.id!)).toBeNull()
  })

  it('accepts writes only from the same origin', async () => {
    const store = memoryStore()
    expect((await handleTier(req('POST', { body: TABLE, origin: null }), { store })).status).toBe(403)
    expect((await handleTier(req('POST', { body: TABLE, origin: 'https://evil.example' }), { store })).status).toBe(403)
  })

  it('limits how many tables one address can create in a day', async () => {
    const store = memoryStore()
    for (let i = 0; i < CREATE_PER_IP; i++) expect((await create(store)).res.status).toBe(201)
    expect((await create(store)).res.status).toBe(429)
    // 別の接続元は作れる
    expect((await create(store, TABLE, '198.51.100.7')).res.status).toBe(201)
  })

  it('rejects malformed tables', async () => {
    const store = memoryStore()
    const bad: unknown[] = [
      null,
      [],
      { title: 'x', tiers: [{ name: 'S', items: [] }] },
      { title: 'x', tiers: Array.from({ length: TIER_MAX + 1 }, () => ({ name: 'S', items: [] })) },
      { title: 'x'.repeat(41), tiers: TABLE.tiers },
      { title: 'x', tiers: [{ name: 'あ'.repeat(13), items: [] }, { name: 'A', items: [] }] },
      { title: 'x', tiers: [{ name: '', items: [] }, { name: 'A', items: [] }] },
      { title: 'x', tiers: [{ name: 'S', items: [1, 1] }, { name: 'A', items: [] }] },
      { title: 'x', tiers: [{ name: 'S', items: [1] }, { name: 'A', items: [1] }] },
      { title: 'x', tiers: [{ name: 'S', items: ['1'] }, { name: 'A', items: [] }] },
      { title: 'x', tiers: [{ name: 'S', items: [1.5] }, { name: 'A', items: [] }] },
      { title: 'x', tiers: [{ name: 'S', items: [0] }, { name: 'A', items: [] }] },
      { title: 'x', tiers: [{ name: 'S', items: Array.from({ length: ITEMS_MAX + 1 }, (_, i) => i + 1) }, { name: 'A', items: [] }] },
    ]
    for (const b of bad) expect(parseShared(b)).toBeNull()
    expect((await create(store, '{not json')).res.status).toBe(400)
    expect((await create(store, 'x'.repeat(60 * 1024))).res.status).toBe(413)
  })

  it('strips control and direction characters from names', () => {
    expect(parseShared({ title: 'a‮b\nc', tiers: TABLE.tiers })?.title).toBe('a b c')
  })

  it('refuses unknown query shapes and methods', async () => {
    const store = memoryStore()
    expect((await handleTier(req('GET', { query: '?id=short' }), { store })).status).toBe(400)
    expect((await handleTier(req('GET', { query: '?id=AAAAAAAAAA&x=1' }), { store })).status).toBe(400)
    expect((await handleTier(req('PATCH', { body: TABLE }), { store })).status).toBe(405)
    expect((await handleTier(req('POST', { query: '?id=AAAAAAAAAA', body: TABLE }), { store })).status).toBe(400)
  })

  it('answers 503 when no store is configured', async () => {
    expect((await handleTier(req('GET', { query: '?id=AAAAAAAAAA' }), { store: null })).status).toBe(503)
    expect((await handleTier(req('POST', { body: TABLE }), { store: null })).status).toBe(503)
  })

  it('serves the app page with the table title in the title and OGP tags', async () => {
    const store = memoryStore()
    const { body } = await create(store, { ...TABLE, title: '<script>"x"</script>' })
    const res = await handleTier(new Request(`${ORIGIN}/api/tier?page=${body.id}`), { store, template: async () => TEMPLATE })
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<title>&lt;script&gt;&quot;x&quot;&lt;/script&gt; | Anipair</title>')
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/t/${body.id}" />`)
    expect(html).toContain('<meta name="description" content="S・Aの2段に2作品を並べたTier表です。Anipairで作られました。" />')
    expect(html).not.toContain('<script>')
  })

  it('points og:image at the card with the update time in the URL', async () => {
    const store = memoryStore()
    const { body } = await create(store)
    const html = await (await handleTier(new Request(`${ORIGIN}/t/${body.id}`), { store, template: async () => TEMPLATE })).text()
    expect(html).toMatch(new RegExp(`<meta property="og:image" content="${ORIGIN}/api/tier\\?image=${body.id}&amp;v=[0-9a-z]+" />`))
    expect(html).toContain('<meta property="og:image:width" content="1200" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
  })

  it('draws the card as a PNG, and refuses unknown tables and extra parameters', async () => {
    const store = memoryStore()
    const { body } = await create(store)
    const card = async () => ({
      font: await readFile('fonts/ZenMaruGothic-Bold.ttf'),
      logo: `data:image/svg+xml;base64,${(await readFile('public/logo-mark-on-dark.svg')).toString('base64')}`,
    })
    const res = await handleTier(req('GET', { query: `?image=${body.id}&v=abc`, origin: null }), { store, card })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('s-maxage=60')
    const png = new Uint8Array(await res.arrayBuffer())
    expect([...png.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47])
    // 幅と高さ（IHDR）
    const view = new DataView(png.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])

    expect((await handleTier(req('GET', { query: '?image=AAAAAAAAAA', origin: null }), { store, card })).status).toBe(404)
    expect((await handleTier(req('GET', { query: `?image=${body.id}&x=1`, origin: null }), { store, card })).status).toBe(400)
    expect((await handleTier(req('GET', { query: '?image=short', origin: null }), { store, card })).status).toBe(400)
  })

  it('serves the plain app page for an unknown table', async () => {
    const res = await handleTier(new Request(`${ORIGIN}/t/AAAAAAAAAA`), { store: memoryStore(), template: async () => TEMPLATE })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(TEMPLATE)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

describe('cardTierColor', () => {
  // 画面の tierColor（hsl(色相 85% 72%)）を #rrggbb にしたもの
  it('matches the colors of the tiers on screen', () => {
    expect(cardTierColor(0, 5)).toBe('#f47b7b')
    expect(cardTierColor(1, 5)).toBe('#f4c47b')
    expect(cardTierColor(9, 10)).toBe('#b87bf4')
  })
})

describe('pageHtml', () => {
  it('leaves the template as is without a table', () => {
    expect(pageHtml(TEMPLATE, null, `${ORIGIN}/t/x`)).toBe(TEMPLATE)
  })

  it('does not expand replacement patterns written in the title or tier names', () => {
    const html = pageHtml(TEMPLATE, { title: "$&$'$`", tiers: [{ name: '$1', items: [] }, { name: '$2', items: [] }] }, `${ORIGIN}/t/x`)
    expect(html).toContain("<title>$&amp;$&#39;$` | Anipair</title>")
    expect(html).toContain('content="$1・$2の2段に0作品を並べたTier表です。Anipairで作られました。"')
    expect(html.match(/<html>/g)).toHaveLength(1)
  })
})

describe('upstashStore', () => {
  it('creates with NX and replaces with XX', async () => {
    const sent: unknown[] = []
    const store = upstashStore('https://redis.example/', 'tok', async (url, init) => {
      expect(url).toBe('https://redis.example/pipeline')
      sent.push(JSON.parse(init.body as string))
      return new Response(JSON.stringify([{ result: 'OK' }]))
    })
    expect(await store.create('AAAAAAAAAA', '{}')).toBe(true)
    expect(await store.replace('AAAAAAAAAA', '{}')).toBe(true)
    expect(sent).toEqual([[['SET', 'tier:1:t:AAAAAAAAAA', '{}', 'NX']], [['SET', 'tier:1:t:AAAAAAAAAA', '{}', 'XX']]])
  })
})
