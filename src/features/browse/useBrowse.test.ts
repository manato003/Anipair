// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork } from '../../lib/annict'

const calls: { filter: unknown; after: string | null; first: number; order: string; direction?: string }[] = []

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
  // ほかの画面で W2 を「見たい」にした
  fetchLibrary: vi.fn(async () => [{ annictId: 2, state: 'WANNA_WATCH' }]),
  browseWorks: vi.fn(async (_t: string, filter: unknown, opts: { after?: string | null; first?: number; order?: string; direction?: string } = {}) => {
    const { after = null, first = 30, order = 'WATCHERS_COUNT', direction } = opts
    calls.push({ filter, after, first, order, direction })
    return pages[after ?? 'first']
  }),
}))
vi.mock('../../lib/covers', async (orig) => ({ ...(await orig<typeof import('../../lib/covers')>()), fetchCovers: vi.fn(async () => new Map()) }))
// 視聴者の少ない 3 の Shikimori の点数が一番高い（9.5 → 95）。1 は 7.0。2 は点数なし
vi.mock('../../lib/shikimori', () => ({
  fetchMedia: vi.fn(async (ids: number[]) => new Map(ids.map((id) => [id, { idMal: id, score: id === 103 ? 9.5 : id === 101 ? 7 : null }]))),
  searchTitles: vi.fn(async () => []),
}))
vi.mock('../../lib/myReviews', () => ({ getMyReviews: vi.fn(async () => new Map()) }))
// 条件検索（期間の全作品から、ジャンル・制作会社で探す）。ページの番号ごとに1作品
const findCalls: { narrow: unknown; period: unknown; order: string; page: number }[] = []
vi.mock('./conditionSearch', async (orig) => ({
  ...(await orig<typeof import('./conditionSearch')>()),
  findPage: vi.fn(async (_t: string, narrow: unknown, period: unknown, order: string, page: number) => {
    findCalls.push({ narrow, period, order, page })
    return { works: [w(50 + page, 10)], endCursor: page < 2 ? String(page + 1) : null, hasNext: page < 2, capped: false }
  }),
}))

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
    expect(calls).toEqual([{ filter: { seasons: [expect.any(String)] }, after: null, first: 30, order: 'WATCHERS_COUNT', direction: 'DESC' }])
  })

  it('period: reads every cour of the period instead of one, offers 新しい順, and goes back to the cour', async () => {
    const hook = await setup()
    calls.length = 0
    act(() => hook.result.current.setPeriod({ from: { year: 2018, name: 'autumn' }, to: { year: 2019, name: 'spring' } }))
    await waitFor(() => expect(hook.result.current.works).not.toBeNull())
    expect(hook.result.current.mode).toBe('period')
    expect(calls.at(-1)?.filter).toEqual({ seasons: ['2018-autumn', '2019-winter', '2019-spring'] })
    act(() => hook.result.current.setSort('newest'))
    await waitFor(() => expect(calls.at(-1)?.order).toBe('SEASON'))
    expect(hook.result.current.sort).toBe('newest')
    act(() => hook.result.current.setPeriod({ from: null, to: null }))
    await waitFor(() => expect(hook.result.current.mode).toBe('cour'))
    expect(hook.result.current.sort).toBe('popular')
  })

  // 2026-10-06 の点検: 実際の並べ方が変わらないのに一覧を空にして、読み込み中のまま戻らなかった
  it('pressing the sort in effect turns its direction around and reads again; an unavailable sort keeps the list', async () => {
    const hook = await setup()
    act(() => hook.result.current.setSort('popular'))
    expect(hook.result.current.dir).toBe('asc')
    await waitFor(() => expect(hook.result.current.works).not.toBeNull())
    expect(calls.at(-1)?.direction).toBe('ASC')
    // クールで選べない並び（新しい順）は人気順のまま。押しても一覧は消えない
    act(() => hook.result.current.setSort('newest'))
    expect(hook.result.current.sort).toBe('popular')
    expect(hook.result.current.works).not.toBeNull()
  })

  it('a slow 「もっと見る」 that returns after the cour was changed is dropped, and its failure keeps the list', async () => {
    const { browseWorks } = await import('../../lib/annict')
    const hook = await setup()
    let release!: () => void
    vi.mocked(browseWorks).mockImplementationOnce(async () => {
      await new Promise<void>((r) => (release = r))
      return pages.c1
    })
    act(() => void hook.result.current.loadMore())
    // 続きが届く前にクールを変えた
    act(() => hook.result.current.setSeason({ year: 2020, name: 'spring' }))
    await waitFor(() => expect(hook.result.current.works).not.toBeNull())
    await act(async () => release())
    expect(hook.result.current.works!.map((x) => x.annictId)).toEqual([1, 2])
    expect(hook.result.current.loadingMore).toBe(false)
    // 続きの失敗は、読めている一覧を消さない
    vi.mocked(browseWorks).mockRejectedValueOnce(new Error('HTTP 502'))
    await act(async () => hook.result.current.loadMore())
    expect(hook.result.current.error).toBeNull()
    expect(hook.result.current.moreError).toBe('HTTP 502')
    expect(hook.result.current.works!.map((x) => x.annictId)).toEqual([1, 2])
  })

  // 2026-10-06 の点検: ほかの画面で記録した状態が、一覧を読み直すまで出なかった
  it('when shown again, takes the record states from the library (changed on other screens)', async () => {
    const hook = renderHook(({ active }) => useBrowse('t', active), { initialProps: { active: true } })
    await waitFor(() => expect(hook.result.current.works).not.toBeNull())
    hook.rerender({ active: false })
    hook.rerender({ active: true })
    await waitFor(() => expect(hook.result.current.works!.find((x) => x.annictId === 2)?.viewerStatusState).toBe('WANNA_WATCH'))
    expect(hook.result.current.works!.find((x) => x.annictId === 1)?.viewerStatusState).toBeNull()
  })

  it('setting the same period again keeps the list (no reload)', async () => {
    const hook = await setup()
    calls.length = 0
    act(() => hook.result.current.setPeriod({ from: null, to: null }))
    expect(hook.result.current.works).not.toBeNull()
    expect(calls).toEqual([])
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

  // 2026-10-06 の点検: Shikimori が読めないと、評価順の一覧ごと失敗していた
  it('score: when Shikimori cannot be read, still lists the works and says why the order is partial', async () => {
    const { fetchMedia } = await import('../../lib/shikimori')
    vi.mocked(fetchMedia).mockRejectedValueOnce(new Error('Shikimoriが混み合っています'))
    const hook = await setup()
    act(() => hook.result.current.setSort('score'))
    await waitFor(() => expect(hook.result.current.works?.length).toBe(3))
    expect(hook.result.current.error).toBeNull()
    expect(hook.result.current.sortNote).toContain('Annictの満足度だけで並べています')
    expect(hook.result.current.progress).toBeNull()
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
    // タイトルと期間は両方に当てはまるものを探す
    act(() => hook.result.current.setPeriod({ from: { year: 2023, name: 'autumn' }, to: { year: 2023, name: 'autumn' } }))
    await waitFor(() => expect(calls.at(-1)?.filter).toEqual({ titles: ['フリーレン'], seasons: ['2023-autumn'] }))
    vi.useRealTimers()
  })
})

