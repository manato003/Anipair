// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnictWork, MyReview, ReviewAxes } from '../../lib/annict'
import type { GithubConnection } from '../../lib/github'
import { previousSeason, seasonOf, toSlug } from '../../lib/season'
import { LEGACY_AT, type Unseen } from './unseen'

const calls: string[] = []
// 共有の感想の控えへの出し入れ（送信の順番とは別に見る）
const remembered: string[] = []
let reviewSeq = 0
// 立てると、同期がこの Promise の解決まで止まる（同期の最中の変更を試すため）
let syncGate: Promise<void> | null = null
let syncResult: Unseen | Error | null = null
let emptySlugs = new Set<string>()
// 共有の感想の控えにすでにある感想（別の端末で評価した作品）
let existingReviews = new Map<number, MyReview>()

const works: AnnictWork[] = [1, 2, 3].map((n) => ({
  id: `W${n}`,
  annictId: n,
  title: `作品${n}`,
  media: 'TV',
  malAnimeId: String(1000 + n),
  watchersCount: 100,
  viewerStatusState: 'NO_STATE',
  imageUrl: null,
}))

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchSeasonWorks: vi.fn(async (_t: string, slug: string) => (emptySlugs.has(slug) ? [] : works)),
  updateStatus: vi.fn(async (_t: string, id: string, state: string) => void calls.push(`status ${id} ${state}`)),
  deleteReview: vi.fn(async (_t: string, rid: string) => void calls.push(`delete ${rid}`)),
  // 評価はすべて共有の手順（lib/reviewOps.ts の changeRating）を通る。送る直前に控えの感想を読み直す
  fetchReview: vi.fn(async (_t: string, id: string) => [...existingReviews.values()].find((r) => r.id === id) ?? null),
  createReviewWith: vi.fn(async (_t: string, id: string, axes: ReviewAxes) => {
    const rid = `R${++reviewSeq}`
    calls.push(`review ${id} ${axes.ratingOverallState} -> ${rid}`)
    return rid
  }),
}))

vi.mock('../../lib/covers', async (orig) => ({ ...(await orig<typeof import('../../lib/covers')>()), fetchCovers: vi.fn(async () => new Map()) }))
// 共有の感想の控えの代わり。作った・付け直した感想を覚え、取り消しで消す
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(async () => existingReviews),
  peekMyReview: vi.fn((_t: string, id: number) => existingReviews.get(id) ?? null),
  rememberReview: vi.fn(async (_t: string, id: number, r: MyReview | null) => {
    remembered.push(r ? `${id} ${r.id} ${r.ratingOverallState}` : `${id} null`)
    if (r) existingReviews.set(id, r)
    else existingReviews.delete(id)
  }),
}))
// 同期の相手（GitHub）は偽物。同期が呼ばれたことと、返す内容を操作できるようにする
vi.mock('./unseenStore', async (orig) => ({
  ...(await orig<typeof import('./unseenStore')>()),
  syncUnseen: vi.fn(async () => {
    calls.push('sync')
    await syncGate
    if (syncResult instanceof Error) throw syncResult
    return syncResult ?? new Map()
  }),
}))

const { useBackfill } = await import('./useBackfill')
const { syncUnseen } = await import('./unseenStore')

const GH = { token: 'gh', repo: 'me/anipair-data' }

async function setup(github: GithubConnection | null = null) {
  const hook = renderHook(() => useBackfill('token', github))
  await waitFor(() => expect(hook.result.current.current).not.toBeNull())
  return hook
}

async function settle(hook: Awaited<ReturnType<typeof setup>>) {
  await waitFor(() => expect(hook.result.current.pending).toBe(0))
}

beforeEach(() => {
  existingReviews = new Map()
  localStorage.clear()
  calls.length = 0
  remembered.length = 0
  reviewSeq = 0
  syncGate = null
  syncResult = null
  emptySlugs = new Set()
  localStorage.clear()
})

