import { describe, expect, it } from 'vitest'
import { resetLangForTests } from './i18n'
import { episodeNumber, personName, shikiTitle, staffRole, workTitle } from './names'

describe('names in Japanese', () => {
  it('keeps the Japanese title, names, Annict’s episode text and roles', () => {
    expect(workTitle({ title: '薬屋のひとりごと', titleEn: 'Kusuriya no Hitorigoto' })).toBe('薬屋のひとりごと')
    expect(shikiTitle({ native: '葬送のフリーレン', romaji: 'Sousou no Frieren', english: 'Frieren' })).toBe('葬送のフリーレン')
    expect(personName({ name: '花澤香菜', nameEn: 'Kana Hanazawa' })).toBe('花澤香菜')
    expect(episodeNumber({ number: 6, numberText: '#6' })).toBe('#6')
    expect(staffRole('監督')).toBe('監督')
  })
})

describe('names in English', () => {
  it('uses the romanized title, English names, “Ep. N” and English roles', () => {
    resetLangForTests('en')
    expect(workTitle({ title: '薬屋のひとりごと', titleEn: 'Kusuriya no Hitorigoto' })).toBe('Kusuriya no Hitorigoto')
    expect(shikiTitle({ native: '葬送のフリーレン', romaji: 'Sousou no Frieren', english: 'Frieren' })).toBe('Sousou no Frieren')
    expect(personName({ name: '花澤香菜', nameEn: 'Kana Hanazawa' })).toBe('Kana Hanazawa')
    expect(episodeNumber({ number: 6, numberText: '第6話' })).toBe('Ep. 6')
    expect(staffRole('アニメーション制作')).toBe('Animation production')
    expect(staffRole('その他', 'Special thanks')).toBe('Special thanks')
  })

  it('falls back to the Japanese when there is no English', () => {
    resetLangForTests('en')
    expect(workTitle({ title: '荒川アンダー ザ ブリッジ×ブリッジ', titleEn: '' })).toBe('荒川アンダー ザ ブリッジ×ブリッジ')
    expect(personName({ name: '名無し', nameEn: null })).toBe('名無し')
    expect(episodeNumber({ number: null, numberText: '特別編' })).toBe('特別編')
    expect(shikiTitle({ native: null, romaji: null, english: null }, 'MAL 1')).toBe('MAL 1')
  })
})