describe('useBrowse searching by an English or romaji title', () => {
  async function search(query: string) {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const hook = await setup()
    act(() => hook.result.current.setQuery(query))
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    vi.useRealTimers()
    return hook
  }

  it('also asks Annict for the Japanese titles from Shikimori and keeps only the works Shikimori found', async () => {
    const { searchTitles } = await import('../../lib/shikimori')
    vi.mocked(searchTitles).mockResolvedValueOnce([{ malId: 101, japanese: '作品1' }, { malId: 105, japanese: '作品1' }, { malId: 999, japanese: null }])
    const hook = await search('Sakuhin')
    await waitFor(() => expect(calls.at(-1)?.filter).toEqual({ titles: ['Sakuhin', '作品1'] }))
    expect(searchTitles).toHaveBeenCalledWith('Sakuhin')
    // 1ページ目の 1・2 のうち、Shikimori が返した MyAnimeList の ID（101）の作品だけ
    await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([1]))
  })

  it('searches by the words alone when Shikimori fails or finds nothing, and never asks it for Japanese words', async () => {
    const { searchTitles } = await import('../../lib/shikimori')
    vi.mocked(searchTitles).mockClear()
    vi.mocked(searchTitles).mockRejectedValueOnce(new Error('Shikimoriが混み合っています'))
    const hook = await search('Frieren')
    await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([1, 2]))
    expect(calls.at(-1)?.filter).toEqual({ titles: ['Frieren'] })
    expect(hook.result.current.error).toBeNull()
    act(() => hook.result.current.setQuery('フリーレン'))
    await waitFor(() => expect(calls.at(-1)?.filter).toEqual({ titles: ['フリーレン'] }))
    expect(searchTitles).toHaveBeenCalledTimes(1)
  })
})

