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

const { fetchUpcomingPrograms } = await import('./annict')
const { AnnictError, fetchLibrary, fetchRecentActivity, fetchWorkReviews, findMyEpisodeRecord, fetchSeasonWorks, fetchViewer, fetchWorkDetail, forgetLibrary, forgetShortCaches, scanMyReviews, updateStatus } = await import('./annict')
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
    await expect(fetchViewer('t', { fresh: true })).rejects.toMatchObject({ kind: 'api', message: expect.stringContaining('Annictから応答を受け取れませんでした（HTTP 502）') })
  })
})

describe('gql: 401', () => {
  it('throws an auth error and tells the app-wide listeners which token failed', async () => {
    fetchMock.mockResolvedValue(json({}, 401))
    const heard: string[] = []
    const off = onAnnictAuthFailed((t) => heard.push(t))
    const err = await fetchViewer('bad-token', { fresh: true }).catch((e: unknown) => e)
    off()
    expect(err).toBeInstanceOf(AnnictError)
    expect((err as InstanceType<typeof AnnictError>).kind).toBe('auth')
    expect(heard).toEqual(['bad-token'])
  })

  it('does not notify for other failures', async () => {
    fetchMock.mockResolvedValue(json({}, 500))
    const heard: string[] = []
    const off = onAnnictAuthFailed((t) => heard.push(t))
    await expect(fetchViewer('t', { fresh: true })).rejects.toThrow('HTTP 500')
    off()
    expect(heard).toEqual([])
  })
})

