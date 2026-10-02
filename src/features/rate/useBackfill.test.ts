// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnictWork } from '../../lib/annict'
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

const works: AnnictWork[] = [1, 2, 3].map((n) => ({
  id: `W${n}`,
  annictId: n,
  title: `作品${n}`,
  media: 'TV',
  malAnimeId: String(1000 + n),
  watchersCount: 100,
  viewerStatusState: 'NO_STATE',
  ogImageUrl: null,
}))

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchSeasonWorks: vi.fn(async (_t: string, slug: string) => (emptySlugs.has(slug) ? [] : works)),
  updateStatus: vi.fn(async (_t: string, id: string, state: string) => void calls.push(`status ${id} ${state}`)),
  createReview: vi.fn(async (_t: string, id: string, rating: string) => {
    const rid = `R${++reviewSeq}`
    calls.push(`review ${id} ${rating} -> ${rid}`)
    return rid
  }),
  deleteReview: vi.fn(async (_t: string, rid: string) => void calls.push(`delete ${rid}`)),
}))

vi.mock('../../lib/anilist', () => ({ fetchCovers: vi.fn(async () => new Map()) }))
vi.mock('../../lib/myReviews', () => ({
  rememberReview: vi.fn(async (_t: string, id: number, r: { id: string; ratingOverallState: string } | null) => {
    remembered.push(r ? `${id} ${r.id} ${r.ratingOverallState}` : `${id} null`)
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

  it('undoing a rating deletes that review and clears the status', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.work.id).toBe('W1')
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GOOD -> R1', 'delete R1', 'status W1 NO_STATE'])
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
