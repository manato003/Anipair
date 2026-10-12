import { describe, expect, it, vi } from 'vitest'
import { DAILY_LIMIT, FROM_USERS_LABEL, MAX_BODY, defuse, handleFeedback, issueOf, parseFeedback, type FeedbackEnv } from '../api/feedback'

const ENV: FeedbackEnv = { FEEDBACK_GITHUB_TOKEN: 'tok', FEEDBACK_REPO: 'owner/private-repo' }
const GOOD = { kind: 'bug', body: '記録の一覧で表紙が出ません。', contact: '@someone_x', device: 'Anipair 0.15.1 / iPhone Safari' }

function req(body: unknown, init: { method?: string; origin?: string | null; raw?: string } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const origin = init.origin === undefined ? 'https://app.example' : init.origin
  if (origin) headers.Origin = origin
  return new Request('https://app.example/api/feedback', {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' ? undefined : (init.raw ?? JSON.stringify(body)),
  })
}

// GitHub の作り物: 一覧（この24時間の問い合わせ）は recent 件を返し、作成は status を返す
function github(status = 201, recent = 0) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (_url, init) =>
    init.method === 'GET'
      ? new Response(JSON.stringify(Array.from({ length: recent }, () => ({ created_at: new Date().toISOString() }))), { status: 200 })
      : new Response('{}', { status }),
  )
}
const created = (fetchFn: ReturnType<typeof github>) => fetchFn.mock.calls.filter(([, init]) => init.method === 'POST')

describe('handleFeedback', () => {
  it('creates an issue in the configured repository with the server-side token', async () => {
    const fetchFn = github()
    const res = await handleFeedback(req(GOOD), ENV, fetchFn)
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const [url, init] = created(fetchFn)[0]
    expect(url).toBe('https://api.github.com/repos/owner/private-repo/issues')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const sent = JSON.parse(init.body as string) as { title: string; body: string; labels: string[] }
    expect(sent.title).toBe('[不具合] 記録の一覧で表紙が出ません。')
    expect(sent.labels).toEqual([FROM_USERS_LABEL, '不具合'])
    // 返信先の @ は、GitHub の誰かへの通知にならない
    expect(sent.body).not.toContain('@someone_x')
    expect(sent.body).toContain('```text\n記録の一覧で表紙が出ません。\n```')
  })

  it('refuses requests that do not come from the site itself', async () => {
    const fetchFn = github()
    expect((await handleFeedback(req(GOOD, { origin: 'https://evil.example' }), ENV, fetchFn)).status).toBe(403)
    expect((await handleFeedback(req(GOOD, { origin: null }), ENV, fetchFn)).status).toBe(403)
    expect((await handleFeedback(req(GOOD, { method: 'GET' }), ENV, fetchFn)).status).toBe(405)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('says it is not ready when the token or the repository is missing, without saying which', async () => {
    for (const env of [{}, { FEEDBACK_GITHUB_TOKEN: 'tok' }, { FEEDBACK_REPO: 'owner/repo' }, { FEEDBACK_GITHUB_TOKEN: 'tok', FEEDBACK_REPO: 'not a repo' }]) {
      const res = await handleFeedback(req(GOOD), env, github())
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'not_configured' })
    }
  })

  it('stops creating issues once the day has its share, whoever sends them', async () => {
    const fetchFn = github(201, DAILY_LIMIT)
    const res = await handleFeedback(req(GOOD), ENV, fetchFn)
    expect(res.status).toBe(429)
    expect(created(fetchFn)).toHaveLength(0)
    expect(fetchFn.mock.calls[0][0]).toContain(encodeURIComponent(FROM_USERS_LABEL))
  })

  it('refuses, without creating anything, when the count cannot be read', async () => {
    const fetchFn = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (_url, init) =>
      init.method === 'GET' ? new Response('oops', { status: 500 }) : new Response('{}', { status: 201 }),
    )
    expect((await handleFeedback(req(GOOD), ENV, fetchFn)).status).toBe(502)
    expect(fetchFn.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
  })

  it('pretends to accept what a bot filled into the hidden field, and sends nothing', async () => {
    const fetchFn = github()
    const res = await handleFeedback(req({ ...GOOD, website: 'http://spam.example' }), ENV, fetchFn)
    expect(res.status).toBe(201)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejects broken or oversized input', async () => {
    const fetchFn = github()
    expect((await handleFeedback(req(null, { raw: '{not json' }), ENV, fetchFn)).status).toBe(400)
    expect((await handleFeedback(req({ ...GOOD, kind: 'spam' }), ENV, fetchFn)).status).toBe(400)
    expect((await handleFeedback(req({ ...GOOD, body: 'x'.repeat(MAX_BODY + 1) }), ENV, fetchFn)).status).toBe(400)
    expect((await handleFeedback(req(null, { raw: JSON.stringify({ ...GOOD, body: 'x'.repeat(20_000) }) }), ENV, fetchFn)).status).toBe(413)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('reports a GitHub failure as an upstream error', async () => {
    expect((await handleFeedback(req(GOOD), ENV, github(401))).status).toBe(502)
    const down = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
      throw new Error('offline')
    })
    expect((await handleFeedback(req(GOOD), ENV, down)).status).toBe(502)
  })
})

