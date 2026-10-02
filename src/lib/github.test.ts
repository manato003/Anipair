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
