import { describe, expect, it } from 'vitest'
import { profileShare, SHARE_URL, trendsShare } from './shareCard'

const summary = { watched: 78, watching: 0, wanna: 80, stopped: 2, rated: 70, completion: 0.975 }

describe('trendsShare', () => {
  it('puts the numbers, the genre radar and the short facts on the card', () => {
    const card = trendsShare({
      summary,
      harsh: { diff: 0.84, label: '世間より甘口' },
      genres: [
        { name: 'Drama', count: 10, average: 3.6 },
        { name: 'Sci-Fi', count: 8, average: 3.9 },
        { name: 'Romance', count: 6, average: 2.5 },
        { name: 'Comedy', count: 5, average: null },
      ],
      golden: { from: 2010, to: 2012 },
      major: { label: '発掘派' },
      affinity: { liked: [{ key: '1', name: '白石晴香', score: 0.8, n: 3, series: 3, example: null }] },
      topAxis: { key: 'ratingStoryState', n: 6, average: 3.2, link: 0.8 },
      title: { name: '踏破者', rarity: 'bronze' },
    })
    expect(card.kpis).toEqual([
      { label: '見た作品', value: '78本' },
      { label: '評価した作品', value: '70本' },
      { label: '完走率', value: '98%' },
    ])
    expect(card.radar?.map((r) => r.value)).toEqual([0.8, 0.95, 0.25, 0])
    expect(card.facts).toEqual([
      { label: '評価のくせ', value: '世間より甘口（+0.8点）' },
      { label: '高く評価するジャンル', value: 'SF・ドラマ・恋愛' },
      { label: '黄金期', value: '2010〜2012年' },
      { label: 'タイプ', value: '発掘派' },
      { label: '隠れ推しの声優', value: '白石晴香' },
      { label: '重視する観点', value: 'ストーリー' },
    ])
    expect(card.title).toEqual({ name: '踏破者', rarity: 'bronze' })
    expect(card.text).toContain(SHARE_URL)
  })

  it('leaves out what is not known yet, and the radar when there are fewer than three genres', () => {
    const card = trendsShare({ summary: { ...summary, completion: null }, harsh: null, genres: [], golden: null, major: null, affinity: null, topAxis: null, title: null })
    expect(card.kpis.map((k) => k.label)).toEqual(['見た作品', '評価した作品'])
    expect(card.radar).toBeNull()
    expect(card.facts).toEqual([])
  })
})

describe('profileShare', () => {
  it('shows the title, the counts and the best titles with their rarity', () => {
    const card = profileShare({
      title: { name: '時を喰らう者', rarity: 'amethyst' },
      unlocked: 12,
      total: 40,
      hiddenUnlocked: 2,
      hiddenTotal: 9,
      best: [
        { name: '時を喰らう者', rarity: 'amethyst' },
        { name: '踏破者', rarity: 'bronze' },
      ],
    })
    expect(card.kpis).toEqual([
      { label: '称号', value: '12 / 40' },
      { label: '隠し称号', value: '2 / 9' },
    ])
    expect(card.facts).toEqual([
      { label: '紫晶', value: '時を喰らう者', rarity: 'amethyst' },
      { label: '銅', value: '踏破者', rarity: 'bronze' },
    ])
  })
})
