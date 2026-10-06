// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'

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

// クールの作品は視聴者の多い順に 1, 2, 3（2 ページに分かれている）
const pages: Record<string, { works: BrowseWork[]; endCursor: string | null; hasNext: boolean }> = {
  first: { works: [w(1, 900), w(2, 800)], endCursor: 'c1', hasNext: true },
  c1: { works: [w(3, 100)], endCursor: null, hasNext: false },
}
const calls: { filter: unknown; after: string | null; first: number; order: string }[] = []

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  browseWorks: vi.fn(async (_t: string, filter: unknown, opts: { after?: string | null; first?: number; order?: string } = {}) => {
    const { after = null, first = 30, order = 'WATCHERS_COUNT' } = opts
    calls.push({ filter, after, first, order })
    return pages[after ?? 'first']
  }),
}))
vi.mock('../../lib/covers', async (orig) => ({ ...(await orig<typeof import('../../lib/covers')>()), fetchCovers: vi.fn(async () => new Map()) }))
vi.mock('../../lib/myReviews', () => ({ getMyReviews: vi.fn(async () => new Map()) }))

function media(idMal: number, genres: string[]): Media {
  return {
    idMal,
    title: { native: `作品${idMal}`, romaji: null, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2026,
    genres,
    themes: [],
    demographics: [],
    studios: [],
    cover: null,
    score: null,
    prequels: [],
    related: [],
  }
}
// 好みに合う順は 3 > 1 > 2（3 は好きな作品に似ていて Music でもある。2 は苦手な Horror）
const fetchMedia = vi.fn(async (ids: number[]) => new Map(ids.map((id) => [id, media(id, id === 102 ? ['Horror'] : ['Music'])])))
vi.mock('../../lib/shikimori', () => ({ fetchMedia: (ids: number[]) => fetchMedia(ids) }))

const liked = { malId: 1, title: '好きな作品', weight: 2 }
const likedTaste = {
  seeds: [liked],
  similarSeeds: [liked],
  similar: new Map([[1, [103]]]),
  profile: new Map([
    ['g:Music', 0.9],
    ['g:Horror', -0.7],
  ]),
}
const noLikesTaste = { seeds: [{ malId: 5, title: '苦手', weight: -1.5 }], similarSeeds: [], similar: new Map(), profile: new Map() }

const loadTaste = vi.fn()
const forgetTaste = vi.fn()
vi.mock('../match/tasteLoader', () => ({
  loadTaste: (token: string, onStep?: (s: string) => void) => loadTaste(token, onStep),
  forgetTaste: () => forgetTaste(),
}))

const { useBrowse, NO_LIKES_NOTE } = await import('./useBrowse')

beforeEach(() => {
  calls.length = 0
  fetchMedia.mockClear()
  loadTaste.mockReset()
  forgetTaste.mockClear()
  loadTaste.mockImplementation(async () => likedTaste)
})

async function setup(active = true) {
  const hook = renderHook((p: { active: boolean }) => useBrowse('t', p.active), { initialProps: { active } })
  await waitFor(() => expect(hook.result.current.works).not.toBeNull())
  return hook
}

describe('useBrowse おすすめ順', () => {
  it('collects every page, then orders like the wanna list with a reason per work, and has no 「もっと見る」', async () => {
    const hook = await setup()
    calls.length = 0
    act(() => hook.result.current.setSort('taste'))
    await waitFor(() => expect(hook.result.current.works?.length).toBe(3))
    const r = hook.result.current
    expect(r.sort).toBe('taste')
    expect(r.works!.map((x) => x.annictId)).toEqual([3, 1, 2])
    expect(r.hasMore).toBe(false)
    expect(calls.map((c) => [c.after, c.first])).toEqual([
      [null, 50],
      ['c1', 50],
    ])
    expect(r.reasons.get(3)).toContain('好きな作品')
    expect(r.reasons.get(1)).toContain('好きなジャンル')
    expect(r.reasons.has(2)).toBe(false)
    expect(r.sortNote).toBeNull()
    expect(loadTaste).toHaveBeenCalledWith('t', expect.any(Function))
    expect(fetchMedia).toHaveBeenCalledWith([101, 102, 103])
  })

  it('shows the taste loading steps while it waits', async () => {
    const hook = await setup()
    let release: () => void = () => undefined
    loadTaste.mockImplementation(
      (_token: string, onStep?: (s: string) => void) =>
        new Promise((resolve) => {
          onStep?.('似た作品を検索中（3/32）')
          release = () => resolve(likedTaste)
        }),
    )
    act(() => hook.result.current.setSort('taste'))
    await waitFor(() => expect(hook.result.current.progress).toBe('似た作品を検索中（3/32）'))
    expect(hook.result.current.works).toBeNull()
    await act(async () => release())
    await waitFor(() => expect(hook.result.current.works?.length).toBe(3))
    expect(hook.result.current.progress).toBeNull()
  })

  it('with no liked works, says so and keeps the popularity order without asking Shikimori', async () => {
    loadTaste.mockImplementation(async () => noLikesTaste)
    const hook = await setup()
    act(() => hook.result.current.setSort('taste'))
    await waitFor(() => expect(hook.result.current.sortNote).toBe(NO_LIKES_NOTE))
    expect(NO_LIKES_NOTE).toBe('好みの手がかりがまだありません。評価画面で、好きな作品を評価すると使えます。')
    expect(hook.result.current.works!.map((x) => x.annictId)).toEqual([1, 2, 3])
    expect(hook.result.current.reasons.size).toBe(0)
    expect(fetchMedia).not.toHaveBeenCalled()
  })

  it('when the taste cannot be loaded, still shows the list by popularity with a note', async () => {
    loadTaste.mockImplementation(async () => {
      throw new Error('Shikimori が混み合っています')
    })
    const hook = await setup()
    act(() => hook.result.current.setSort('taste'))
    await waitFor(() => expect(hook.result.current.works?.length).toBe(3))
    expect(hook.result.current.works!.map((x) => x.annictId)).toEqual([1, 2, 3])
    expect(hook.result.current.sortNote).toContain('Shikimori が混み合っています')
    expect(hook.result.current.error).toBeNull()
  })

  it('is for the season list only: while searching it falls back to popularity', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const hook = await setup()
      act(() => hook.result.current.setSort('taste'))
      await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([3, 1, 2]))
      loadTaste.mockClear()
      act(() => hook.result.current.setQuery('ほげ'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      await waitFor(() => expect(hook.result.current.searching).toBe(true))
      expect(hook.result.current.sort).toBe('popular')
      expect(loadTaste).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the cached taste when the tab is shown again, so the next おすすめ順 reads the new ratings', async () => {
    const hook = await setup()
    expect(forgetTaste).not.toHaveBeenCalled()
    hook.rerender({ active: false })
    expect(forgetTaste).not.toHaveBeenCalled()
    hook.rerender({ active: true })
    expect(forgetTaste).toHaveBeenCalledTimes(1)
  })
})
