// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, ViewerStats } from '../../lib/annict'
import type { RecordRow } from '../records/recordList'

// Annict の数値は1起動に1回しか読まない。ここでは「見た」が9本のときに読んだことにする
const stats: ViewerStats = {
  username: 'me',
  name: 'me',
  avatarUrl: null,
  createdAt: '2024-01-01T00:00:00Z',
  recordsCount: 0,
  watchedCount: 9,
  watchingCount: 0,
  wannaWatchCount: 0,
  onHoldCount: 0,
  stopWatchingCount: 0,
  followersCount: 0,
  followingsCount: 0,
}
vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchViewerStats: vi.fn(async () => stats),
  fetchSeasonTops: vi.fn(async () => new Map()),
}))

const { useAchievements } = await import('./useAchievements')

const row = (n: number, state: LibraryEntry['state']): RecordRow => ({
  entry: { workId: `W${n}`, annictId: n, title: `作品${n}`, malAnimeId: null, state, stateAt: null },
  review: null,
  cover: null,
})
const watched = (count: number) => Array.from({ length: count }, (_, i) => row(i + 1, 'WATCHED'))
const unlocked = (titles: { id: string; unlocked: boolean }[] | null, id: string) => titles?.find((t) => t.id === id)?.unlocked

afterEach(() => localStorage.clear())

describe('useAchievements', () => {
  // 2026-10-06 の点検: アプリの中で10本目を「見た」にしても、開き直すまで「見た10本」が解放されなかった
  it('counts the works by state from the records in hand, not from the numbers read once at start', async () => {
    const hook = renderHook(() => useAchievements('t', watched(10), true))
    await waitFor(() => expect(hook.result.current.stats).not.toBeNull())
    expect(hook.result.current.stats?.watchedCount).toBe(10)
    expect(unlocked(hook.result.current.titles, 'watched-10')).toBe(true)
  })

  // 一度手に入れた称号は、条件から外れても取り上げない（利用者と合意）
  it('keeps a title once earned, even when its condition no longer holds', async () => {
    const hook = renderHook(({ rows }) => useAchievements('t', rows, true), { initialProps: { rows: watched(10) } })
    await waitFor(() => expect(unlocked(hook.result.current.titles, 'watched-10')).toBe(true))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('animax.titles.v1') ?? '{}').earned).toContain('watched-10'))
    hook.rerender({ rows: watched(9) })
    expect(hook.result.current.stats?.watchedCount).toBe(9)
    expect(unlocked(hook.result.current.titles, 'watched-10')).toBe(true)
  })
})
