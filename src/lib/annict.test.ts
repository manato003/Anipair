// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 間隔の待ちは無し（間隔と優先度そのものは throttle.test.ts で確かめている）。列に頼んだ回数と、そのときの指定を控える
const { scheduled } = vi.hoisted(() => ({ scheduled: { count: 0, opts: [] as unknown[] } }))
vi.mock('./throttle', () => ({
  createThrottle:
    () =>
    <T,>(task: () => Promise<T>, opts?: unknown) => {
      scheduled.count++
      scheduled.opts.push(opts)
      return task()
    },
}))

const { AnnictError, fetchLibrary, fetchRecentActivity, fetchSeasonWorks, fetchViewer, fetchWorkDetail, forgetLibrary, forgetShortCaches, scanMyReviews, updateStatus } = await import('./annict')
const { onAnnictAuthFailed } = await import('./authEvents')
const { annictHealthSamples, resetAnnictHealth } = await import('./annictHealth')

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

beforeEach(() => {
  fetchMock.mockReset()
  scheduled.count = 0
  scheduled.opts.length = 0
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('gql: Annict server errors', () => {
  it('says in words that Annict seems busy or down on 5xx', async () => {
    fetchMock.mockResolvedValue(json({}, 502))
    await expect(fetchViewer('t')).rejects.toMatchObject({ kind: 'api', message: expect.stringContaining('Annict のサーバーが混み合っているか、止まっているようです（HTTP 502）') })
  })
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

describe('gql: reads time out, writes run alone', () => {
  it('gives up a read after 90 seconds without an answer, and does not send it again by itself', async () => {
    vi.useFakeTimers()
    // 答えを返さず、止められたら断る（ブラウザの fetch と同じ）
    fetchMock.mockImplementation(
      (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    )
    const p = expect(fetchViewer('t')).rejects.toMatchObject({ kind: 'timeout', message: expect.stringContaining('混み合っている') })
    // 20 秒では切らない（Annict が重い日は、ライブラリの1ページに 24.6 秒かかった）
    await vi.advanceTimersByTimeAsync(89_999)
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 読み込みは重ねてよい
    expect(scheduled.opts[0]).toMatchObject({ exclusive: false })
  })

  it('sends a write without a time limit and asks the queue to run it alone', async () => {
    fetchMock.mockResolvedValue(json({ data: { updateStatus: { work: { id: 'W1' } } } }))
    await updateStatus('t', 'W1', 'WATCHED')
    expect(fetchMock.mock.calls[0][1]?.signal ?? null).toBeNull()
    expect(scheduled.opts[0]).toMatchObject({ exclusive: true })
  })
})

describe('gql: what it tells the Annict health record', () => {
  const viewer = { data: { viewer: { username: 'u', name: 'n' } } }
  beforeEach(() => resetAnnictHealth())

  it('records answers (even 401) as answered, 5xx as a server failure with its status, and leaves 429 out', async () => {
    fetchMock.mockResolvedValueOnce(json(viewer))
    await fetchViewer('t')
    fetchMock.mockResolvedValueOnce(json({}, 401))
    await fetchViewer('t').catch(() => undefined)
    fetchMock.mockResolvedValueOnce(json({}, 502))
    await fetchViewer('t').catch(() => undefined)
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '1' })).mockResolvedValueOnce(json(viewer))
    const p = fetchViewer('t')
    await vi.advanceTimersByTimeAsync(1000)
    await p
    expect(annictHealthSamples().map((x) => (x.ok ? 'ok' : `${x.failure} ${x.status ?? ''}`.trim()))).toEqual(['ok', 'ok', 'server 502', 'ok'])
  })

  it('records a connection failure and a read that never answered', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await fetchViewer('t').catch(() => undefined)
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(
      (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    )
    const p = fetchViewer('t').catch(() => undefined)
    await vi.advanceTimersByTimeAsync(90_000)
    await p
    expect(annictHealthSamples().map((x) => x.failure)).toEqual(['network', 'timeout'])
    expect(annictHealthSamples()[1].ms).toBe(90_000)
  })
})

describe('short caches: not reading the same thing again right away', () => {
  const work = (state: string) => ({ id: 'W1', annictId: 1, title: 't', media: 'TV', malAnimeId: null, watchersCount: 1, viewerStatusState: state, image: null })
  const detail = { data: { node: { id: 'W1', annictId: 1, title: 't', titleKana: null, media: 'TV', seasonYear: 2026, seasonName: 'AUTUMN', malAnimeId: null, watchersCount: 1, viewerStatusState: 'NO_STATE', episodesCount: 12, officialSiteUrl: null, wikipediaUrl: null, twitterUsername: null, image: null, seriesList: null, casts: { nodes: [] }, staffs: { nodes: [] } } } }
  beforeEach(() => forgetShortCaches())
  afterEach(() => localStorage.clear())

  it('reads a cour once for five minutes, follows a status change, and reads again when asked fresh', async () => {
    fetchMock.mockImplementation(async () => json({ data: { searchWorks: { nodes: [work('NO_STATE')] } } }))
    await fetchSeasonWorks('t', '2026-autumn')
    const again = await fetchSeasonWorks('t', '2026-autumn')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(again[0].viewerStatusState).toBe('NO_STATE')
    fetchMock.mockImplementationOnce(async () => json({ data: { updateStatus: { work: { id: 'W1' } } } }))
    await updateStatus('t', 'W1', 'WATCHED')
    // 書いた状態に合わせて直している（読み直さない）
    expect((await fetchSeasonWorks('t', '2026-autumn'))[0].viewerStatusState).toBe('WATCHED')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await fetchSeasonWorks('t', '2026-autumn', undefined, { fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // 別のアカウントでは使い回さない
    await fetchSeasonWorks('other', '2026-autumn')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('reads a work detail once while it is kept, drops it after a status change, and does not keep a failure', async () => {
    fetchMock.mockImplementation(async () => json(detail))
    await fetchWorkDetail('t', 'W1')
    await fetchWorkDetail('t', 'W1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockImplementationOnce(async () => json({ data: { updateStatus: { work: { id: 'W9' } } } }))
    await updateStatus('t', 'W9', 'WATCHED')
    await fetchWorkDetail('t', 'W1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    fetchMock.mockImplementationOnce(async () => json({}, 502))
    await expect(fetchWorkDetail('t', 'W2')).rejects.toThrow('HTTP 502')
    await fetchWorkDetail('t', 'W2')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})

describe('fetchRecentActivity', () => {
  it('returns my reviews (with the work) and episode records newer than the given time, stopping at the first older item', async () => {
    const axes = { ratingOverallState: 'GOOD', ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
    fetchMock.mockResolvedValueOnce(
      json({
        data: {
          viewer: {
            activities: {
              pageInfo: { hasNextPage: true, endCursor: 'c1' },
              edges: [
                { item: { __typename: 'Record', id: 'REC1', createdAt: '2026-10-06T05:10:00Z', episode: { id: 'E1' } } },
                { item: { __typename: 'Status', createdAt: '2026-10-06T05:09:00Z' } },
                { item: { __typename: 'Review', id: 'RV1', body: '', createdAt: '2026-10-06T05:08:00Z', work: { id: 'W1' }, ...axes } },
                { item: { __typename: 'Review', id: 'OLD', body: '', createdAt: '2026-10-06T04:00:00Z', work: { id: 'W2' }, ...axes } },
              ],
            },
          },
        },
      }),
    )
    const got = await fetchRecentActivity('t', Date.parse('2026-10-06T05:00:00Z'))
    expect(got.records).toEqual([{ id: 'REC1', episodeId: 'E1', createdAt: '2026-10-06T05:10:00Z' }])
    expect(got.reviews.map((r) => [r.workId, r.review.id, r.review.ratingOverallState])).toEqual([['W1', 'RV1', 'GOOD']])
    // 古い項目まで来たので、次のページは読まない
    expect(fetchMock).toHaveBeenCalledTimes(1)
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

  const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init?.body as string) as { query: string; variables: { after: string | null; first: number } })

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

  // 記録の多い人（アクティビティ約8,000件）で、最後まで読むのが24秒から6秒台になった（2026-10-06 実測）。差分はふつう1ページで済む
  it('reads 500 a page when reading to the end, and 100 a page for the difference', async () => {
    fetchMock.mockResolvedValueOnce(page([], null)).mockResolvedValueOnce(page([], null))
    await scanMyReviews('t')
    await scanMyReviews('t', { stopBefore: '2026-10-02T12:00:00Z' })
    expect(sent().map((x) => x.variables.first)).toEqual([500, 100])
  })

  it('returns newest null when there is no activity at all', async () => {
    fetchMock.mockResolvedValue(page([], null))
    expect(await scanMyReviews('t')).toEqual({ reviews: new Map(), newest: null })
  })
})

describe('fetchLibrary: one read for screens that ask together', () => {
  const page = { data: { viewer: { libraryEntries: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [
    { status: { state: 'WATCHED', createdAt: '2026-10-01T00:00:00Z' }, nextEpisode: null, work: { id: 'W1', annictId: 1, title: '作品1', malAnimeId: null, seasonYear: 2026, seasonName: 'AUTUMN', media: 'TV', watchersCount: 10, image: null } },
  ] } } } }

  it('shares one read between callers at the same time and within a minute, and reads again after a status change or when asked fresh', async () => {
    forgetLibrary()
    fetchMock.mockImplementation(async (_url, init) => (String(init?.body).includes('updateStatus') ? json({ data: { updateStatus: { work: { id: 'W1' } } } }) : json(page)))
    const [a, b] = await Promise.all([fetchLibrary('t'), fetchLibrary('t')])
    expect(a.map((e) => e.annictId)).toEqual([1])
    expect(b).toEqual(a)
    await fetchLibrary('t')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await fetchLibrary('t', { fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await updateStatus('t', 'W1', 'WATCHING')
    await fetchLibrary('t')
    // 状態を変えたあとは読み直す（読み込み2回 + 書き込み1回 + 読み込み1回）
    expect(fetchMock).toHaveBeenCalledTimes(4)
    // 別のトークン（別の人）では使い回さない
    await fetchLibrary('other')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    forgetLibrary()
  })

  // 2026-10-06 の点検: 読み込みのページの合間に状態を書くと、書く前の中身が1分間使い回され、端末の控えにも残っていた
  it('does not keep a read that was under way when a status was written', async () => {
    forgetLibrary()
    localStorage.clear()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let reads = 0
    fetchMock.mockImplementation(async (_url, init) => {
      if (String(init?.body).includes('updateStatus')) return json({ data: { updateStatus: { work: { id: 'W1' } } } })
      reads++
      if (reads === 1) await gate
      return json(page)
    })
    const during = fetchLibrary('t')
    // 読み込みの途中で書いた
    forgetLibrary()
    release()
    expect((await during).map((e) => e.annictId)).toEqual([1])
    expect(localStorage.getItem('animax.library.v1')).toBeNull()
    // 使い回さず、読み直す
    await fetchLibrary('t')
    expect(reads).toBe(2)
    forgetLibrary()
  })
})
