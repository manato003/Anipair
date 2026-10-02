// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// 平均点の取得: 1回の問い合わせで表紙も控え、2回目は問い合わせない
const requested: number[][] = []

beforeEach(() => {
  localStorage.clear()
  requested.length = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const ids = (JSON.parse(String(init.body)) as { variables: { ids: number[] } }).variables.ids
      requested.push(ids)
      // 3 は AniList に無い作品、2 は点数が無い作品
      const media = ids
        .filter((id) => id !== 3)
        .map((id) => ({ idMal: id, averageScore: id === 2 ? null : 60 + id, coverImage: { extraLarge: `https://img.example/${id}.jpg`, large: null, color: null } }))
      return new Response(JSON.stringify({ data: { Page: { media } } }), { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('returns scores (null when missing), remembers covers, and does not ask twice', async () => {
  const { fetchCovers, fetchScores } = await import('./anilist')
  const first = await fetchScores([1, 2, 3])
  expect([...first]).toEqual([
    [1, 61],
    [2, null],
    [3, null],
  ])
  expect(requested).toEqual([[1, 2, 3]])

  // 表紙は同じ問い合わせで控えてあるので、取り直さない
  const covers = await fetchCovers([1, 2])
  expect(covers.get(1)?.url).toBe('https://img.example/1.jpg')
  // 点数も、返ってこなかった 3 を含めて取り直さない
  await fetchScores([1, 2, 3])
  expect(requested).toHaveLength(1)
})
