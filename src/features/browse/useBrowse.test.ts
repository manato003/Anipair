// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork } from '../../lib/annict'

const calls: { filter: unknown; after: string | null; first: number; order: string }[] = []

function w(annictId: number, watchers: number): BrowseWork {
  return {
    id: `W${annictId}`,
    annictId,
    title: `作品${annictId}`,
    media: 'TV',
    seasonYear: 2026,
    seasonName: 'SUMMER',
    malAnimeId: String(100 + annictId),
    watchersCount: watchers,
    viewerStatusState: null,
  }
}

// 1ページ目と2ページ目。視聴者の多い順に並んでいる
const pages: Record<string, { works: BrowseWork[]; endCursor: string | null; hasNext: boolean }> = {
  first: { works: [w(1, 900), w(2, 800)], endCursor: 'c1', hasNext: true },
  c1: { works: [w(3, 100)], endCursor: null, hasNext: false },
}

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  browseWorks: vi.fn(async (_t: string, filter: unknown, opts: { after?: string | null; first?: number; order?: string } = {}) => {
    const { after = null, first = 30, order = 'WATCHERS_COUNT' } = opts
    calls.push({ filter, after, first, order })
    return pages[after ?? 'first']
  }),
}))
vi.mock('../../lib/covers', async (orig) => ({ ...(await orig<typeof import('../../lib/covers')>()), fetchCovers: vi.fn(async () => new Map()) }))
// 視聴者の少ない 3 の Shikimori の点数が一番高い（9.5 → 95）。1 は 7.0。2 は点数なし
vi.mock('../../lib/shikimori', () => ({
  fetchMedia: vi.fn(async (ids: number[]) => new Map(ids.map((id) => [id, { idMal: id, score: id === 103 ? 9.5 : id === 101 ? 7 : null }]))),
}))
vi.mock('../../lib/myReviews', () => ({ getMyReviews: vi.fn(async () => new Map()) }))

const { useBrowse } = await import('./useBrowse')

beforeEach(() => {
  calls.length = 0
})

async function setup() {
  const hook = renderHook(() => useBrowse('t'))
  await waitFor(() => expect(hook.result.current.works).not.toBeNull())
  return hook
}

describe('useBrowse sorting', () => {
  it('popular: one page from Annict ordered by watchers, with more to load', async () => {
    const hook = await setup()
    expect(hook.result.current.works!.map((x) => x.annictId)).toEqual([1, 2])
    expect(hook.result.current.hasMore).toBe(true)
    expect(calls).toEqual([{ filter: { seasons: [expect.any(String)] }, after: null, first: 30, order: 'WATCHERS_COUNT' }])
  })

  it('score: collects every page first, then orders by Annict satisfaction, else the Shikimori score, with unscored last', async () => {
    const hook = await setup()
    calls.length = 0
    act(() => hook.result.current.setSort('score'))
    await waitFor(() => expect(hook.result.current.works?.length).toBe(3))
    expect(hook.result.current.works!.map((x) => x.annictId)).toEqual([3, 1, 2])
    expect(hook.result.current.hasMore).toBe(false)
    expect(calls.map((c) => [c.after, c.first])).toEqual([
      [null, 50],
      ['c1', 50],
    ])
    expect(hook.result.current.scores.get(3)).toEqual({ value: 95, label: 'Shikimori 9.5' })
  })

  it('newest only applies while searching; the season list stays by popularity', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const hook = await setup()
    act(() => hook.result.current.setSort('newest'))
    expect(hook.result.current.sort).toBe('popular')
    act(() => hook.result.current.setQuery('フリーレン'))
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    await waitFor(() => expect(calls.at(-1)?.filter).toEqual({ titles: ['フリーレン'] }))
    expect(hook.result.current.sort).toBe('newest')
    expect(calls.at(-1)?.order).toBe('SEASON')
    vi.useRealTimers()
  })
})
