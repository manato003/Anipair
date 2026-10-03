// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, MyReview } from '../../lib/annict'

const calls: string[] = []
let seq = 0
// 立てると、感想の削除がこの Promise の解決まで止まる（送信待ちの状態を作るため）
let deleteGate: Promise<void> | null = null

let library: LibraryEntry[] = [
  { workId: 'W1', annictId: 1, title: '見た作品', malAnimeId: '101', state: 'WATCHED', stateAt: '2026-09-01T00:00:00Z' },
  { workId: 'W2', annictId: 2, title: '見たい作品', malAnimeId: '102', state: 'WANNA_WATCH', stateAt: '2026-09-02T00:00:00Z' },
]
const reviews = new Map<number, MyReview>([
  [1, { id: 'R1', body: '', createdAt: '', ratingOverallState: 'GOOD', ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }],
])

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchLibrary: vi.fn(async () => library),
  // 控え（myReviews.ts）が中身を書き換えるので、毎回コピーを返す
  scanMyReviews: vi.fn(async () => ({ reviews: new Map(reviews), newest: null })),
  updateStatus: vi.fn(async (_t: string, id: string, s: string) => void calls.push(`status ${id} ${s}`)),
  createReview: vi.fn(async (_t: string, id: string, r: string) => {
    const rid = `N${++seq}`
    calls.push(`create ${id} ${r} -> ${rid}`)
    return rid
  }),
  deleteReview: vi.fn(async (_t: string, id: string) => {
    await deleteGate
    calls.push(`delete ${id}`)
  }),
  updateReview: vi.fn(async () => void calls.push('update')),
}))
// 表紙は Annict の作品 ID ごと。作品 1 だけに付く
vi.mock('../../lib/covers', async (orig) => ({
  ...(await orig<typeof import('../../lib/covers')>()),
  fetchCovers: vi.fn(async () => new Map([[1, { url: 'https://img.example/101.jpg', thumb: 'https://img.example/101-s.jpg', landscape: false }]])),
}))

const { useRecords } = await import('./useRecords')
const { fetchLibrary, scanMyReviews } = await import('../../lib/annict')
const { rememberReview, resetMyReviewsMemory } = await import('../../lib/myReviews')

const initialLibrary = [...library]

beforeEach(() => {
  // 共有の感想の控えは起動中ずっと残るので、テストごとに捨てる
  resetMyReviewsMemory()
  calls.length = 0
  seq = 0
  deleteGate = null
  reviews.delete(2)
  library = [...initialLibrary]
  vi.mocked(fetchLibrary).mockClear()
})

async function setup() {
  const hook = renderHook(({ active }) => useRecords('t', active), { initialProps: { active: true } })
  // undefined も「null でない」に当たるので、URL が入るまで待つ
  await waitFor(() => expect(hook.result.current.rows?.[0]?.cover?.url).toBeTypeOf('string'))
  return hook
}

const settle = (hook: Awaited<ReturnType<typeof setup>>) => waitFor(() => expect(hook.result.current.pending).toBe(0))
const rowOf = (hook: Awaited<ReturnType<typeof setup>>, id: number) => hook.result.current.rows!.find((r) => r.entry.annictId === id)!