describe('useBackfill', () => {
  it('rating marks the work watched, then posts the overall rating, and moves to the next card at once', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GREAT -> R1'])
  })

  it('drops a work recorded from a related-work sheet out of the cards still to come, keeping the current one', async () => {
    const hook = await setup()
    expect(hook.result.current.progress).toEqual({ answered: 0, total: 3 })
    // 今の1枚（W1）は残す
    act(() => hook.result.current.dropFromDeck(1, true))
    expect(hook.result.current.cards?.map((c) => c.work.id)).toEqual(['W1', 'W2', 'W3'])
    // これから出てくる W3 は外す。答えた数に入る
    act(() => hook.result.current.dropFromDeck(3, true))
    expect(hook.result.current.cards?.map((c) => c.work.id)).toEqual(['W1', 'W2'])
    expect(hook.result.current.progress).toEqual({ answered: 1, total: 3 })
    // 山に無い作品は何もしない
    act(() => hook.result.current.dropFromDeck(99, true))
    expect(hook.result.current.cards).toHaveLength(2)
  })

  it('undoing a rating deletes that review and clears the status', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.work.id).toBe('W1')
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GOOD -> R1', 'delete R1', 'status W1 NO_STATE'])
  })

  it('does not make a second review when the work already has one (rated on another device), and undo puts the earlier rating back', async () => {
    existingReviews = new Map([
      [1, { id: 'OLD', body: '', createdAt: '2026-10-01T00:00:00Z', ratingOverallState: 'AVERAGE', ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }],
    ])
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    await settle(hook)
    // 総合だけの感想は「作ってから古いものを消す」で付け直す（新しく2つ目は作らない）
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GREAT -> R1', 'delete OLD'])
  })

  it('"watched but forgotten" sets the status without a review', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watched' }))
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'status W1 NO_STATE'])
  })

  it('"want to watch" sets WANNA_WATCH without a review, and undo clears it', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WANNA_WATCH', 'status W1 NO_STATE'])
  })

  it('"not watched" is kept on this device without a GitHub token, and never calls Annict', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    expect(JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen['1']).toMatchObject({ active: true })
    act(() => hook.result.current.undo())
    // 取り消しは項目を消さずに active: false で残す
    expect(JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen['1']).toMatchObject({ active: false })
    await settle(hook)
    expect(calls).toEqual([])
  })

  it('"dropped" sets STOP_WATCHING without a review, and undo clears it', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'stop' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 STOP_WATCHING', 'status W1 NO_STATE'])
  })

  it('"watching" sets WATCHING, and undo clears it', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watching' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHING', 'status W1 NO_STATE'])
  })

  it('puts a created review in the shared cache, and takes it out again on undo', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GREAT -> R1', 'delete R1', 'status W1 NO_STATE'])
    expect(remembered).toEqual(['1 R1 GREAT', '1 null'])
  })

  it('syncs "not watched" with GitHub once when the deck loads, and drops what other devices marked', async () => {
    syncResult = new Map([[2, { at: '2026-09-29T00:00:00.000Z', active: true }]])
    const hook = await setup(GH)
    expect(calls).toEqual(['sync'])
    expect(syncUnseen).toHaveBeenCalledWith(GH)
    expect(hook.result.current.cards!.map((c) => c.work.id)).toEqual(['W1', 'W3'])
    expect(hook.result.current.syncNote).toBeNull()
  })

  it('carries on with the local records and says so when the sync fails', async () => {
    syncResult = new Error('offline')
    const hook = await setup(GH)
    expect(hook.result.current.cards).toHaveLength(3)
    expect(hook.result.current.syncNote).toContain('offline')
  })

  it('syncs once for several "not watched" answers in a row, and once more for a change made during a running sync', async () => {
    const hook = await setup(GH)
    calls.length = 0
    let release = () => {}
    syncGate = new Promise<void>((r) => (release = r))
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.undo())
    await waitFor(() => expect(calls).toEqual(['sync']))
    act(() => hook.result.current.undo())
    release()
    await settle(hook)
    expect(calls).toEqual(['sync', 'sync'])
  })

  it('moves the old device-only list into the new records once, then removes the old key', async () => {
    localStorage.setItem('animax.backfill.skipped', JSON.stringify([2]))
    const hook = await setup()
    expect(hook.result.current.cards!.map((c) => c.work.id)).toEqual(['W1', 'W3'])
    expect(localStorage.getItem('animax.backfill.skipped')).toBeNull()
    expect(JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen['2']).toEqual({ at: LEGACY_AT, active: true })
  })

  it('stepping forward into a season with nothing left shows it as done instead of bouncing back', async () => {
    const now = seasonOf(new Date())
    const before = previousSeason(now)
    localStorage.setItem('animax.backfill.season', toSlug(before))
    emptySlugs = new Set([toSlug(now)])
    const hook = await setup()
    act(() => hook.result.current.goToNext())
    await waitFor(() => expect(hook.result.current.cards).toEqual([]))
    expect(hook.result.current.season).toEqual(now)
    expect(hook.result.current.seasonDone).toBe(true)
    // 前へ戻るときは、記録済みの空のクールを飛ばす（これまでどおり）
    emptySlugs = new Set([toSlug(before)])
    act(() => hook.result.current.goToPrevious())
    await waitFor(() => expect(hook.result.current.season).toEqual(previousSeason(before)))
  })

  it('jumping through the picker shows the chosen season even when nothing is left, and saves it', async () => {
    const hook = await setup()
    const target = { year: 2012, name: 'spring' } as const
    emptySlugs = new Set([toSlug(target)])
    act(() => hook.result.current.jumpTo(target))
    await waitFor(() => expect(hook.result.current.cards).toEqual([]))
    expect(hook.result.current.season).toEqual(target)
    expect(hook.result.current.seasonDone).toBe(true)
    expect(localStorage.getItem('animax.backfill.season')).toBe(toSlug(target))
  })

  it('undo walks back through several answers in reverse order', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'BAD' }))
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'AVERAGE' }))
    expect(hook.result.current.seasonDone).toBe(true)
    act(() => hook.result.current.undo())
    act(() => hook.result.current.undo())
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.work.id).toBe('W1')
    expect(hook.result.current.canUndo).toBe(false)
    await settle(hook)
    expect(calls).toEqual([
      'status W1 WATCHED', 'review W1 BAD -> R1',
      'status W3 WATCHED', 'review W3 AVERAGE -> R2',
      'delete R2', 'status W3 NO_STATE',
      'delete R1', 'status W1 NO_STATE',
    ])
  })
})

