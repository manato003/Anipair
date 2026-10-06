// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, MyReview, RatingState, ReviewAxes } from '../../lib/annict'

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

// Annict 側の感想（書き込みの直前の読み直し fetchReview に答える）。作った・消したを追いかける
const annictCreated = new Map<string, MyReview>()
const annictDeleted = new Set<string>()
afterEach(() => {
  annictCreated.clear()
  annictDeleted.clear()
})

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchLibrary: vi.fn(async () => library),
  updateStatus: vi.fn(async (_t: string, id: string, s: string) => void calls.push(`status ${id} ${s}`)),
  createReviewWith: vi.fn(async (_t: string, id: string, axes: ReviewAxes, body: string) => {
    const r = axes.ratingOverallState
    const rid = `N${++seq}`
    calls.push(`create ${id} ${r} -> ${rid}`)
    annictCreated.set(rid, { id: rid, body, createdAt: '', ...axes })
    return rid
  }),
  fetchReview: vi.fn(async (_t: string, id: string) => (annictDeleted.has(id) ? null : (annictCreated.get(id) ?? [...cache.values()].find((x) => x.id === id) ?? null))),
  deleteReview: vi.fn(async (_t: string, id: string) => {
    annictDeleted.add(id)
    void calls.push(`delete ${id}`)
  }),
  updateReview: vi.fn(async (_t: string, id: string, r: string) => void calls.push(`update ${id} ${r}`)),
}))
// 表紙は Annict の作品 ID ごと。作品 1 だけに付く
vi.mock('../../lib/covers', async (orig) => ({
  ...(await orig<typeof import('../../lib/covers')>()),
  fetchCovers: vi.fn(async () => new Map([[1, { url: 'https://img.example/101.jpg', thumb: 'https://img.example/101-s.jpg', landscape: false }]])),
}))
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(async () => cache),
  peekMyReview: vi.fn((_t: string, id: number) => cache.get(id) ?? null),
  rememberReview: vi.fn(async (_t: string, id: number, r: MyReview | null) => {
    if (r) cache.set(id, r)
    else cache.delete(id)
  }),
}))

const { useWatching } = await import('./useWatching')
const { fetchLibrary } = await import('../../lib/annict')

beforeEach(() => {
  localStorage.removeItem('animax.library.v1')
  localStorage.removeItem('animax.stillWatching.v1')
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

  it('"finished, no rating" and "dropped" only change the status; undo goes back to WATCHING', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watched' }))
    act(() => hook.result.current.answer({ kind: 'stop' }))
    act(() => hook.result.current.answer({ kind: 'stop' }))
    expect(hook.result.current.done).toBe(true)
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'status W2 STOP_WATCHING', 'status W4 STOP_WATCHING'])
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

  it('"still watching" is not asked again when the app is opened again (for a week), unless it was undone', async () => {
    const first = await setup()
    act(() => first.result.current.answer({ kind: 'still' }))
    first.unmount()
    // 開き直した: 作品1は出さず、次の作品から
    const second = await setup()
    expect(second.result.current.cards!.map((c) => c.entry.annictId)).toEqual([2, 4])
    act(() => second.result.current.answer({ kind: 'still' }))
    act(() => second.result.current.undo())
    second.unmount()
    // 取り消した作品2は、また出る
    const third = await setup()
    expect(third.result.current.cards!.map((c) => c.entry.annictId)).toEqual([2, 4])
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

describe('useWatching: the deck from the last visit', () => {
  it('shows the stored watching works at once, keeps the shown card, and follows Annict for the rest', async () => {
    // 前回の内容: 作品1と作品9を見ていた。Annict の今: 作品9は見終えていて、作品2と作品4を見ている
    const stored = [entry(1, 'WATCHING', '2026-06-01T00:00:00Z'), entry(9, 'WATCHING', '2026-07-01T00:00:00Z')]
    localStorage.setItem('animax.library.v1', JSON.stringify({ v: 1, at: '2026-10-05T00:00:00.000Z', entries: stored }))
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    vi.mocked(fetchLibrary).mockImplementationOnce(async () => {
      await gate
      return library
    })
    const hook = renderHook(() => useWatching('t'))
    expect(hook.result.current.current?.entry.workId).toBe('W1')
    expect(hook.result.current.staleAt).toBe('2026-10-05T00:00:00.000Z')
    release()
    await waitFor(() => expect(hook.result.current.staleAt).toBeNull())
    // いま出している作品1は残り、作品9が外れて、Annict の今の見てる（作品2・作品4。見始めた順）が後ろに入る
    expect(hook.result.current.cards?.map((c) => c.entry.workId)).toEqual(['W1', 'W2', 'W4'])
  })
})