describe('useRecords', () => {
  it('loads records with their ratings, then fills in covers', async () => {
    const hook = await setup()
    expect(rowOf(hook, 1).review?.ratingOverallState).toBe('GOOD')
    expect(rowOf(hook, 1).cover?.url).toContain('101')
    expect(rowOf(hook, 2).cover).toBeNull()
  })

  it('changing a rating twice in a row uses the id created by the first change', async () => {
    const hook = await setup()
    act(() => hook.result.current.setRating(rowOf(hook, 1), 'GREAT'))
    expect(rowOf(hook, 1).review?.ratingOverallState).toBe('GREAT')
    act(() => hook.result.current.setRating(rowOf(hook, 1), 'BAD'))
    await settle(hook)
    expect(calls).toEqual(['create W1 GREAT -> N1', 'delete R1', 'create W1 BAD -> N2', 'delete N1'])
  })

  it('clearing a rating deletes the review', async () => {
    const hook = await setup()
    act(() => hook.result.current.setRating(rowOf(hook, 1), null))
    expect(rowOf(hook, 1).review).toBeNull()
    await settle(hook)
    expect(calls).toEqual(['delete R1'])
  })

  it('rating a want-to-watch work marks it watched first', async () => {
    const hook = await setup()
    act(() => hook.result.current.setRating(rowOf(hook, 2), 'GOOD'))
    expect(rowOf(hook, 2).entry.state).toBe('WATCHED')
    await settle(hook)
    expect(calls).toEqual(['status W2 WATCHED', 'create W2 GOOD -> N1'])
  })

  it('changing the state updates Annict, and removing takes the row off the list', async () => {
    const hook = await setup()
    act(() => hook.result.current.setState(rowOf(hook, 2), 'WATCHING'))
    expect(rowOf(hook, 2).entry.state).toBe('WATCHING')
    act(() => hook.result.current.setState(rowOf(hook, 1), 'NO_STATE'))
    expect(hook.result.current.rows!.map((r) => r.entry.annictId)).toEqual([2])
    await settle(hook)
    expect(calls).toEqual(['status W2 WATCHING', 'status W1 NO_STATE'])
  })

  it('sends against the review in the shared cache at send time, which another screen may have changed', async () => {
    const hook = await setup()
    // ブラウズの詳細などが先に評価を作り直して、控えを更新した
    await rememberReview('t', 1, { ...reviews.get(1)!, id: 'R9' })
    act(() => hook.result.current.setRating(rowOf(hook, 1), null))
    await settle(hook)
    expect(calls).toEqual(['delete R9'])
  })

  it('patchRecord follows changes made in the detail sheet: a rating makes it watched, no state removes the row', async () => {
    const hook = await setup()
    act(() => hook.result.current.patchRecord(2, { rating: 'GREAT', state: 'WATCHED' }))
    expect(rowOf(hook, 2).entry.state).toBe('WATCHED')
    expect(rowOf(hook, 2).review?.ratingOverallState).toBe('GREAT')
    act(() => hook.result.current.patchRecord(2, { rating: null }))
    expect(rowOf(hook, 2).review).toBeNull()
    act(() => hook.result.current.patchRecord(1, { state: null }))
    expect(hook.result.current.rows!.map((r) => r.entry.annictId)).toEqual([2])
    // 送信はシートが自分の列で行うので、ここでは何も送らない
    expect(calls).toEqual([])
  })

  describe('when the tab is shown again', () => {
    const added: LibraryEntry = { workId: 'W3', annictId: 3, title: '増えた作品', malAnimeId: '103', state: 'WATCHING', stateAt: '2026-09-03T00:00:00Z' }

    it('refreshes in the background: the current rows stay until the new data replaces them', async () => {
      const hook = await setup()
      hook.rerender({ active: false })
      library = [...initialLibrary, added]
      reviews.set(2, { ...reviews.get(1)!, id: 'R2', ratingOverallState: 'GREAT' })
      hook.rerender({ active: true })
      // 読み直しの最中も、いまの一覧は消えない
      expect(hook.result.current.rows).toHaveLength(2)
      await waitFor(() => expect(hook.result.current.rows).toHaveLength(3))
      expect(rowOf(hook, 2).review?.ratingOverallState).toBe('GREAT')
      // 表紙は取り直した分がそのまま入る
      expect(rowOf(hook, 1).cover?.url).toContain('101')
    })

    it('does not refresh when it was never hidden, or while a write is pending', async () => {
      const hook = await setup()
      hook.rerender({ active: true })
      expect(fetchLibrary).toHaveBeenCalledTimes(1)

      let release = () => {}
      deleteGate = new Promise<void>((r) => (release = r))
      act(() => hook.result.current.setRating(rowOf(hook, 1), null))
      expect(hook.result.current.pending).toBe(1)
      hook.rerender({ active: false })
      hook.rerender({ active: true })
      expect(fetchLibrary).toHaveBeenCalledTimes(1)
      // 先行表示（評価を外した）が、古いサーバーの内容で戻されない
      expect(rowOf(hook, 1).review).toBeNull()
      release()
      await settle(hook)
    })

    it('keeps the current rows if the background refresh fails', async () => {
      const hook = await setup()
      hook.rerender({ active: false })
      vi.mocked(fetchLibrary).mockRejectedValueOnce(new Error('offline'))
      hook.rerender({ active: true })
      await waitFor(() => expect(fetchLibrary).toHaveBeenCalledTimes(2))
      expect(hook.result.current.rows).toHaveLength(2)
      expect(hook.result.current.loadError).toBeNull()
    })
  })
})

describe('how the reviews are read', () => {
  it('reads everything the first time, only the difference when shown again, and everything again on a manual reload', async () => {
    vi.mocked(scanMyReviews).mockClear()
    const hook = await setup()
    expect(vi.mocked(scanMyReviews)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(scanMyReviews).mock.calls[0]).toEqual(['t'])

    // 再び表示したときの裏の読み直しは差分だけ（stopBefore がある）
    hook.rerender({ active: false })
    hook.rerender({ active: true })
    await waitFor(() => expect(vi.mocked(scanMyReviews)).toHaveBeenCalledTimes(2))
    expect(vi.mocked(scanMyReviews).mock.calls[1][1]).toEqual({ stopBefore: expect.any(String) })

    // 「もう一度読み込む」は全部を読み直す
    await waitFor(() => expect(hook.result.current.rows).not.toBeNull())
    act(() => hook.result.current.reload())
    await waitFor(() => expect(vi.mocked(scanMyReviews)).toHaveBeenCalledTimes(3))
    expect(vi.mocked(scanMyReviews).mock.calls[2]).toEqual(['t'])
    await waitFor(() => expect(hook.result.current.rows?.[0]?.cover?.url).toBeTypeOf('string'))
  })
})

