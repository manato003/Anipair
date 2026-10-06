// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyReview, RecentRecord } from '../../lib/annict'

const calls: string[] = []
let recentRecords: RecentRecord[] = []
let cache = new Map<number, MyReview>()

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  updateStatus: vi.fn(async (_t: string, id: string, s: string) => void calls.push(`status ${id} ${s}`)),
  fetchRecentActivity: vi.fn(async () => ({ reviews: [], records: recentRecords })),
  createRecord: vi.fn(async (_t: string, id: string, r: string | null) => {
    calls.push(`record ${id} ${r}`)
    return 'REC-NEW'
  }),
  deleteRecord: vi.fn(async (_t: string, id: string) => void calls.push(`unrecord ${id}`)),
  updateRecord: vi.fn(async (_t: string, id: string, c: string, r: string | null) => void calls.push(`comment ${id} "${c}" ${r}`)),
}))
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(async () => cache),
  rememberReview: vi.fn(async (_t: string, id: number, r: MyReview | null) => void calls.push(`remember ${id} ${r?.ratingOverallState ?? null}`)),
}))
vi.mock('../../lib/reviewOps', () => ({
  changeRating: vi.fn(async (_t: string, w: string, cur: MyReview | null, r: string | null) => {
    calls.push(`rate ${w} ${cur?.id ?? '-'} ${r}`)
    return r ? { id: 'R', ratingOverallState: r } : null
  }),
  saveReview: vi.fn(async (_t: string, w: string, cur: MyReview | null, c: { body: string }) => {
    calls.push(`review ${w} ${cur?.id ?? '-'} "${c.body}"`)
    return { id: 'R', ratingOverallState: null }
  }),
}))
vi.mock('../match/resolve', () => ({
  resolveAnnictWork: vi.fn(async (_t: string, m: { idMal: number }) => (m.idMal === 404 ? null : { id: `A${m.idMal}`, annictId: m.idMal, title: '', malAnimeId: String(m.idMal) })),
}))

const { reconcileIntent } = await import('./reconcile')

const existing = (id: string): MyReview => ({ id, body: '', createdAt: '', ratingOverallState: 'GOOD', ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null })
const title = { native: '作品', romaji: null, english: null }

beforeEach(() => {
  calls.length = 0
  recentRecords = []
  cache = new Map()
})
afterEach(() => localStorage.clear())

describe('reconcileIntent', () => {
  it('writes the status as asked (the same value twice is harmless)', async () => {
    await reconcileIntent('t', { kind: 'status', workId: 'W1', state: 'WATCHED' })
    expect(calls).toEqual(['status W1 WATCHED'])
  })

  it('changes the rating from the review Annict has now', async () => {
    cache.set(1, existing('R1'))
    await reconcileIntent('t', { kind: 'rating', workId: 'W1', annictId: 1, rating: 'GREAT' })
    expect(calls).toEqual(['rate W1 R1 GREAT', 'remember 1 GREAT'])
  })

  it('saves the review content from the review Annict has now', async () => {
    const axes = { ratingOverallState: null, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
    await reconcileIntent('t', { kind: 'review', workId: 'W1', annictId: 1, content: { axes, body: '良かった' } })
    expect(calls).toEqual(['review W1 - "良かった"', 'remember 1 null'])
  })

  it('records an episode only when no record has been made since it was asked', async () => {
    const asked = Date.now() - 60_000
    await reconcileIntent('t', { kind: 'episode', episodeId: 'E1', recorded: true, rating: 'GOOD', since: asked })
    recentRecords = [{ id: 'REC1', episodeId: 'E2', createdAt: new Date().toISOString() }]
    await reconcileIntent('t', { kind: 'episode', episodeId: 'E2', recorded: true, rating: 'GOOD', since: asked })
    expect(calls).toEqual(['record E1 GOOD'])
  })

  it('removes the record made since it was asked when the wish was to undo it', async () => {
    recentRecords = [{ id: 'REC1', episodeId: 'E1', createdAt: new Date().toISOString() }]
    await reconcileIntent('t', { kind: 'episode', episodeId: 'E1', recorded: false, rating: null, since: Date.now() - 60_000 })
    await reconcileIntent('t', { kind: 'episode', episodeId: 'E9', recorded: false, rating: null, since: Date.now() - 60_000 })
    expect(calls).toEqual(['unrecord REC1'])
  })

  it('puts an episode comment on the record made since it was asked, and skips it when there is none', async () => {
    recentRecords = [{ id: 'REC1', episodeId: 'E1', createdAt: new Date().toISOString() }]
    await reconcileIntent('t', { kind: 'episodeComment', episodeId: 'E1', comment: '良かった', rating: 'GOOD', since: Date.now() - 60_000 })
    await reconcileIntent('t', { kind: 'episodeComment', episodeId: 'E9', comment: '消えた記録', rating: null, since: Date.now() - 60_000 })
    expect(calls).toEqual(['comment REC1 "良かった" GOOD'])
  })

  it('finds the Annict work for a matching answer, and touches the rating only when the answer had one', async () => {
    await reconcileIntent('t', { kind: 'match', idMal: 10, title, state: 'WANNA_WATCH' })
    await reconcileIntent('t', { kind: 'match', idMal: 11, title, state: 'WATCHED', rating: 'GOOD' })
    expect(calls).toEqual(['status A10 WANNA_WATCH', 'status A11 WATCHED', 'rate A11 - GOOD', 'remember 11 GOOD'])
    await expect(reconcileIntent('t', { kind: 'match', idMal: 404, title, state: 'WATCHED' })).rejects.toThrow('見つけられませんでした')
  })
})
