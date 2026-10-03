// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyReview, ReviewScan } from './annict'

vi.mock('./annict', async (orig) => ({
  ...(await orig<typeof import('./annict')>()),
  scanMyReviews: vi.fn(),
}))

const { scanMyReviews } = await import('./annict')
const { FULL_READ_INTERVAL_MS, SYNC_MARGIN_MS, getMyReviews, parseReviewsSnapshot, refreshMyReviews, rememberReview, resetMyReviewsMemory } =
  await import('./myReviews')
const { loadReviewsRaw, saveAnnictToken, saveReviewsRaw } = await import('./storage')

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-03T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString()

const review = (id: string, createdAt: string, overall: MyReview['ratingOverallState'] = 'GOOD'): MyReview => ({
  id,
  body: '',
  createdAt,
  ratingOverallState: overall,
  ratingStoryState: null,
  ratingAnimationState: null,
  ratingMusicState: null,
  ratingCharacterState: null,
})
const scan = (reviews: [number, MyReview][], newest: string | null): ReviewScan => ({ reviews: new Map(reviews), newest })

const scanMock = vi.mocked(scanMyReviews)
const snapshot = () => parseReviewsSnapshot(loadReviewsRaw())

// 端末に控えがある状態を作る
function seed(opts: { fullAgoMs?: number; syncedThrough?: string; reviews?: [number, MyReview][] } = {}) {
  saveReviewsRaw({
    v: 1,
    syncedThrough: opts.syncedThrough ?? iso(-DAY),
    fullAt: iso(-(opts.fullAgoMs ?? DAY)),
    reviews: opts.reviews ?? [[1, review('R1', iso(-3 * DAY))]],
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  saveAnnictToken('tok')
  resetMyReviewsMemory()
  scanMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('parseReviewsSnapshot', () => {
  const good = { v: 1, syncedThrough: iso(0), fullAt: iso(0), reviews: [[1, review('R1', iso(0))]] }

  it('accepts a well-formed snapshot', () => {
    expect(parseReviewsSnapshot(good)?.reviews).toEqual([[1, review('R1', iso(0))]])
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['another version', { ...good, v: 2 }],
    ['a bad syncedThrough', { ...good, syncedThrough: 'x' }],
    ['a missing fullAt', { ...good, fullAt: undefined }],
    ['reviews not an array', { ...good, reviews: {} }],
    ['a bad work id', { ...good, reviews: [[0, review('R1', iso(0))]] }],
    ['a duplicated work id', { ...good, reviews: [[1, review('R1', iso(0))], [1, review('R2', iso(0))]] }],
    ['a review without an id', { ...good, reviews: [[1, { ...review('R1', iso(0)), id: '' }]] }],
    ['an unknown rating', { ...good, reviews: [[1, { ...review('R1', iso(0)), ratingOverallState: 'AMAZING' }]] }],
    ['one broken entry among good ones', { ...good, reviews: [[1, review('R1', iso(0))], [2, 'x']] }],
  ])('rejects the whole snapshot for %s', (_label, value) => {
    expect(parseReviewsSnapshot(value)).toBeNull()
  })
})

describe('first read (no snapshot)', () => {
  it('walks everything, then saves the snapshot with the newest time and the time of the full walk', async () => {
    scanMock.mockResolvedValueOnce(scan([[1, review('R1', iso(-5 * DAY))]], iso(-60_000)))
    const map = await getMyReviews('tok')
    expect(scanMock).toHaveBeenCalledTimes(1)
    expect(scanMock).toHaveBeenCalledWith('tok')
    expect(map.get(1)?.id).toBe('R1')
    expect(snapshot()).toEqual({ v: 1, syncedThrough: iso(-60_000), fullAt: iso(0), reviews: [[1, review('R1', iso(-5 * DAY))]] })
  })

  it('uses the epoch as syncedThrough when there is no activity at all', async () => {
    scanMock.mockResolvedValueOnce(scan([], null))
    await getMyReviews('tok')
    expect(snapshot()?.syncedThrough).toBe(new Date(0).toISOString())
  })

  it('ignores a corrupted stored value and walks everything', async () => {
    localStorage.setItem('animax.reviews.v1', '{"v":1,"syncedThrough":"nope"')
    scanMock.mockResolvedValueOnce(scan([[2, review('R2', iso(-DAY))]], iso(-DAY)))
    const map = await getMyReviews('tok')
    expect(scanMock).toHaveBeenCalledWith('tok')
    expect([...map.keys()]).toEqual([2])
    expect(snapshot()).not.toBeNull()
  })

  it('ignores a snapshot that has the right shape but belongs to nobody who is logged in', async () => {
    seed()
    saveAnnictToken(null)
    seed()
    scanMock.mockResolvedValueOnce(scan([], null))
    await getMyReviews('tok')
    expect(scanMock).toHaveBeenCalledWith('tok')
  })
})

describe('incremental read', () => {
  it('stops at syncedThrough minus the safety margin, and merges new reviews over the saved ones', async () => {
    seed({
      syncedThrough: iso(-DAY),
      reviews: [
        [1, review('R1', iso(-3 * DAY), 'BAD')],
        [2, review('R2', iso(-2 * DAY))],
      ],
    })
    scanMock.mockResolvedValueOnce(scan([[1, review('R9', iso(-60_000), 'GREAT')], [3, review('R3', iso(-120_000))]], iso(-30_000)))
    const map = await getMyReviews('tok')

    expect(scanMock).toHaveBeenCalledWith('tok', { stopBefore: iso(-DAY - SYNC_MARGIN_MS) })
    // 新しい感想が古いものに勝ち、読んでいない範囲の感想は残る
    expect(map.get(1)).toMatchObject({ id: 'R9', ratingOverallState: 'GREAT' })
    expect(map.get(2)?.id).toBe('R2')
    expect(map.get(3)?.id).toBe('R3')
    expect(snapshot()).toMatchObject({ syncedThrough: iso(-30_000), fullAt: iso(-DAY) })
    expect(snapshot()?.reviews).toHaveLength(3)
  })

  it('does not let an older review in the overlap replace a newer one, but refreshes the same review', async () => {
    seed({
      syncedThrough: iso(-DAY),
      reviews: [
        [1, review('NEW', iso(-DAY + 1000), 'GOOD')],
        [2, review('SAME', iso(-DAY), 'GOOD')],
      ],
    })
    scanMock.mockResolvedValueOnce(
      scan([[1, review('OLD', iso(-DAY - 1000), 'BAD')], [2, review('SAME', iso(-DAY), 'GREAT')]], iso(-DAY + 1000)),
    )
    const map = await getMyReviews('tok')
    expect(map.get(1)?.id).toBe('NEW')
    expect(map.get(2)).toMatchObject({ id: 'SAME', ratingOverallState: 'GREAT' })
  })

  it('never moves syncedThrough back', async () => {
    seed({ syncedThrough: iso(-DAY) })
    scanMock.mockResolvedValueOnce(scan([], iso(-2 * DAY)))
    await getMyReviews('tok')
    expect(snapshot()?.syncedThrough).toBe(iso(-DAY))
  })

  it('reads only the difference on a later refresh in the same session, from memory if the storage was lost', async () => {
    scanMock.mockResolvedValueOnce(scan([[1, review('R1', iso(-DAY))]], iso(-DAY)))
    await getMyReviews('tok')
    localStorage.removeItem('animax.reviews.v1')
    scanMock.mockResolvedValueOnce(scan([[2, review('R2', iso(-1000))]], iso(-1000)))
    const map = await refreshMyReviews('tok')
    expect(scanMock).toHaveBeenLastCalledWith('tok', { stopBefore: iso(-DAY - SYNC_MARGIN_MS) })
    expect([...map.keys()].sort()).toEqual([1, 2])
  })

  it('keeps using the loaded reviews when a refresh fails', async () => {
    seed()
    scanMock.mockResolvedValueOnce(scan([], iso(-DAY)))
    const first = await getMyReviews('tok')
    scanMock.mockRejectedValueOnce(new Error('offline'))
    await expect(refreshMyReviews('tok')).rejects.toThrow('offline')
    // 失敗しても、読み込み済みの控えは捨てない
    expect(await getMyReviews('tok')).toBe(first)
    expect(scanMock).toHaveBeenCalledTimes(2)
  })

  it('forgets a failed first read so that the next call tries again', async () => {
    scanMock.mockRejectedValueOnce(new Error('offline'))
    await expect(getMyReviews('tok')).rejects.toThrow('offline')
    scanMock.mockResolvedValueOnce(scan([], null))
    await expect(getMyReviews('tok')).resolves.toEqual(new Map())
  })
})

describe('full read', () => {
  it('reads everything again once the last full walk is 7 days old, and drops reviews deleted on the site', async () => {
    seed({ fullAgoMs: FULL_READ_INTERVAL_MS, reviews: [[1, review('R1', iso(-9 * DAY))], [2, review('GONE', iso(-8 * DAY))]] })
    scanMock.mockResolvedValueOnce(scan([[1, review('R1', iso(-9 * DAY))]], iso(-DAY)))
    const map = await getMyReviews('tok')
    expect(scanMock).toHaveBeenCalledWith('tok')
    expect([...map.keys()]).toEqual([1])
    expect(snapshot()).toMatchObject({ fullAt: iso(0), syncedThrough: iso(-DAY) })
  })

  it('stays incremental one millisecond before the 7 days', async () => {
    seed({ fullAgoMs: FULL_READ_INTERVAL_MS - 1 })
    scanMock.mockResolvedValueOnce(scan([], iso(-DAY)))
    await getMyReviews('tok')
    expect(scanMock).toHaveBeenCalledWith('tok', expect.objectContaining({ stopBefore: expect.any(String) }))
  })

  it('reads everything when the saved fullAt is in the future (the clock moved back)', async () => {
    seed({ fullAgoMs: -DAY })
    scanMock.mockResolvedValueOnce(scan([], null))
    await getMyReviews('tok')
    expect(scanMock).toHaveBeenCalledWith('tok')
  })

  it('reads everything when asked with full: true, and records the time', async () => {
    seed()
    scanMock.mockResolvedValueOnce(scan([[5, review('R5', iso(-DAY))]], iso(-DAY)))
    const map = await refreshMyReviews('tok', { full: true })
    expect(scanMock).toHaveBeenCalledWith('tok')
    expect([...map.keys()]).toEqual([5])
    expect(snapshot()?.fullAt).toBe(iso(0))
  })
})

describe('sharing one walk', () => {
  it('concurrent callers wait for the same read', async () => {
    let release!: (s: ReviewScan) => void
    scanMock.mockReturnValueOnce(new Promise<ReviewScan>((r) => (release = r)))
    const a = getMyReviews('tok')
    const b = getMyReviews('tok')
    const c = refreshMyReviews('tok')
    release(scan([[1, review('R1', iso(-DAY))]], iso(-DAY)))
    const [ma, mb, mc] = await Promise.all([a, b, c])
    expect(scanMock).toHaveBeenCalledTimes(1)
    expect(ma).toBe(mb)
    expect(ma).toBe(mc)
  })

  it('a second getMyReviews after the read does not read again', async () => {
    scanMock.mockResolvedValueOnce(scan([], null))
    await getMyReviews('tok')
    await getMyReviews('tok')
    expect(scanMock).toHaveBeenCalledTimes(1)
  })

  it('an incremental request joins a full read in progress, but a full request does not join an incremental one', async () => {
    seed()
    let releaseInc!: (s: ReviewScan) => void
    scanMock.mockReturnValueOnce(new Promise<ReviewScan>((r) => (releaseInc = r)))
    const inc = getMyReviews('tok')
    scanMock.mockResolvedValueOnce(scan([[7, review('R7', iso(-DAY))]], iso(-DAY)))
    const full = refreshMyReviews('tok', { full: true })
    expect(scanMock).toHaveBeenCalledTimes(2)
    releaseInc(scan([], iso(-DAY)))
    await inc
    const map = await full
    expect([...map.keys()]).toEqual([7])
    // 全部の読み込みが済んだ控えが残る（先に終わった差分の読み込みで置き換わらない）
    expect(await getMyReviews('tok')).toBe(map)
    // 全部の読み込み中に差分を頼んでも、新しく読まない
    scanMock.mockClear()
    let releaseFull!: (s: ReviewScan) => void
    scanMock.mockReturnValueOnce(new Promise<ReviewScan>((r) => (releaseFull = r)))
    const full2 = refreshMyReviews('tok', { full: true })
    const joined = refreshMyReviews('tok')
    releaseFull(scan([], null))
    await Promise.all([full2, joined])
    expect(scanMock).toHaveBeenCalledTimes(1)
  })

  it('a different token reads on its own, and does not use the saved snapshot of the other', async () => {
    seed()
    scanMock.mockResolvedValueOnce(scan([], iso(-DAY)))
    await getMyReviews('tok')
    saveAnnictToken('other')
    scanMock.mockResolvedValueOnce(scan([[4, review('R4', iso(-DAY))]], iso(-DAY)))
    const map = await getMyReviews('other')
    expect(scanMock).toHaveBeenLastCalledWith('other')
    expect([...map.keys()]).toEqual([4])
  })
})

describe('rememberReview', () => {
  it('updates memory and the saved snapshot, for a new review and for a removal', async () => {
    seed({ reviews: [[1, review('R1', iso(-DAY))]] })
    scanMock.mockResolvedValueOnce(scan([], iso(-DAY)))
    const map = await getMyReviews('tok')

    await rememberReview('tok', 2, review('R2', iso(0), 'GREAT'))
    expect(map.get(2)?.id).toBe('R2')
    expect(snapshot()?.reviews.map(([id]) => id)).toEqual([1, 2])
    // 読んだ範囲の印は動かさない
    expect(snapshot()?.syncedThrough).toBe(iso(-DAY))

    await rememberReview('tok', 1, null)
    expect(map.has(1)).toBe(false)
    expect(snapshot()?.reviews.map(([id]) => id)).toEqual([2])
  })

  it('waits for a read in progress, then applies', async () => {
    let release!: (s: ReviewScan) => void
    scanMock.mockReturnValueOnce(new Promise<ReviewScan>((r) => (release = r)))
    const loading = getMyReviews('tok')
    const remembered = rememberReview('tok', 3, review('R3', iso(0)))
    release(scan([], null))
    await remembered
    expect((await loading).get(3)?.id).toBe('R3')
    expect(snapshot()?.reviews.map(([id]) => id)).toEqual([3])
  })

  it('applies to the newer copy when a refresh started while it was waiting', async () => {
    seed()
    let releaseFirst!: (s: ReviewScan) => void
    scanMock.mockReturnValueOnce(new Promise<ReviewScan>((r) => (releaseFirst = r)))
    getMyReviews('tok')
    const remembered = rememberReview('tok', 3, review('R3', iso(0)))
    scanMock.mockResolvedValueOnce(scan([], iso(-DAY)))
    const refreshed = refreshMyReviews('tok', { full: true })
    releaseFirst(scan([], iso(-DAY)))
    const map = await refreshed
    await remembered
    expect(map.get(3)?.id).toBe('R3')
    expect(snapshot()?.reviews.map(([id]) => id)).toContain(3)
  })

  it('does nothing for another token, or before anything was read', async () => {
    await rememberReview('tok', 1, review('R1', iso(0)))
    expect(loadReviewsRaw()).toBeNull()
    scanMock.mockResolvedValueOnce(scan([], null))
    await getMyReviews('tok')
    await rememberReview('other', 1, review('R1', iso(0)))
    expect(snapshot()?.reviews).toEqual([])
  })

  it('does not write the snapshot after the token changed (it would belong to the wrong account)', async () => {
    scanMock.mockResolvedValueOnce(scan([], null))
    await getMyReviews('tok')
    saveAnnictToken('someone-else')
    expect(loadReviewsRaw()).toBeNull()
    await rememberReview('tok', 1, review('R1', iso(0)))
    expect(loadReviewsRaw()).toBeNull()
  })
})

describe('token change', () => {
  it('removes the saved snapshot, so the next read walks everything', async () => {
    scanMock.mockResolvedValueOnce(scan([[1, review('R1', iso(-DAY))]], iso(-DAY)))
    await getMyReviews('tok')
    expect(snapshot()).not.toBeNull()
    saveAnnictToken('new-token')
    expect(loadReviewsRaw()).toBeNull()

    resetMyReviewsMemory()
    scanMock.mockResolvedValueOnce(scan([], null))
    await getMyReviews('new-token')
    expect(scanMock).toHaveBeenLastCalledWith('new-token')
  })

  it('removes it on logout too', async () => {
    seed()
    saveAnnictToken(null)
    expect(loadReviewsRaw()).toBeNull()
  })
})
