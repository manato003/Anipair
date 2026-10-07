import { describe, expect, it, vi } from 'vitest'

const search = vi.fn()
vi.mock('../../lib/annict', () => ({ searchWorksByTitle: (...a: unknown[]) => search(...a) }))

const { resolveAnnictWork, titleVariants } = await import('./resolve')

describe('titleVariants', () => {
  it('tries the native title, its NFKC form and the leading word first (most works match here)', () => {
    expect(titleVariants({ native: 'ゆるキャン△ SEASON２', english: 'Laid-Back Camp Season 2', romaji: 'Yuru Camp△ SEASON 2' }).slice(0, 3)).toEqual([
      'ゆるキャン△ SEASON２',
      'ゆるキャン△ SEASON2',
      'ゆるキャン△',
    ])
  })

  it('skips a short leading word, and skips empty titles', () => {
    // NFKC で「86-エイティシックス-」になり、先頭の語は「86」の2文字
    expect(titleVariants({ native: '86－エイティシックス－', english: null, romaji: '86' })).toEqual([
      '86－エイティシックス－',
      '86-エイティシックス-',
      'エイティシックス',
      '86',
    ])
    expect(titleVariants({ native: null, english: '', romaji: 'Sousou no Frieren' })).toEqual(['SousounoFrieren', 'Sousou no Frieren', 'Sousou'])
  })

  // Annict の検索は日本語の題名への部分一致だけ。Shikimori の表記の違いで外れた実例（2026-10-07 の実測）
  it.each([
    // Annict: 劇場版 魔法少女まどか☆マギカ [新編] 叛逆の物語
    ['劇場版 魔法少女まどか☆マギカ 叛逆の物語', '叛逆の物語'],
    // Annict: 魔法少女まどか☆マギカ
    ['魔法少女まどか★マギカ', '魔法少女まどか☆マギカ'],
    // Annict: 冴えない彼女の育てかた（読みがなの括弧を外す）
    ['冴えない彼女〈ヒロイン〉の育てかた', '冴えない彼女の育てかた'],
    // Annict: IS＜インフィニット・ストラトス＞（括弧の中が本題）
    ['IS 〈インフィニット・ストラトス〉', 'インフィニット'],
    // Annict: 落第騎士の英雄譚
    ['落第騎士の英雄譚《キャバルリィ》', '落第騎士の英雄譚'],
    // Annict: 銀魂゜（° と ゜ は別の文字。漢字だけなら2文字でも引く）
    ['銀魂°', '銀魂'],
    // Annict: ダンジョンに出会いを求めるのは間違っているだろうかⅡ（NFKC で II になる）
    ['ダンジョンに出会いを求めるのは間違っているだろうかII', 'ダンジョンに出会いを求めるのは間違っているだろうか'],
    // Annict: メイドインアビス 深き魂の黎明
    ['劇場版メイドインアビス 深き魂の黎明', 'メイドインアビス'],
  ])('%s → also searches %s', (native, piece) => {
    expect(titleVariants({ native, english: null, romaji: null })).toContain(piece)
  })

  it('searches the English name without spaces and its first word (Annict titles in Latin letters)', () => {
    // Annict: Dr.STONE（大文字小文字は区別されない）
    expect(titleVariants({ native: 'ドクターストーン', english: 'Dr. Stone', romaji: null })).toContain('Dr.Stone')
    // Annict: Persona4 the ANIMATION
    expect(titleVariants({ native: 'ペルソナ4アニメーション', english: 'Persona 4 The Animation', romaji: null })).toContain('Persona')
  })

  it('tries longer pieces first, without duplicates, and at most 12', () => {
    const v = titleVariants({ native: '劇場版 魔法少女まどか☆マギカ 叛逆の物語', english: 'Puella Magi Madoka Magica the Movie: Rebellion', romaji: 'Mahou Shoujo Madoka★Magica Movie 3: Hangyaku no Monogatari' })
    expect(v.indexOf('魔法少女まどか')).toBeLessThan(v.indexOf('マギカ'))
    expect(new Set(v).size).toBe(v.length)
    expect(v.length).toBeLessThanOrEqual(12)
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
    expect(search).toHaveBeenCalledTimes(titleVariants(m.title).length)
  })
})
