import { describe, expect, it, vi } from 'vitest'
import { EXCHANGES_PER_CLIENT_PER_MINUTE, POST, counterFromEnv, exchangeToken, upstashCounter, type ExchangeCounter, type TokenEnv } from '../api/annict-token'

const ENV: TokenEnv = {
  ANNICT_CLIENT_ID: 'cid',
  ANNICT_CLIENT_SECRET: 'sec',
  ANNICT_REDIRECT_URIS: 'https://app.example/, http://localhost:3000/',
}

function req(body: unknown, init: { method?: string; origin?: string; raw?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.origin) headers.Origin = init.origin
  return new Request('https://app.example/api/annict-token', {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' ? undefined : (init.raw ?? JSON.stringify(body)),
  })
}

const GOOD = { code: 'abc123', redirectUri: 'https://app.example/' }

function annict(status: number, body: unknown) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }))
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('exchangeToken', () => {
  it('forwards the code to Annict with the server-side credentials and returns only the access token', async () => {
    const fetchFn = annict(200, { access_token: 'TOKEN', token_type: 'Bearer', scope: 'read write', created_at: 1 })
    const res = await exchangeToken(req(GOOD, { origin: 'https://app.example' }), ENV, fetchFn)
    expect(res.status).toBe(200)
    expect(await bodyOf(res)).toEqual({ access_token: 'TOKEN' })
    expect(res.headers.get('cache-control')).toBe('no-store')

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.annict.com/oauth/token')
    expect(init.method).toBe('POST')
    // アプリ名と連絡先を名乗る（Annict の開発者向けヘルプのお願い）
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Anipair (https://anipair.com/)')
    const sent = new URLSearchParams(String(init.body))
    expect(Object.fromEntries(sent)).toEqual({
      client_id: 'cid',
      client_secret: 'sec',
      grant_type: 'authorization_code',
      redirect_uri: 'https://app.example/',
      code: 'abc123',
    })
  })

  it('accepts every redirect URI on the list (with spaces around the commas)', async () => {
    const res = await exchangeToken(req({ code: 'c', redirectUri: 'http://localhost:3000/' }), ENV, annict(200, { access_token: 't' }))
    expect(res.status).toBe(200)
  })

  it('rejects a redirect URI that is not on the list, without calling Annict', async () => {
    const fetchFn = annict(200, { access_token: 't' })
    const res = await exchangeToken(req({ code: 'c', redirectUri: 'https://evil.example/' }), ENV, fetchFn)
    expect(res.status).toBe(400)
    expect(await bodyOf(res)).toEqual({ error: 'redirect_uri_not_allowed' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does not accept a look-alike of a listed URI (no prefix matching)', async () => {
    const fetchFn = annict(200, { access_token: 't' })
    const res = await exchangeToken(req({ code: 'c', redirectUri: 'https://app.example/x' }), ENV, fetchFn)
    expect(res.status).toBe(400)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses a request from another origin', async () => {
    const fetchFn = annict(200, { access_token: 't' })
    const res = await exchangeToken(req(GOOD, { origin: 'https://evil.example' }), ENV, fetchFn)
    expect(res.status).toBe(403)
    expect(await bodyOf(res)).toEqual({ error: 'origin_not_allowed' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([
    ['no client id', { ...ENV, ANNICT_CLIENT_ID: undefined }],
    ['no client secret', { ...ENV, ANNICT_CLIENT_SECRET: '  ' }],
    ['no redirect list', { ...ENV, ANNICT_REDIRECT_URIS: undefined }],
    ['an empty redirect list', { ...ENV, ANNICT_REDIRECT_URIS: ' , ' }],
  ])('answers server_not_configured with %s, without saying which one is missing', async (_name, env) => {
    const fetchFn = annict(200, { access_token: 't' })
    const res = await exchangeToken(req(GOOD), env, fetchFn)
    expect(res.status).toBe(500)
    expect(await bodyOf(res)).toEqual({ error: 'server_not_configured' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it.each([
    ['not JSON', { raw: 'nope' }, undefined],
    ['no code', {}, { redirectUri: 'https://app.example/' }],
    ['an empty code', {}, { code: '', redirectUri: 'https://app.example/' }],
    ['a code with odd characters', {}, { code: 'a b&client_secret=x', redirectUri: 'https://app.example/' }],
    ['a code that is too long', {}, { code: 'a'.repeat(513), redirectUri: 'https://app.example/' }],
    ['a non-string code', {}, { code: 1, redirectUri: 'https://app.example/' }],
    ['no redirect URI', {}, { code: 'c' }],
    ['a JSON array', {}, ['c']],
  ])('answers bad_request for %s', async (_name, init, body) => {
    const fetchFn = annict(200, { access_token: 't' })
    const res = await exchangeToken(req(body, init), ENV, fetchFn)
    expect(res.status).toBe(400)
    expect(await bodyOf(res)).toEqual({ error: 'bad_request' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('answers 405 to anything but POST', async () => {
    const res = await exchangeToken(req(GOOD, { method: 'GET' }), ENV, annict(200, { access_token: 't' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it.each([400, 401])('maps Annict %i (a used or expired code) to invalid_grant', async (status) => {
    const res = await exchangeToken(req(GOOD), ENV, annict(status, { error: 'invalid_grant', error_description: 'secret details' }))
    expect(res.status).toBe(400)
    // Annict の文言はそのまま返さない
    expect(await bodyOf(res)).toEqual({ error: 'invalid_grant' })
  })

  it('maps an Annict server error to upstream_error', async () => {
    const res = await exchangeToken(req(GOOD), ENV, annict(500, {}))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ error: 'upstream_error' })
  })

  it('maps a network failure to upstream_unreachable', async () => {
    const res = await exchangeToken(req(GOOD), ENV, vi.fn(async () => Promise.reject(new Error('boom'))))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ error: 'upstream_unreachable' })
  })

  it.each([
    ['no access_token', {}],
    ['an empty access_token', { access_token: '' }],
    ['a non-string access_token', { access_token: 5 }],
  ])('maps an Annict answer with %s to upstream_error', async (_name, body) => {
    const res = await exchangeToken(req(GOOD), ENV, annict(200, body))
    expect(res.status).toBe(502)
    expect(await bodyOf(res)).toEqual({ error: 'upstream_error' })
  })

  it('maps an Annict answer that is not JSON to upstream_error', async () => {
    const res = await exchangeToken(req(GOOD), ENV, vi.fn(async () => new Response('<html>', { status: 200 })))
    expect(res.status).toBe(502)
  })

  it('never writes the code, the token or the secret to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined))
    try {
      await exchangeToken(req(GOOD), ENV, annict(200, { access_token: 'TOKEN' }))
      await exchangeToken(req(GOOD), ENV, annict(401, {}))
      await exchangeToken(req(GOOD), ENV, vi.fn(async () => Promise.reject(new Error('boom'))))
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })

  it('the exported POST handler reads the settings from process.env', async () => {
    const saved = { ...process.env }
    try {
      delete process.env.ANNICT_CLIENT_ID
      const res = await POST(req(GOOD))
      expect(res.status).toBe(500)
    } finally {
      process.env = saved
    }
  })
})

// 2026-10-13 のコードレビュー #31: 本文の大きさに上限が無かった
describe('exchangeToken refuses a large body', () => {
  it('answers 413 without asking Annict', async () => {
    const fetchFn = annict(200, { access_token: 't' })
    const res = await exchangeToken(req(null, { raw: JSON.stringify({ ...GOOD, pad: 'x'.repeat(8 * 1024) }), origin: 'https://app.example' }), ENV, fetchFn)
    expect(res.status).toBe(413)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

// 2026-11-10（Fable の点検の F7）: 接続元ごとの回数
describe('exchangeToken counts each client', () => {
  const at = Date.UTC(2026, 10, 10, 12, 0, 15)
  const from = (ip: string | null, body: unknown = GOOD) => {
    const r = req(body, { origin: 'https://app.example' })
    if (ip !== null) r.headers.set('x-real-ip', ip)
    return r
  }
  function fakeCounter(opts: { broken?: boolean } = {}) {
    const counts = new Map<string, number>()
    const counter: ExchangeCounter = {
      async count(key) {
        if (opts.broken) throw new Error('down')
        const n = (counts.get(key) ?? 0) + 1
        counts.set(key, n)
        return n
      },
    }
    return { counter, counts }
  }

  it('lets a client exchange up to the limit a minute, then answers 429 without asking Annict', async () => {
    const { counter, counts } = fakeCounter()
    const fetchFn = annict(400, { error: 'invalid_grant' })
    for (let i = 0; i < EXCHANGES_PER_CLIENT_PER_MINUTE; i++) expect((await exchangeToken(from('203.0.113.7'), ENV, fetchFn, counter, () => at)).status).toBe(400)
    const res = await exchangeToken(from('203.0.113.7'), ENV, fetchFn, counter, () => at)
    expect(res.status).toBe(429)
    expect(await bodyOf(res)).toEqual({ error: 'rate_limited' })
    expect(res.headers.get('retry-after')).toBe('45')
    expect(fetchFn).toHaveBeenCalledTimes(EXCHANGES_PER_CLIENT_PER_MINUTE)
    // 別の接続元と、次の分は数え直す
    expect((await exchangeToken(from('203.0.113.8'), ENV, fetchFn, counter, () => at)).status).toBe(400)
    expect((await exchangeToken(from('203.0.113.7'), ENV, fetchFn, counter, () => at + 60_000)).status).toBe(400)
    // 置くのはハッシュだけ（IP そのものは置かない）
    for (const key of counts.keys()) {
      expect(key).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('does not count requests it refuses anyway, and lets the login through when the counter cannot be reached or the address is unknown', async () => {
    const { counter, counts } = fakeCounter()
    await exchangeToken(from('203.0.113.7', { code: 'x', redirectUri: 'https://evil.example/' }), ENV, annict(200, {}), counter, () => at)
    expect(counts.size).toBe(0)
    expect((await exchangeToken(from('203.0.113.7'), ENV, annict(200, { access_token: 't' }), fakeCounter({ broken: true }).counter, () => at)).status).toBe(200)
    expect((await exchangeToken(from(null), ENV, annict(200, { access_token: 't' }), counter, () => at)).status).toBe(200)
    expect(counts.size).toBe(0)
  })

  it('talks to the Upstash pipeline and expires the count after two minutes', async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify([{ result: 3 }, { result: 1 }]), { status: 200 }))
    expect(await upstashCounter('https://x.upstash.io/', 'tok', fetchFn).count('abc')).toBe(3)
    expect(fetchFn.mock.calls[0][0]).toBe('https://x.upstash.io/pipeline')
    expect(JSON.parse(String(fetchFn.mock.calls[0][1].body))).toEqual([['INCR', 'annict-token:1:c:abc'], ['EXPIRE', 'annict-token:1:c:abc', 120]])
    expect(counterFromEnv({})).toBeNull()
    expect(counterFromEnv({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' })).not.toBeNull()
  })
})
