// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 間隔の待ちは無し（間隔と優先度そのものは throttle.test.ts で確かめている）。列に頼んだ回数だけ控える
const { scheduled } = vi.hoisted(() => ({ scheduled: { count: 0 } }))
vi.mock('./throttle', () => ({
  createThrottle:
    () =>
    <T,>(task: () => Promise<T>) => {
      scheduled.count++
      return task()
    },
}))

const { AnnictError, fetchViewer, scanMyReviews } = await import('./annict')
const { onAnnictAuthFailed } = await import('./authEvents')

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

beforeEach(() => {
  fetchMock.mockReset()
  scheduled.count = 0
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('gql: 401', () => {
  it('throws an auth error and tells the app-wide listeners which token failed', async () => {
    fetchMock.mockResolvedValue(json({}, 401))
    const heard: string[] = []
    const off = onAnnictAuthFailed((t) => heard.push(t))
    const err = await fetchViewer('bad-token').catch((e: unknown) => e)
    off()
    expect(err).toBeInstanceOf(AnnictError)
    expect((err as InstanceType<typeof AnnictError>).kind).toBe('auth')
    expect(heard).toEqual(['bad-token'])
  })

  it('does not notify for other failures', async () => {
    fetchMock.mockResolvedValue(json({}, 500))
    const heard: string[] = []
    const off = onAnnictAuthFailed((t) => heard.push(t))
    await expect(fetchViewer('t')).rejects.toThrow('HTTP 500')
    off()
    expect(heard).toEqual([])
  })
})

describe('gql: 429 (rack-attack)', () => {
  const viewer = { data: { viewer: { username: 'u', name: 'n' } } }

  it('waits for Retry-After seconds and sends again, scheduling each attempt on its own', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '4' })).mockResolvedValueOnce(json(viewer))
    const p = fetchViewer('t')
    await vi.advanceTimersByTimeAsync(3999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toEqual({ username: 'u', name: 'n' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 待つあいだ列を握らない: 1回ごとに列に並べ直している
    expect(scheduled.count).toBe(2)
  })

  it('waits 2 seconds when there is no header, and gives up after two retries', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(json({}, 429))
    const p = expect(fetchViewer('t')).rejects.toMatchObject({ kind: 'api', message: expect.stringContaining('利用制限') })
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    await p
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('scanMyReviews', () => {
  const review = (id: string, annictId: number, createdAt: string) => ({
    item: {
      __typename: 'Review',
      id,
      body: '',
      createdAt,
      work: { annictId },
      ratingOverallState: 'GOOD',
      ratingStoryState: null,
      ratingAnimationState: null,
      ratingMusicState: null,
      ratingCharacterState: null,
    },
  })
  const status = (createdAt: string) => ({ item: { __typename: 'Status', createdAt } })
  const page = (edges: unknown[], endCursor: string | null) =>
    json({ data: { viewer: { activities: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, edges } } } })

  const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init?.body as string) as { query: string; variables: { after: string | null } })

  it('asks for the newest first, and for createdAt on every kind of activity', async () => {
    fetchMock.mockResolvedValue(page([], null))
    await scanMyReviews('t')
    const { query } = sent()[0]
    expect(query).toContain('orderBy: {field: CREATED_AT, direction: DESC}')
    for (const type of ['Status', 'Record', 'MultipleRecord']) expect(query).toContain(`... on ${type} { createdAt }`)
  })

  it('without stopBefore it reads to the end, keeping the newest review per work and the newest time', async () => {
    fetchMock
      .mockResolvedValueOnce(page([status('2026-10-03T10:00:00Z'), review('R3', 1, '2026-10-03T09:00:00Z'), review('R2', 2, '2026-10-02T09:00:00Z')], 'c1'))
      .mockResolvedValueOnce(page([review('R1', 1, '2026-10-01T09:00:00Z'), status('2026-09-01T00:00:00Z')], null))
    const scan = await scanMyReviews('t')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sent()[1].variables.after).toBe('c1')
    expect(scan.newest).toBe('2026-10-03T10:00:00Z')
    expect([...scan.reviews].map(([id, r]) => `${id}:${r.id}`)).toEqual(['1:R3', '2:R2'])
  })

  it('stops at the first item older than stopBefore, even in the middle of a page, and does not read the next page', async () => {
    fetchMock.mockResolvedValueOnce(
      page(
        [
          review('R9', 1, '2026-10-03T10:00:00Z'),
          status('2026-10-03T09:00:00Z'),
          review('R8', 2, '2026-10-02T23:59:00Z'),
          // ここより古い項目は読まない
          review('R7', 3, '2026-10-01T00:00:00Z'),
        ],
        'c1',
      ),
    )
    const scan = await scanMyReviews('t', { stopBefore: '2026-10-02T12:00:00Z' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect([...scan.reviews.keys()]).toEqual([1, 2])
    expect(scan.newest).toBe('2026-10-03T10:00:00Z')
  })

  it('reads the next page while every item is still newer than stopBefore', async () => {
    fetchMock
      .mockResolvedValueOnce(page([status('2026-10-03T10:00:00Z'), status('2026-10-03T09:00:00Z')], 'c1'))
      .mockResolvedValueOnce(page([status('2026-10-02T13:00:00Z'), status('2026-10-02T01:00:00Z')], 'c2'))
    await scanMyReviews('t', { stopBefore: '2026-10-02T12:00:00Z' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns newest null when there is no activity at all', async () => {
    fetchMock.mockResolvedValue(page([], null))
    expect(await scanMyReviews('t')).toEqual({ reviews: new Map(), newest: null })
  })
})
