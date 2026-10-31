// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { annictClientId, buildAuthorizeUrl, completeLogin, hasCallback, newState, redirectUriFor, startLogin, withoutCallback } from './annictLogin'
import { rememberOauthState, takeOauthState } from './storage'

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('annictClientId', () => {
  it('returns the trimmed id, or null when missing or blank', () => {
    expect(annictClientId({ VITE_ANNICT_CLIENT_ID: ' abc ' })).toBe('abc')
    expect(annictClientId({ VITE_ANNICT_CLIENT_ID: '  ' })).toBeNull()
    expect(annictClientId({})).toBeNull()
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds the Annict authorize URL for the code flow with read and write', () => {
    const url = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://app.example/', state: 'st' }))
    expect(url.origin + url.pathname).toBe('https://annict.com/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/')
    expect(url.searchParams.get('scope')).toBe('read write')
    expect(url.searchParams.get('state')).toBe('st')
    // スコープの区切りは + で送る（read+write）
    expect(url.search).toContain('scope=read+write')
  })

  it('uses the site root of the current origin as the redirect URI', () => {
    expect(redirectUriFor('https://app.example')).toBe('https://app.example/')
    expect(redirectUriFor('http://localhost:5173')).toBe('http://localhost:5173/')
  })
})

describe('newState', () => {
  it('is long, hex, and different every time', () => {
    const a = newState()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(newState()).not.toBe(a)
  })
})

describe('startLogin', () => {
  it('keeps the state and goes to the authorize URL with the same state', () => {
    const assign = vi.fn()
    startLogin({ clientId: 'cid', origin: 'https://app.example', assign })
    const url = new URL(assign.mock.calls[0][0])
    const state = url.searchParams.get('state') ?? ''
    expect(state).toMatch(/^[0-9a-f]{32}$/)
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/')
    expect(takeOauthState(state)).toBe(true)
  })

  it('keeps the state where another tab of this browser can check it (not only in this tab)', () => {
    startLogin({ clientId: 'cid', origin: 'https://app.example', assign: vi.fn(), state: 'st1' })
    // 別のタブには sessionStorage が引き継がれない
    sessionStorage.clear()
    expect(takeOauthState('st1')).toBe(true)
  })
})

describe('hasCallback', () => {
  it.each([
    ['?code=c&state=s', true],
    ['?error=access_denied&state=s', true],
    ['?code=c', false],
    ['?state=s', false],
    ['', false],
    ['?utm=1', false],
  ])('%j -> %s', (search, expected) => {
    expect(hasCallback(search)).toBe(expected)
  })
})

describe('withoutCallback', () => {
  it('removes the login marks and keeps the rest of the address', () => {
    expect(withoutCallback('/', '?code=c&state=s', '')).toBe('/')
    expect(withoutCallback('/', '?error=access_denied&error_description=x&state=s', '#a')).toBe('/#a')
    expect(withoutCallback('/', '?x=1&code=c&state=s', '')).toBe('/?x=1')
  })
})

describe('completeLogin', () => {
  const ORIGIN = 'https://app.example'
  const ok = () => vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ access_token: 'TOKEN' }), { status: 200 }))

  it('checks the state, sends the code and the redirect URI to the function, and returns the token', async () => {
    rememberOauthState('st1')
    const fetchFn = ok()
    const result = await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn })
    expect(result).toEqual({ kind: 'token', token: 'TOKEN' })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('/api/annict-token')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ code: 'abc', redirectUri: 'https://app.example/' })
  })

  it('uses up the saved state, so the same return cannot be used twice', async () => {
    rememberOauthState('st1')
    await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn: ok() })
    const fetchFn = ok()
    const again = await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn })
    expect(again.kind).toBe('error')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('refuses a different state without calling the function', async () => {
    rememberOauthState('st1')
    const fetchFn = ok()
    const result = await completeLogin({ search: '?code=abc&state=other', origin: ORIGIN, fetchFn })
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('ログインの確認に失敗しました') })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('accepts either of two logins started in different tabs, each only once', async () => {
    rememberOauthState('st1')
    rememberOauthState('st2')
    expect((await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn: ok() })).kind).toBe('token')
    expect((await completeLogin({ search: '?code=abc&state=st2', origin: ORIGIN, fetchFn: ok() })).kind).toBe('token')
    expect((await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn: ok() })).kind).toBe('error')
  })

  it('refuses a state kept longer than 30 minutes ago', async () => {
    rememberOauthState('st1', Date.now() - 31 * 60 * 1000)
    const fetchFn = ok()
    const result = await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn })
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('ログインの確認に失敗しました') })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('keeps only the latest five states', () => {
    for (let i = 1; i <= 6; i++) rememberOauthState(`st${i}`)
    expect(takeOauthState('st1')).toBe(false)
    expect(takeOauthState('st2')).toBe(true)
    expect(takeOauthState('st6')).toBe(true)
  })

  it('ignores a broken saved value', () => {
    localStorage.setItem('animax.annictOauthStates', '{not json')
    expect(takeOauthState('st1')).toBe(false)
    rememberOauthState('st1')
    expect(takeOauthState('st1')).toBe(true)
  })

  it('refuses a return when this browser has no saved state (a link made by someone else)', async () => {
    const fetchFn = ok()
    const result = await completeLogin({ search: '?code=abc&state=anything', origin: ORIGIN, fetchFn })
    expect(result.kind).toBe('error')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('says it was cancelled on access_denied', async () => {
    rememberOauthState('st1')
    const fetchFn = ok()
    const result = await completeLogin({ search: '?error=access_denied&error_description=The+user+denied&state=st1', origin: ORIGIN, fetchFn })
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('キャンセル') })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('shows a generic error for another error from Annict', async () => {
    rememberOauthState('st1')
    const result = await completeLogin({ search: '?error=server_error&state=st1', origin: ORIGIN, fetchFn: ok() })
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('ログインに失敗しました') })
  })

  it.each([
    ['invalid_grant', 400, { error: 'invalid_grant' }, '有効期限'],
    ['server_not_configured', 500, { error: 'server_not_configured' }, 'まだ設定されていません'],
    ['an unknown error code', 502, { error: 'upstream_error' }, 'ログインに失敗しました'],
    ['a body without a token', 200, {}, 'ログインに失敗しました'],
  ])('shows a message for %s from the function', async (_name, status, body, text) => {
    rememberOauthState('st1')
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(body), { status }))
    const result = await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn })
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining(text) })
  })

  it('says the hand-off is not running when the function answers with something that is not JSON (404)', async () => {
    rememberOauthState('st1')
    const fetchFn = vi.fn(async () => new Response('<html>Not Found</html>', { status: 404 }))
    const result = await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn })
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('動いていません') })
  })

  it('says it could not connect when the request itself fails', async () => {
    rememberOauthState('st1')
    const fetchFn = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    const result = await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn })
    expect(result).toEqual({ kind: 'error', message: expect.stringContaining('接続できませんでした') })
  })

  it('does not return the token on a failure status even if the body has one', async () => {
    rememberOauthState('st1')
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ access_token: 'T', error: 'x' }), { status: 500 }))
    const result = await completeLogin({ search: '?code=abc&state=st1', origin: ORIGIN, fetchFn })
    expect(result.kind).toBe('error')
  })
})