describe('parseFeedback and issueOf', () => {
  it('requires a known kind and a body of a sensible length, and keeps the optional fields to one line', () => {
    expect(parseFeedback({ kind: 'question', body: '短い' })).toBeNull()
    // 種類は決めた4つだけ（オブジェクトが継承している名前は通さない）
    for (const kind of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) expect(parseFeedback({ kind, body: '質問があります' })).toBeNull()
    expect(parseFeedback({ kind: 'question', body: '  質問があります  ', contact: '', device: null })).toEqual({ kind: 'question', body: '質問があります', contact: null, device: null })
    expect(parseFeedback({ kind: 'idea', body: '要望があります', contact: 'a\nb' })?.contact).toBe('a b')
    expect(parseFeedback({ kind: 'idea', body: '要望があります', contact: 'x'.repeat(101) })).toBeNull()
    expect(parseFeedback({ kind: 'idea', body: '要望があります', device: 3 })).toBeNull()
  })

  it('keeps everything the user wrote inside code blocks, including the reply address and device', () => {
    const input = parseFeedback({ kind: 'bug', body: '表紙が出ません', contact: '[押して](https://evil.example) ![x](https://t.example/p.png)', device: '# 見出し' })!
    const { body } = issueOf(input)
    const outside = body.replace(/(`{3,})text\n[\s\S]*?\n\1/g, '')
    expect(outside).not.toContain('evil.example')
    expect(outside).not.toContain('t.example')
    expect(outside).not.toContain('# 見出し')
    expect(body).toContain('返信先: [押して](https://evil.example)')
  })

  it('keeps the body from becoming links, mentions or references, even when it contains backticks', () => {
    const input = parseFeedback({ kind: 'other', body: '```\n@everyone see #12\n```' })!
    const { body, title } = issueOf(input)
    expect(body).toContain('````text')
    expect(body).not.toMatch(/@everyone/)
    expect(body).not.toMatch(/#12/)
    expect(title.startsWith('[その他] ')).toBe(true)
  })

  it('defuse breaks mentions and issue references with an invisible character', () => {
    expect(defuse('@a #1 #x')).toBe('@​a #​1 #x')
  })
})

// 2026-10-13 のコードレビュー #31: 本文を全部読んでから文字数で見ていた。バイト数で、読みながら打ち切る
describe('handleFeedback reads at most 16 KB of the body', () => {
  const streamed = (bytes: Uint8Array) =>
    new Request('https://app.example/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.example' },
      body: new ReadableStream({
        start(c) {
          for (let i = 0; i < bytes.length; i += 4096) c.enqueue(bytes.slice(i, i + 4096))
          c.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)

  it('refuses a body over the limit counted in bytes (Japanese text is 3 bytes a character)', async () => {
    const fetchFn = github()
    const body = JSON.stringify({ ...GOOD, body: 'あ'.repeat(6000) })
    expect(body.length).toBeLessThan(16 * 1024)
    const res = await handleFeedback(req(null, { raw: body }), ENV, fetchFn)
    expect(res.status).toBe(413)
    expect(created(fetchFn)).toHaveLength(0)
  })

  it('stops reading a body without Content-Length once it passes the limit', async () => {
    const res = await handleFeedback(streamed(new TextEncoder().encode('x'.repeat(200 * 1024))), ENV, github())
    expect(res.status).toBe(413)
  })
})
