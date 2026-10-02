import { describe, expect, it, vi } from 'vitest'

const search = vi.fn()
vi.mock('../../lib/annict', () => ({ searchWorksByTitle: (...a: unknown[]) => search(...a) }))

const { resolveAnnictWork, titleVariants } = await import('./resolve')

describe('titleVariants', () => {
  it('tries the native title, its NFKC form, the leading word, then English and romaji, without duplicates', () => {
    expect(titleVariants({ native: 'ゆるキャン△ SEASON２', english: 'Laid-Back Camp Season 2', romaji: 'Yuru Camp△ SEASON 2' })).toEqual([
      'ゆるキャン△ SEASON２',
      'ゆるキャン△ SEASON2',
      'ゆるキャン△',
      'Laid-Back Camp Season 2',
      'Yuru Camp△ SEASON 2',
    ])
  })

  it('skips the leading word when it is too short, and skips empty titles', () => {
    // NFKC で「86-エイティシックス-」になり、先頭の語は「86」の2文字
    expect(titleVariants({ native: '86－エイティシックス－', english: null, romaji: '86' })).toEqual([
      '86－エイティシックス－',
      '86-エイティシックス-',
      '86',
    ])
    expect(titleVariants({ native: null, english: '', romaji: 'Sousou no Frieren' })).toEqual(['Sousou no Frieren'])
  })
})

describe('resolveAnnictWork', () => {
  const m = {
    idMal: 38474,
    title: { native: 'ゆるキャン△ SEASON２', english: null, romaji: null },
  } as Parameters<typeof resolveAnnictWork>[1]

  it('stops at the first variant whose results contain the same MyAnimeList ID', async () => {
    search.mockReset()
    search
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'X', annictId: 1, title: '別作品', malAnimeId: '1' },
        { id: 'W', annictId: 2, title: 'ゆるキャン△ SEASON2', malAnimeId: '38474' },
      ])
    await expect(resolveAnnictWork('t', m)).resolves.toMatchObject({ id: 'W' })
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('returns null when no variant matches', async () => {
    search.mockReset()
    search.mockResolvedValue([{ id: 'X', annictId: 1, title: '別作品', malAnimeId: '1' }])
    await expect(resolveAnnictWork('t', m)).resolves.toBeNull()
    expect(search).toHaveBeenCalledTimes(3)
  })
})
