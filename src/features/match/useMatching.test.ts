// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AniMedia } from '../../lib/anilist'
import type { LibraryEntry, RatingState } from '../../lib/annict'
import type { GithubConnection } from '../../lib/github'

const calls: string[] = []
// 共有の感想の控えへの出し入れ（送信の順番とは別に見る）
const remembered: string[] = []
let library: LibraryEntry[] = []
let ratings = new Map<number, RatingState>()
let resolvable = new Set<number>()
// 立てると、同期がこの Promise の解決まで止まる（同期の最中の変更を試すため）
let syncGate: Promise<void> | null = null

function media(idMal: number, extra: Partial<AniMedia> = {}): AniMedia {
  return {
    id: idMal,
    idMal,
    title: { native: `作品${idMal}`, romaji: null, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2020,
    genres: ['Music'],
    tags: [],
    studios: [],
    cover: null,
    prequels: [],
    recommendations: [],
    ...extra,
  }
}

// 好きな作品 1 から、候補 10・11・12 が推薦されている。12 は記録済みなので出ない
const catalog = new Map<number, AniMedia>([
  [1, media(1, { recommendations: [{ idMal: 10, rating: 40 }, { idMal: 11, rating: 20 }, { idMal: 12, rating: 90 }] })],
  [10, media(10)],
  [11, media(11)],
  [12, media(12)],
])

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchLibrary: vi.fn(async () => library),
  fetchMyRatings: vi.fn(async () => ratings),
  updateStatus: vi.fn(async (_t: string, id: string, state: string) => void calls.push(`status ${id} ${state}`)),
  createReview: vi.fn(async (_t: string, id: string, rating: string) => {
    calls.push(`review ${id} ${rating}`)
    return `R-${id}`
  }),
  deleteReview: vi.fn(async (_t: string, id: string) => void calls.push(`delete ${id}`)),
}))
vi.mock('../../lib/anilist', () => ({
  fetchMediaByMal: vi.fn(async (ids: number[]) => new Map(ids.filter((i) => catalog.has(i)).map((i) => [i, catalog.get(i)!]))),
}))
vi.mock('../../lib/myReviews', () => ({
  rememberReview: vi.fn(async (_t: string, id: number, r: { id: string; ratingOverallState: string } | null) => {
    remembered.push(r ? `${id} ${r.id} ${r.ratingOverallState}` : `${id} null`)
  }),
}))
vi.mock('./resolve', () => ({
  resolveAnnictWork: vi.fn(async (_t: string, m: AniMedia) =>
    resolvable.has(m.idMal) ? { id: `A${m.idMal}`, annictId: m.idMal, title: '', malAnimeId: String(m.idMal) } : null,
  ),
}))
vi.mock('./passStore', async (orig) => ({
  ...(await orig<typeof import('./passStore')>()),
  syncPasses: vi.fn(async () => {
    calls.push('sync')
    await syncGate
    return new Map()
  }),
}))

const { useMatching } = await import('./useMatching')
const { syncPasses } = await import('./passStore')
const { resolveAnnictWork } = await import('./resolve')
const { fetchMediaByMal } = await import('../../lib/anilist')

beforeEach(() => {
  calls.length = 0
  remembered.length = 0
  syncGate = null
  vi.mocked(resolveAnnictWork).mockClear()
  localStorage.clear()
  library = [
    { workId: 'W1', annictId: 1, title: '好きな作品', malAnimeId: '1', state: 'WATCHED', stateAt: null },
    { workId: 'W12', annictId: 12, title: '記録済み', malAnimeId: '12', state: 'WANNA_WATCH', stateAt: null },
  ]
  ratings = new Map([[1, 'GREAT']])
  resolvable = new Set([10, 11])
})

const GH = { token: 'gh', repo: 'me/anipair-data' }

async function ready(github: GithubConnection | null = null) {
  const hook = renderHook(() => useMatching('annict', github))
  await act(() => hook.result.current.run())
  await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'))
  return hook
}

async function settle(hook: Awaited<ReturnType<typeof ready>>) {
  await waitFor(() => expect(hook.result.current.pending).toBe(0))
}

