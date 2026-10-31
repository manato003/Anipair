import { afterEach, describe, expect, it } from 'vitest'
import { resetLangForTests } from './i18n'
import { isKnownStudio, studioChips, studioName } from './studios'

afterEach(() => resetLangForTests())

describe('studioName', () => {
  it('shows the Japanese name of a well-known studio, matching the Shikimori spelling loosely', () => {
    expect(studioName('Kyoto Animation')).toBe('京都アニメーション')
    expect(studioName('P.A. Works')).toBe('P.A.WORKS')
    expect(studioName('Bandai Namco Filmworks')).toBe('バンダイナムコフィルムワークス')
  })

  it('keeps unknown studios, and every studio on the English screen, as Shikimori names them', () => {
    expect(studioName('Some Studio')).toBe('Some Studio')
    resetLangForTests('en')
    expect(studioName('Kyoto Animation')).toBe('Kyoto Animation')
  })
})

describe('studioChips', () => {
  it('puts the well-known studios first in their order and folds the rest', () => {
    const chips = studioChips([
      { name: 'Some Studio', count: 9 },
      { name: 'MAPPA', count: 5 },
      { name: 'Other', count: 3 },
      { name: 'Kyoto Animation', count: 2 },
    ])
    expect(chips.items.map((c) => c.label)).toEqual(['MAPPA', '京都アニメーション', 'Some Studio', 'Other'])
    // 絞り込みは Shikimori の名前で当てるので、id は英語名のまま
    expect(chips.items[1]).toEqual({ id: 'Kyoto Animation', label: '京都アニメーション', count: 2 })
    expect(chips.first).toBe(2)
  })

  it('folds everything when no well-known studio is there', () => {
    expect(studioChips([{ name: 'Some Studio', count: 1 }]).first).toBe(0)
    expect(isKnownStudio('Some Studio')).toBe(false)
  })
})
