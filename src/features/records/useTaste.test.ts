// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '../../lib/shikimori'
import type { Taste } from '../match/tasteLoader'

const media = (idMal: number, genres: string[]): Media => ({
  idMal,
  title: { native: null, romaji: null, english: null },
  format: 'TV',
  status: 'FINISHED',
  isAdult: false,
  seasonYear: 2020,
  genres,
  themes: [],
  demographics: [],
  studios: [],
  cover: null,
  score: null,
  prequels: [],
})

const details = new Map([
  [10, media(10, ['Music'])],
  [11, media(11, ['Horror'])],
])
const taste: Taste = {
  library: [],
  ratings: new Map(),
  seeds: [{ malId: 1, title: '好きな作品', weight: 2 }],
  topSeeds: [{ malId: 1, title: '好きな作品', weight: 2 }],
  seedMedia: new Map([[1, media(1, ['Music'])]]),
  // 好きな作品 1 に似た作品は 10 だけ
  similarSeeds: [{ malId: 1, title: '好きな作品', weight: 2 }],
  similar: new Map([[1, [10]]]),
  profile: new Map([
    ['g:Music', 1],
    ['g:Horror', -1],
  ]),
}

let loadFails = false
vi.mock('../match/tasteLoader', async (orig) => ({
  ...(await orig<typeof import('../match/tasteLoader')>()),
  loadTaste: vi.fn(async () => {
    if (loadFails) throw new Error('offline')
    return taste
  }),
  forgetTaste: vi.fn(),
}))
vi.mock('../../lib/shikimori', () => ({
  fetchMedia: vi.fn(async (ids: number[]) => new Map(ids.filter((i) => details.has(i)).map((i) => [i, details.get(i)!]))),
}))

const { useTaste, useWannaScores } = await import('./useTaste')
const { loadTaste, forgetTaste } = await import('../match/tasteLoader')

beforeEach(() => {
  loadFails = false
  vi.mocked(loadTaste).mockClear()
  vi.mocked(forgetTaste).mockClear()
})

describe('useTaste', () => {
  it('does not load until it is needed', () => {
    const hook = renderHook(() => useTaste('t', false, true))
    expect(hook.result.current.state.status).toBe('idle')
    expect(loadTaste).not.toHaveBeenCalled()
  })

  it('loads once enabled, showing loading first', async () => {
    const hook = renderHook(({ enabled }) => useTaste('t', enabled, true), { initialProps: { enabled: false } })
    hook.rerender({ enabled: true })
    expect(hook.result.current.state.status).toBe('loading')
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
  })

  it('reports a failure and tries again on retry', async () => {
    loadFails = true
    const hook = renderHook(() => useTaste('t', true, true))
    await waitFor(() => expect(hook.result.current.state).toEqual({ status: 'error', message: 'offline' }))
    loadFails = false
    hook.result.current.retry()
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
  })

  it('forgets what it read when the tab is shown again, so ratings added meanwhile are counted', async () => {
    const hook = renderHook(({ active }) => useTaste('t', true, active), { initialProps: { active: true } })
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    expect(forgetTaste).not.toHaveBeenCalled()
    hook.rerender({ active: false })
    hook.rerender({ active: true })
    expect(forgetTaste).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(loadTaste).toHaveBeenCalledTimes(2))
  })
})

describe('useWannaScores', () => {
  it('scores the wanna works, with the similar one first', async () => {
    const hook = renderHook(() => useWannaScores(taste, '10,11'))
    await waitFor(() => expect(hook.result.current.scores).not.toBeNull())
    const s = hook.result.current.scores!
    expect(s.get(10)!.score).toBeGreaterThan(s.get(11)!.score)
    expect(s.get(10)!.reason).toBe('『好きな作品』が好きな人のおすすめ')
  })

  it('has no scores until a taste is available', () => {
    const hook = renderHook(() => useWannaScores(null, '10'))
    expect(hook.result.current.scores).toBeNull()
  })

  it('keeps showing the earlier scores while a changed list is recalculated', async () => {
    const hook = renderHook(({ key }) => useWannaScores(taste, key), { initialProps: { key: '10' } })
    await waitFor(() => expect(hook.result.current.scores).not.toBeNull())
    hook.rerender({ key: '10,11' })
    expect(hook.result.current.scores).not.toBeNull()
    await waitFor(() => expect(hook.result.current.scores!.has(11)).toBe(true))
  })
})