describe('useMatching', () => {
  it('suggests unrecorded works, strongest first, with the liked work as the reason', async () => {
    const hook = await ready()
    expect(hook.result.current.cards.map((c) => c.media.idMal)).toEqual([10, 11])
    expect(hook.result.current.current?.reasons[0]).toBe('『好きな作品』が好きな人のおすすめ')
    // GitHub とつないでいなければ同期しない
    expect(calls).toEqual([])
  })

  it('asks for more ratings when nothing is liked yet', async () => {
    ratings = new Map([[1, 'BAD']])
    const hook = renderHook(() => useMatching('annict', null))
    await act(() => hook.result.current.run())
    expect(hook.result.current.phase.kind).toBe('empty')
  })

  it('"want to watch" finds the Annict work and sets WANNA_WATCH; undo clears it', async () => {
    const hook = await ready()
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    expect(hook.result.current.current?.media.idMal).toBe(11)
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status A10 WANNA_WATCH', 'status A10 NO_STATE'])
  })

  it('"seen it" with a rating records WATCHED and the rating; undo removes both', async () => {
    const hook = await ready()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    act(() => hook.result.current.answer({ kind: 'watched' }))
    expect(hook.result.current.done).toBe(true)
    act(() => hook.result.current.undo())
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual([
      'status A10 WATCHED',
      'review A10 GOOD',
      'status A11 WATCHED',
      'status A11 NO_STATE',
      'delete R-A10',
      'status A10 NO_STATE',
    ])
  })

  it('puts a created review in the shared cache under its Annict ID, and takes it out again on undo', async () => {
    const hook = await ready()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    await settle(hook)
    expect(remembered).toEqual(['10 R-A10 GOOD'])
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(remembered).toEqual(['10 R-A10 GOOD', '10 null'])
  })

  it('reports a work that cannot be found on Annict, with a link to search for it', async () => {
    resolvable = new Set()
    const hook = await ready()
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    await settle(hook)
    expect(calls).toEqual([])
    const f = hook.result.current.failed[0]
    expect(f.link?.href).toContain(encodeURIComponent('作品10'))
  })

  it('"pass" is saved on this device and synced to GitHub when connected; undo reverses it', async () => {
    const hook = await ready(GH)
    calls.length = 0
    act(() => hook.result.current.answer({ kind: 'pass' }))
    const saved = JSON.parse(localStorage.getItem('animax.passes')!)
    expect(saved.passes['10'].active).toBe(true)
    act(() => hook.result.current.undo())
    expect(JSON.parse(localStorage.getItem('animax.passes')!).passes['10'].active).toBe(false)
    await settle(hook)
    // 始まる前の同期はまとめられる（控えは同期の始まりに読むので、取り消しまで載る）
    expect(calls).toEqual(['sync'])
    // つないだリポジトリの情報をそのまま渡す
    expect(syncPasses).toHaveBeenCalledWith(GH)
  })

  it('"skip" is saved as a skip and synced; undo reverses it', async () => {
    const hook = await ready(GH)
    calls.length = 0
    act(() => hook.result.current.answer({ kind: 'skip' }))
    expect(hook.result.current.current?.media.idMal).toBe(11)
    expect(JSON.parse(localStorage.getItem('animax.passes')!).passes['10']).toMatchObject({ active: true, kind: 'skip' })
    act(() => hook.result.current.undo())
    expect(JSON.parse(localStorage.getItem('animax.passes')!).passes['10']).toMatchObject({ active: false, kind: 'skip' })
    await settle(hook)
    expect(calls).toEqual(['sync'])
  })

  it('answering several in a row syncs once, and a change during a running sync causes exactly one more', async () => {
    const hook = await ready(GH)
    calls.length = 0
    let release = () => {}
    syncGate = new Promise<void>((r) => (release = r))
    act(() => hook.result.current.answer({ kind: 'pass' }))
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.undo())
    await waitFor(() => expect(calls).toEqual(['sync']))
    // 最初の同期が動いているあいだに変えると、その後にもう1回だけ同期する
    act(() => hook.result.current.undo())
    act(() => hook.result.current.answer({ kind: 'pass' }))
    release()
    await settle(hook)
    expect(calls).toEqual(['sync', 'sync'])
  })

  it('brings a skipped work back after a week, but keeps it hidden before that', async () => {
    const day = 24 * 60 * 60 * 1000
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString()
    localStorage.setItem(
      'animax.passes',
      JSON.stringify({ version: 1, passes: { '10': { at: at(8), active: true, kind: 'skip' }, '11': { at: at(2), active: true, kind: 'skip' } } }),
    )
    const hook = await ready()
    expect(hook.result.current.cards.map((c) => c.media.idMal)).toEqual([10])
  })

  it('does not suggest works passed within the last three months', async () => {
    localStorage.setItem('animax.passes', JSON.stringify({ version: 1, passes: { '10': { at: new Date().toISOString(), active: true } } }))
    const hook = await ready()
    expect(hook.result.current.cards.map((c) => c.media.idMal)).toEqual([11])
  })

  it('searches Annict once per candidate: the detail sheet and answering share the result', async () => {
    const hook = await ready()
    const card = hook.result.current.current!
    await expect(hook.result.current.resolveCard(card)).resolves.toMatchObject({ id: 'A10' })
    await expect(hook.result.current.resolveCard(card)).resolves.toMatchObject({ id: 'A10' })
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    await settle(hook)
    expect(calls).toEqual(['status A10 WANNA_WATCH'])
    expect(resolveAnnictWork).toHaveBeenCalledTimes(1)
  })

  it('does not remember a work that was not found, so it is searched again after registering it on Annict', async () => {
    resolvable = new Set()
    const hook = await ready()
    const card = hook.result.current.current!
    await expect(hook.result.current.resolveCard(card)).resolves.toBeNull()
    resolvable = new Set([10])
    await expect(hook.result.current.resolveCard(card)).resolves.toMatchObject({ id: 'A10' })
    expect(resolveAnnictWork).toHaveBeenCalledTimes(2)
  })

  it('searches again after "run" starts a new set of suggestions', async () => {
    const hook = await ready()
    const card = hook.result.current.current!
    await hook.result.current.resolveCard(card)
    await act(() => hook.result.current.run())
    await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'))
    await hook.result.current.resolveCard(hook.result.current.current!)
    expect(resolveAnnictWork).toHaveBeenCalledTimes(2)
  })

  describe('filters', () => {
    // 好きな作品 1 に、候補 200〜279（80件）を推薦させる
    function bigCatalog() {
      const original = catalog.get(1)!
      catalog.set(1, media(1, { recommendations: Array.from({ length: 80 }, (_, i) => ({ idMal: 200 + i, rating: 80 - i })) }))
      for (let i = 0; i < 80; i++) catalog.set(200 + i, media(200 + i, { format: i % 2 ? 'MOVIE' : 'TV', seasonYear: 1990 + i }))
      return () => {
        catalog.set(1, original)
        for (let i = 0; i < 80; i++) catalog.delete(200 + i)
      }
    }
    const lastDetailIds = () => vi.mocked(fetchMediaByMal).mock.calls.at(-1)![0]

    it('starts from the default, saves a change on this device, and does not re-run by itself', async () => {
      const hook = await ready()
      expect(hook.result.current.filter).toEqual({ formats: ['tv', 'movie', 'ova'], fromYear: null })
      const before = vi.mocked(fetchMediaByMal).mock.calls.length
      act(() => hook.result.current.setFilter({ formats: ['movie'], fromYear: 2010 }))
      expect(JSON.parse(localStorage.getItem('animax.match.filter')!)).toEqual({ formats: ['movie'], fromYear: 2010 })
      expect(vi.mocked(fetchMediaByMal).mock.calls.length).toBe(before)
      expect(hook.result.current.phase.kind).toBe('ready')
      // 保存した条件は、次に開いたときに戻る
      const again = renderHook(() => useMatching('annict', null))
      expect(again.result.current.filter).toEqual({ formats: ['movie'], fromYear: 2010 })
    })

    it('fetches details for the top 50 without a filter, and the top 100 with one', async () => {
      const restore = bigCatalog()
      try {
        const plain = await ready()
        expect(lastDetailIds()).toHaveLength(50)
        expect(plain.result.current.cards.length).toBeGreaterThan(0)

        const hook = renderHook(() => useMatching('annict', null))
        act(() => hook.result.current.setFilter({ formats: ['movie'], fromYear: null }))
        await act(() => hook.result.current.run())
        await waitFor(() => expect(hook.result.current.phase.kind).toBe('ready'))
        expect(lastDetailIds()).toHaveLength(80)
        expect(hook.result.current.cards.every((c) => c.media.format === 'MOVIE')).toBe(true)
      } finally {
        restore()
      }
    })

    it('tells the user to loosen the conditions when a filter leaves nothing', async () => {
      const hook = renderHook(() => useMatching('annict', null))
      act(() => hook.result.current.setFilter({ formats: ['ova'], fromYear: null }))
      await act(() => hook.result.current.run())
      await waitFor(() => expect(hook.result.current.phase.kind).toBe('empty'))
      const phase = hook.result.current.phase
      expect(phase.kind === 'empty' && phase.message).toContain('条件をゆるめて')
    })
  })
})
