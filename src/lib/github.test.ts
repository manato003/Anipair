import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubError, checkAccess, formatJson, readJson, writeJson } from './github'

// 通信は偽物の fetch で受ける。実際の GitHub には触れない
const conn = { token: 'tok', repo: 'someone/their-data' }
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('github functions use the repository they are given', () => {
  it('readJson reads from that repository with that token', async () => {
    fetchMock.mockResolvedValue(reply(404))
    await readJson(conn, 'passes.json')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/someone/their-data/contents/passes.json')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('readJson decodes the content and returns the sha', async () => {
    fetchMock.mockResolvedValue(reply(200, { content: btoa('{"a":1}'), sha: 's1' }))
    expect(await readJson(conn, 'x.json')).toEqual({ value: { a: 1 }, sha: 's1' })
  })

  it('writeJson puts to that repository, with the sha when there is one', async () => {
    fetchMock.mockResolvedValue(reply(200))
    await writeJson({ token: 't', repo: 'other/data-2' }, 'backup.json', { v: 1 }, 'old', 'msg')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/other/data-2/contents/backup.json')
    expect(init?.method).toBe('PUT')
    const body = JSON.parse(init?.body as string)
    expect(body).toMatchObject({ message: 'msg', sha: 'old' })
    expect(atob(body.content)).toBe(formatJson({ v: 1 }))
  })

  it('checkAccess asks about that repository', async () => {
    fetchMock.mockResolvedValue(reply(200))
    await checkAccess(conn)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/someone/their-data')
  })

  it('checkAccess names the repository in the error when it cannot be seen', async () => {
    fetchMock.mockResolvedValue(reply(404))
    const err = await checkAccess(conn).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubError)
    expect((err as GitHubError).kind).toBe('auth')
    expect((err as GitHubError).message).toContain('someone/their-data')
  })

  it('checkAccess reports a rejected token as an auth error', async () => {
    fetchMock.mockResolvedValue(reply(401))
    await expect(checkAccess(conn)).rejects.toMatchObject({ kind: 'auth' })
  })
})

describe('403 is not always a bad token', () => {
  const reply403 = (headers: Record<string, string>, body: unknown = {}) => new Response(JSON.stringify(body), { status: 403, headers })

  it('treats a plain 403 as an auth error', async () => {
    fetchMock.mockResolvedValue(reply403({}, { message: 'Resource not accessible by personal access token' }))
    await expect(readJson(conn, 'x.json')).rejects.toMatchObject({ kind: 'auth' })
  })

  it.each([
    ['x-ratelimit-remaining is 0', { 'x-ratelimit-remaining': '0' }, {}],
    ['retry-after is present', { 'retry-after': '60' }, {}],
    ['the message says rate limit', {}, { message: 'API rate limit exceeded for user ID 1.' }],
    ['the message says secondary rate limit', {}, { message: 'You have exceeded a secondary rate limit.' }],
  ])('reports a usage limit as an api error (%s)', async (_label, headers, body) => {
    fetchMock.mockResolvedValue(reply403(headers, body))
    const err = await readJson(conn, 'x.json').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubError)
    expect((err as GitHubError).kind).toBe('api')
    expect((err as GitHubError).message).toContain('利用制限')
  })

  it('still treats a 403 with requests left as an auth error', async () => {
    fetchMock.mockResolvedValue(reply403({ 'x-ratelimit-remaining': '4999' }, { message: 'Forbidden' }))
    await expect(readJson(conn, 'x.json')).rejects.toMatchObject({ kind: 'auth' })
  })

  it('treats 429 as a usage limit, and 401 stays an auth error even with the limit headers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }))
    await expect(readJson(conn, 'x.json')).rejects.toMatchObject({ kind: 'api', message: expect.stringContaining('利用制限') })
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401, headers: { 'x-ratelimit-remaining': '0' } }))
    await expect(readJson(conn, 'x.json')).rejects.toMatchObject({ kind: 'auth' })
  })

  it('also covers writes and the access check', async () => {
    fetchMock.mockResolvedValue(reply403({ 'x-ratelimit-remaining': '0' }))
    await expect(writeJson(conn, 'x.json', {}, null, 'm')).rejects.toMatchObject({ kind: 'api' })
    await expect(checkAccess(conn)).rejects.toMatchObject({ kind: 'api' })
  })
})