describe('useBrowse narrowing a period by genres and studios', () => {
  it('searches the whole period after the chips settle, keeps the period’s works for the filter sheet, and loads more by page', async () => {
    findCalls.length = 0
    let narrow: { genres: number[]; studios: number[] } | null = null
    const hook = renderHook(() => useBrowse('t', true, narrow))
    await waitFor(() => expect(hook.result.current.works).not.toBeNull())
    act(() => hook.result.current.setPeriod({ from: { year: 2022, name: 'spring' }, to: { year: 2023, name: 'winter' } }))
    await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([1, 2]))
    // 1クールだけのときは条件検索にしない。期間のときだけ
    narrow = { genres: [10], studios: [] }
    hook.rerender()
    await waitFor(() => expect(hook.result.current.narrowed).toBe(true), { timeout: 2000 })
    await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([51]))
    expect(findCalls[0]).toEqual({ narrow: { genres: [10], studios: [] }, period: { from: '2022-spring', to: '2023-winter' }, order: 'popularity', page: 1 })
    // シートの選択肢には、期間の作品も入る
    expect(hook.result.current.pool?.map((x) => x.annictId)).toEqual([51, 1, 2])
    await act(() => hook.result.current.loadMore())
    expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([51, 52])
    expect(hook.result.current.hasMore).toBe(false)
    // 条件を外したら、すぐ期間の一覧に戻る
    narrow = null
    hook.rerender()
    expect(hook.result.current.narrowed).toBe(false)
    await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([1, 2]))
  })

  it('without a period, searches every cour from the oldest one; with the chips removed it goes back to the cour', async () => {
    findCalls.length = 0
    let narrow: { genres: number[]; studios: number[] } | null = null
    const hook = renderHook(() => useBrowse('t', true, narrow))
    await waitFor(() => expect(hook.result.current.works).not.toBeNull())
    expect(hook.result.current.allPeriod).toBe(false)
    narrow = { genres: [], studios: [569] }
    hook.rerender()
    await waitFor(() => expect(hook.result.current.narrowed).toBe(true), { timeout: 2000 })
    await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([51]))
    expect(hook.result.current.allPeriod).toBe(true)
    expect(hook.result.current.mode).toBe('period')
    expect(findCalls[0].narrow).toEqual({ genres: [], studios: [569] })
    expect(findCalls[0].period).toMatchObject({ from: expect.stringMatching(/^\d{4}-winter$/) })
    narrow = null
    hook.rerender()
    expect(hook.result.current.allPeriod).toBe(false)
    expect(hook.result.current.mode).toBe('cour')
    await waitFor(() => expect(hook.result.current.works?.map((x) => x.annictId)).toEqual([1, 2]))
  })
})