describe('useBackfill: looking again at works marked "not watched"', () => {
  const unseenOf = (id: number) => JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen[String(id)]

  it('offers them only once the season is done, and only when asked', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    expect(hook.result.current.unseenLeft).toBe(0)
    act(() => hook.result.current.answer({ kind: 'skip' }))
    expect(hook.result.current.seasonDone).toBe(true)
    // 作品1と作品3を「見てない」にした。勝手には山に戻さない
    expect(hook.result.current.unseenLeft).toBe(2)
    expect(hook.result.current.reviewing).toBe(false)
    act(() => hook.result.current.reviewUnseen())
    expect(hook.result.current.reviewing).toBe(true)
    expect(hook.result.current.current?.work.id).toBe('W1')
    // 進み具合は満たしたまま（どれも答え済み）
    expect(hook.result.current.progress).toEqual({ answered: 3, total: 3 })
  })

  it('recording one in the second look takes it out of "not watched"; undo puts it back', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.reviewUnseen())
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    expect(unseenOf(1)).toMatchObject({ active: false })
    expect(hook.result.current.seasonDone).toBe(true)
    expect(hook.result.current.unseenLeft).toBe(0)
    act(() => hook.result.current.undo())
    expect(unseenOf(1)).toMatchObject({ active: true })
    await settle(hook)
    expect(calls.slice(-3)).toEqual(['review W1 GREAT -> R1', 'delete R1', 'status W1 NO_STATE'])
  })

  it('"not watched" again keeps it so, and undoing that does not clear the earlier mark', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.reviewUnseen())
    act(() => hook.result.current.answer({ kind: 'skip' }))
    expect(unseenOf(1)).toMatchObject({ active: true })
    act(() => hook.result.current.undo())
    expect(unseenOf(1)).toMatchObject({ active: true })
  })
})

describe('useBackfill: the deck from the last visit', () => {
  it('shows the stored works of the season at once, keeps the shown card when Annict answers, and drops works recorded elsewhere', async () => {
    const slug = toSlug(seasonOf(new Date()))
    // 前回の内容: 作品1〜3（どれも未記録）。Annict の今: 作品2 は別の端末で記録済み
    localStorage.setItem('animax.seasonWorks.v1', JSON.stringify({ v: 1, seasons: { [slug]: { at: '2026-10-05T00:00:00.000Z', works } } }))
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { fetchSeasonWorks } = await import('../../lib/annict')
    vi.mocked(fetchSeasonWorks).mockImplementationOnce(async () => {
      await gate
      return works.map((w) => (w.id === 'W2' ? { ...w, viewerStatusState: 'WATCHED' as const } : w))
    })
    const hook = renderHook(() => useBackfill('t'))
    // 読み直しを待たずに、前回の内容で山が出ている
    await waitFor(() => expect(hook.result.current.current?.work.id).toBe('W1'))
    expect(hook.result.current.staleAt).toBe('2026-10-05T00:00:00.000Z')
    release()
    await waitFor(() => expect(hook.result.current.staleAt).toBeNull())
    // いま出している作品1はそのまま、まだ出していない分から作品2が外れる
    expect(hook.result.current.cards?.map((c) => c.work.id)).toEqual(['W1', 'W3'])
  })
})