describe('gql: 429 (rack-attack)', () => {
  const viewer = { data: { viewer: { username: 'u', name: 'n' } } }

  it('waits for Retry-After seconds and sends again, scheduling each attempt on its own', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '4' })).mockResolvedValueOnce(json(viewer))
    const p = fetchViewer('t', { fresh: true })
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
    const p = expect(fetchViewer('t', { fresh: true })).rejects.toMatchObject({ kind: 'api', message: expect.stringContaining('利用制限') })
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
    const p = expect(fetchViewer('t', { fresh: true })).rejects.toMatchObject({ kind: 'timeout', message: expect.stringContaining('応答を受け取れませんでした') })
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
    await fetchViewer('t', { fresh: true })
    fetchMock.mockResolvedValueOnce(json({}, 401))
    await fetchViewer('t', { fresh: true }).catch(() => undefined)
    fetchMock.mockResolvedValueOnce(json({}, 502))
    await fetchViewer('t', { fresh: true }).catch(() => undefined)
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '1' })).mockResolvedValueOnce(json(viewer))
    const p = fetchViewer('t', { fresh: true })
    await vi.advanceTimersByTimeAsync(1000)
    await p
    expect(annictHealthSamples().map((x) => (x.ok ? 'ok' : `${x.failure} ${x.status ?? ''}`.trim()))).toEqual(['ok', 'ok', 'server 502', 'ok'])
  })

  it('records a connection failure and a read that never answered', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await fetchViewer('t', { fresh: true }).catch(() => undefined)
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(
      (_url, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    )
    const p = fetchViewer('t', { fresh: true }).catch(() => undefined)
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
  // 2026-10-13: 詳細は端末にも控える（開き直したとき・次の起動）。自分の状態は、この起動で読んだライブラリから入れ直す
  it('keeps a detail on the device, with the state taken from the library read in this launch', async () => {
    forgetLibrary()
    const lib = (state: string) =>
      json({ data: { viewer: { libraryEntries: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ status: { state, createdAt: null }, note: null, nextEpisode: null, work: { id: 'W1', annictId: 1, title: 't', malAnimeId: null, seasonYear: 2026, seasonName: 'AUTUMN', media: 'TV', watchersCount: 1, episodesCount: null, image: null } }] } } } })
    // ライブラリを読む前は、控えがあっても Annict から読む
    fetchMock.mockImplementation(async () => json(detail))
    await fetchWorkDetail('kept', 'W1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    forgetShortCaches()
    fetchMock.mockImplementationOnce(async () => lib('WATCHING'))
    await fetchLibrary('kept', { fresh: true })
    const kept = await fetchWorkDetail('kept', 'W1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(kept.viewerStatusState).toBe('WATCHING')
    // 状態を書いたあとは、ライブラリを読み直すまで控えを使わない
    fetchMock.mockImplementationOnce(async () => json({ data: { updateStatus: { work: { id: 'W1' } } } }))
    await updateStatus('kept', 'W1', 'WATCHED')
    await fetchWorkDetail('kept', 'W1')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    forgetLibrary()
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

describe('fetchWorkReviews', () => {
  it('asks for the reviews with a body, most liked first, drops ones without a writer or with a blank body, and does not read the same work again soon', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: {
          node: {
            satisfactionRate: 96.55,
            reviewsCount: 140,
            reviews: {
              nodes: [
                { annictId: 1, body: ' 良い ', createdAt: 'x', likesCount: 8, ratingOverallState: 'GREAT', user: { username: 'a', name: 'A' } },
                { annictId: 2, body: '退会', createdAt: 'x', likesCount: 3, ratingOverallState: 'GOOD', user: null },
                { annictId: 3, body: '   ', createdAt: 'x', likesCount: 1, ratingOverallState: null, user: { username: 'c', name: 'C' } },
              ],
            },
          },
        },
      }),
    )
    const got = await fetchWorkReviews('t', 'W-reviews')
    expect(got).toEqual({ satisfactionRate: 96.55, reviewsCount: 140, reviews: [{ annictId: 1, body: '良い', createdAt: 'x', likesCount: 8, rating: 'GREAT', user: { username: 'a', name: 'A' } }] })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.query).toContain('hasBody: true')
    expect(body.query).toContain('LIKES_COUNT')
    await fetchWorkReviews('t', 'W-reviews')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('findMyEpisodeRecord', () => {
  const page = (nodes: { id: string; ratingState: string | null; episode: { id: string } | null }[], next: string | null) =>
    json({ data: { viewer: { records: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes } } } })

  it('reads my records newest first, page by page, and returns the newest one of that episode with its rating', async () => {
    fetchMock
      .mockResolvedValueOnce(page([{ id: 'R9', ratingState: 'GOOD', episode: { id: 'E9' } }], 'c1'))
      .mockResolvedValueOnce(page([{ id: 'R2', ratingState: 'GREAT', episode: { id: 'E2' } }, { id: 'R1', ratingState: null, episode: { id: 'E2' } }], 'c2'))
    expect(await findMyEpisodeRecord('t', 'E2')).toEqual({ id: 'R2', rating: 'GREAT' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).variables).toEqual({ after: 'c1' })
  })

  it('gives up at the end of my records or after the page limit', async () => {
    fetchMock.mockResolvedValueOnce(page([{ id: 'R9', ratingState: 'GOOD', episode: { id: 'E9' } }], null))
    expect(await findMyEpisodeRecord('t', 'E2')).toBeNull()
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => page([{ id: 'R9', ratingState: 'GOOD', episode: { id: 'E9' } }], 'more'))
    expect(await findMyEpisodeRecord('t', 'E2', 3)).toBeNull()
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
    { status: { state: 'WATCHED', createdAt: '2026-10-01T00:00:00Z' }, note: ' 見返したい ', nextEpisode: null, work: { id: 'W1', annictId: 1, title: '作品1', malAnimeId: null, seasonYear: 2026, seasonName: 'AUTUMN', media: 'TV', watchersCount: 10, image: null } },
  ] } } } }

  it('reads the Annict note of each entry with the library (trimmed; blank is no note)', async () => {
    forgetLibrary()
    fetchMock.mockResolvedValue(json(page))
    const [e] = await fetchLibrary('note-token', { fresh: true })
    expect(e.note).toBe('見返したい')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).query).toContain('note')
  })

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

