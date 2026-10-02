// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, MyReview, RatingState } from '../../lib/annict'

const calls: string[] = []
let seq = 0
let library: LibraryEntry[] = []
// 共有の感想の控えの代わり。本物と同じく、読み込みは1つの Map を使い回して、書き込みで中身を変える
let cache = new Map<number, MyReview>()

const entry = (annictId: number, state: LibraryEntry['state'], stateAt: string): LibraryEntry => ({
  workId: `W${annictId}`,
  annictId,
  title: `作品${annictId}`,
  malAnimeId: String(100 + annictId),
  state,
  stateAt,
})

const review = (id: string, rating: RatingState): MyReview => ({
  id,
  body: '',
  createdAt: '',
  ratingOverallState: rating,
  ratingStoryState: null,
  ratingAnimationState: null,
  ratingMusicState: null,
  ratingCharacterState: null,
})

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchLibrary: vi.fn(async () => library),
  updateStatus: vi.fn(async (_t: string, id: string, s: string) => void calls.push(`status ${id} ${s}`)),
  createReview: vi.fn(async (_t: string, id: string, r: string) => {
    const rid = `N${++seq}`
    calls.push(`create ${id} ${r} -> ${rid}`)
    return rid
  }),
  deleteReview: vi.fn(async (_t: string, id: string) => void calls.push(`delete ${id}`)),
  updateReview: vi.fn(async (_t: string, id: string, r: string) => void calls.push(`update ${id} ${r}`)),
}))
// 表紙は Annict の作品 ID ごと。作品 1 だけに付く
vi.mock('../../lib/covers', async (orig) => ({
  ...(await orig<typeof import('../../lib/covers')>()),
  fetchCovers: vi.fn(async () => new Map([[1, { url: 'https://img.example/101.jpg', thumb: 'https://img.example/101-s.jpg', landscape: false }]])),
}))
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(async () => cache),
  rememberReview: vi.fn(async (_t: string, id: number, r: MyReview | null) => {
    if (r) cache.set(id, r)
    else cache.delete(id)
  }),
}))

const { useWatching } = await import('./useWatching')
const { fetchLibrary } = await import('../../lib/annict')

beforeEach(() => {
  calls.length = 0
  seq = 0
  cache = new Map()
  library = [
    entry(2, 'WATCHING', '2026-08-01T00:00:00Z'),
    entry(1, 'WATCHING', '2026-06-01T00:00:00Z'),
    entry(3, 'WATCHED', '2026-01-01T00:00:00Z'),
    entry(4, 'WATCHING', '2026-09-01T00:00:00Z'),
  ]
  vi.mocked(fetchLibrary).mockClear()
})

async function setup() {
  const hook = renderHook(() => useWatching('t'))
  await waitFor(() => expect(hook.result.current.current).not.toBeNull())
  return hook
}
const settle = (hook: Awaited<ReturnType<typeof setup>>) => waitFor(() => expect(hook.result.current.pending).toBe(0))

describe('useWatching', () => {
  it('lists only works being watched, longest-watched first, with covers', async () => {
    const hook = await setup()
    expect(hook.result.current.cards!.map((c) => c.entry.annictId)).toEqual([1, 2, 4])
    expect(hook.result.current.current?.cover?.url).toContain('101')
  })

  it('rating a work sets it watched and rates it; undo restores WATCHING and removes the rating it did not have', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    expect(hook.result.current.current?.entry.annictId).toBe(2)
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'create W1 GREAT -> N1'])
    calls.length = 0
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.entry.annictId).toBe(1)
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHING', 'delete N1'])
    expect(cache.has(1)).toBe(false)
  })

  it('a work already rated while watching gets its rating changed, and undo puts the earlier rating back', async () => {
    cache.set(1, review('R1', 'GOOD'))
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    await settle(hook)
    // 感想は1つのまま（作り直して古い方を消す）。重複しない
    expect(calls).toEqual(['status W1 WATCHED', 'create W1 GREAT -> N1', 'delete R1'])
    expect(cache.get(1)?.id).toBe('N1')
    calls.length = 0
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHING', 'create W1 GOOD -> N2', 'delete N1'])
    expect(cache.get(1)).toMatchObject({ id: 'N2', ratingOverallState: 'GOOD' })
  })

  it('"finished, no rating", "on hold" and "stopped" only change the status; undo goes back to WATCHING', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watched' }))
    act(() => hook.result.current.answer({ kind: 'hold' }))
    act(() => hook.result.current.answer({ kind: 'stop' }))
    expect(hook.result.current.done).toBe(true)
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'status W2 ON_HOLD', 'status W4 STOP_WATCHING'])
    calls.length = 0
    act(() => hook.result.current.undo())
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W4 WATCHING', 'status W2 WATCHING'])
  })

  it('"still watching" sends nothing and can be undone without sending anything', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'still' }))
    expect(hook.result.current.current?.entry.annictId).toBe(2)
    expect(hook.result.current.canUndo).toBe(true)
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.entry.annictId).toBe(1)
    await settle(hook)
    expect(calls).toEqual([])
  })

  it('says so when there is nothing being watched', async () => {
    library = [entry(3, 'WATCHED', '2026-01-01T00:00:00Z')]
    const hook = renderHook(() => useWatching('t'))
    await waitFor(() => expect(hook.result.current.cards).toEqual([]))
    expect(hook.result.current.current).toBeNull()
    expect(hook.result.current.done).toBe(false)
  })

  describe('refreshIfIdle', () => {
    it('picks up works added elsewhere while the deck is untouched', async () => {
      const hook = await setup()
      library = [...library, entry(5, 'WATCHING', '2026-05-01T00:00:00Z')]
      act(() => hook.result.current.refreshIfIdle())
      await waitFor(() => expect(hook.result.current.cards!.map((c) => c.entry.annictId)).toEqual([5, 1, 2, 4]))
    })

    it('leaves the deck alone once answers have started', async () => {
      const hook = await setup()
      act(() => hook.result.current.answer({ kind: 'still' }))
      library = [...library, entry(5, 'WATCHING', '2026-05-01T00:00:00Z')]
      vi.mocked(fetchLibrary).mockClear()
      act(() => hook.result.current.refreshIfIdle())
      expect(fetchLibrary).not.toHaveBeenCalled()
      expect(hook.result.current.cards).toHaveLength(3)
    })
  })
})
