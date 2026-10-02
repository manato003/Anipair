import { describe, expect, it, vi } from 'vitest'
import { POST, exchangeToken, type TokenEnv } from '../api/annict-token'

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