// 放送予定（Issue #32）: 始まりから順に読み、これから先の分に届いたら止める。過ぎた分・再放送・28日より先は外す
describe('fetchUpcomingPrograms', () => {
  const NOW = new Date('2026-10-13T03:00:00Z')
  const prog = (at: string, ch = 'dアニメストア', rebroadcast = false) => ({ startedAt: at, rebroadcast, channel: { name: ch, channelGroup: { name: '動画サービス' } } })
  it('pages until the schedule passes the horizon, and keeps only upcoming first runs', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ data: { nodes: [{ id: 'W1', programs: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [prog('2026-10-02T15:00:00Z'), prog('2026-10-09T15:00:00Z')] } }] } }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            node: {
              programs: {
                pageInfo: { hasNextPage: true, endCursor: 'c2' },
                nodes: [prog('2026-10-16T15:00:00Z'), prog('2026-10-16T15:00:00Z', 'TOKYO MX', true), prog('2026-12-31T15:00:00Z')],
              },
            },
          },
        }),
      )
    const got = await fetchUpcomingPrograms('tok', ['W1'], NOW)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).variables).toEqual({ id: 'W1', after: 'c1' })
    expect(got.get('W1')).toEqual({ slots: [{ at: '2026-10-16T15:00:00Z', ch: 'dアニメストア', g: '動画サービス' }], complete: true })
  })

  // #34: 過去の予定が多い作品（長く続く作品）は、始まりから8ページで届かない。終わりの側から読み、届かなければ読み切れなかったと返す
  it('reads from the end when the start does not reach today, and says when it could not read everything', async () => {
    const past = (cursor: string) => ({ pageInfo: { hasNextPage: true, endCursor: cursor }, nodes: [prog('2020-01-01T00:00:00Z')] })
    const asked: string[] = []
    fetchMock.mockImplementation(async (_url, init) => {
      const q = JSON.parse(String(init?.body)).query as string
      asked.push(q.includes('DESC') ? 'DESC' : 'ASC')
      if (q.includes('nodes(ids')) return json({ data: { nodes: [{ id: 'W1', programs: past('a0') }] } })
      if (q.includes('DESC')) {
        const first = asked.filter((d) => d === 'DESC').length === 1
        return json({ data: { node: { programs: first ? { pageInfo: { hasNextPage: true, endCursor: 'd1' }, nodes: [prog('2026-12-31T15:00:00Z'), prog('2026-10-20T15:00:00Z')] } : { pageInfo: { hasNextPage: true, endCursor: 'd2' }, nodes: [prog('2026-10-12T15:00:00Z')] } } } })
      }
      return json({ data: { node: { programs: past('a') } } })
    })
    const got = await fetchUpcomingPrograms('tok', ['W1'], NOW)
    expect(asked.filter((d) => d === 'ASC')).toHaveLength(8)
    expect(got.get('W1')).toEqual({ slots: [{ at: '2026-10-20T15:00:00Z', ch: 'dアニメストア', g: '動画サービス' }], complete: true })

    // 終わりの側からも届かない
    asked.length = 0
    fetchMock.mockImplementation(async (_url, init) => {
      const q = JSON.parse(String(init?.body)).query as string
      asked.push(q.includes('DESC') ? 'DESC' : 'ASC')
      if (q.includes('nodes(ids')) return json({ data: { nodes: [{ id: 'W1', programs: past('a0') }] } })
      return json({ data: { node: { programs: q.includes('DESC') ? { pageInfo: { hasNextPage: true, endCursor: 'd' }, nodes: [prog('2027-06-01T00:00:00Z')] } : past('a') } } })
    })
    expect((await fetchUpcomingPrograms('tok', ['W1'], NOW)).get('W1')?.complete).toBe(false)
  })
})

// 自分の情報は1回の起動で1回だけ読む（起動の確かめと設定の「連携中」）。fresh なら必ず読む。失敗は控えない
describe('fetchViewer: once per launch', () => {
  it('reuses the answer for the same token, reads again when fresh, and does not keep a failure', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 502))
    await expect(fetchViewer('once')).rejects.toBeTruthy()
    fetchMock.mockImplementation(async () => json({ data: { viewer: { annictId: 1, username: 'me', name: 'Me' } } }))
    expect((await fetchViewer('once')).username).toBe('me')
    await fetchViewer('once')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await fetchViewer('once', { fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

