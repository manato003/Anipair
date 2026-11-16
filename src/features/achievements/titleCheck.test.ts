// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ViewerStats } from '../../lib/annict'

const stats: ViewerStats = {
  username: 'me',
  name: 'me',
  avatarUrl: null,
  createdAt: '2024-01-01T00:00:00Z',
  recordsCount: 0,
  watchedCount: 0,
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
}))
const announce = vi.fn()
vi.mock('./titleToast', () => ({ announceEarned: (titles: unknown) => announce(titles) }))

const { useTitleWatch } = await import('./titleCheck')
const { allSeasonSlugs } = await import('./achievementStore')

const ids = () => (announce.mock.calls.at(-1)?.[0] as { id: string }[] | undefined)?.map((t) => t.id) ?? []

afterEach(() => {
  localStorage.clear()
  announce.mockClear()
})

describe('useTitleWatch', () => {
  // 2026-11-16 の通しレビュー O3: 端末の控えに全クールがそろっていないあいだは、年代の称号を知らせも覚えもしない
  it('does not announce a decade title while the device holds only part of the season lists', async () => {
    localStorage.setItem('animax.titles.v1', JSON.stringify({ awakened: true, earned: ['decade-2020'] }))
    localStorage.setItem('animax.seasonTops.v1', JSON.stringify({ '2020-winter': { at: Date.now(), ids: [1] } }))
    renderHook(() => useTitleWatch('t', []))
    await waitFor(() => expect(announce).toHaveBeenCalled())
    expect(ids()).not.toContain('decade-2020')
  })

  // 2026-11-16 の通しレビュー M3: 掲げている称号の控えは、いまの言語の名前にそろえ、条件を満たさなくなったら外す
  const completeTops = () => {
    const tops = Object.fromEntries(allSeasonSlugs(new Date()).map((slug) => [slug, { at: Date.now(), ids: [] }]))
    localStorage.setItem('animax.seasonTops.v1', JSON.stringify(tops))
  }
  const titlesState = () => JSON.parse(localStorage.getItem('animax.titles.v1') ?? '{}')

  it('refreshes the remembered name of the equipped title', async () => {
    completeTops()
    localStorage.setItem('animax.titles.v1', JSON.stringify({ awakened: true, earned: ['watched-10'], equipped: 'watched-10', equippedName: '古い言語の名前', equippedRarity: 'bronze' }))
    renderHook(() => useTitleWatch('t', []))
    await waitFor(() => expect(titlesState().equippedName).not.toBe('古い言語の名前'))
    expect(titlesState().equipped).toBe('watched-10')
  })

  it('unequips a title whose condition no longer holds', async () => {
    completeTops()
    localStorage.setItem('animax.titles.v1', JSON.stringify({ awakened: true, earned: [], equipped: 'watched-10', equippedName: 'x', equippedRarity: 'bronze' }))
    renderHook(() => useTitleWatch('t', []))
    await waitFor(() => expect(titlesState().equipped).toBeNull())
    expect(titlesState().equippedName).toBeNull()
  })

  it('announces a decade title once the device holds every season list', async () => {
    localStorage.setItem('animax.titles.v1', JSON.stringify({ awakened: true, earned: ['decade-2020'] }))
    const tops = Object.fromEntries(allSeasonSlugs(new Date()).map((slug) => [slug, { at: Date.now(), ids: [] }]))
    localStorage.setItem('animax.seasonTops.v1', JSON.stringify(tops))
    renderHook(() => useTitleWatch('t', []))
    await waitFor(() => expect(announce).toHaveBeenCalled())
    expect(ids()).toContain('decade-2020')
  })
})
