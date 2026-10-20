import { describe, expect, it } from 'vitest'
import { resetLangForTests } from './i18n'
import { noteEnglishTitle } from './englishTitles'
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
  it('uses the official English title or the romanized one, English names, “Ep. N” and English roles', () => {
    resetLangForTests('en')
    expect(workTitle({ title: '薬屋のひとりごと', titleEn: 'Kusuriya no Hitorigoto' })).toBe('Kusuriya no Hitorigoto')
    expect(shikiTitle({ native: '葬送のフリーレン', romaji: 'Sousou no Frieren', english: 'Frieren' })).toBe('Frieren')
    expect(shikiTitle({ native: '葬送のフリーレン', romaji: 'Sousou no Frieren', english: null })).toBe('Sousou no Frieren')
    // Shikimori から読んだ公式の英題があれば、Annict の作品もそれで出す
    noteEnglishTitle(52991, 'Frieren: Beyond Journey’s End')
    expect(workTitle({ title: '葬送のフリーレン', titleEn: 'Sousou no Frieren', malAnimeId: '52991' })).toBe('Frieren: Beyond Journey’s End')
    expect(workTitle({ title: '葬送のフリーレン', titleEn: 'Sousou no Frieren', malId: 52991 })).toBe('Frieren: Beyond Journey’s End')
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

describe('people and character names in English', () => {
  it('uses Wikidata’s English name, then Annict’s (in first-last order), then the Japanese', async () => {
    const { resetEnglishPeopleForTests } = await import('./englishNames')
    resetLangForTests('en')
    resetEnglishPeopleForTests({ 茅原実里: 'Minori Chihara', 名無し: '' })
    expect(personName({ name: '茅原実里', nameEn: 'Chihara, Minori' })).toBe('Minori Chihara')
    expect(personName({ name: '久川綾', nameEn: 'Hisakawa, Aya' })).toBe('Aya Hisakawa')
    expect(personName({ name: '名無し', nameEn: null })).toBe('名無し')
  })

  it('matches a character by the Japanese name ignoring spaces', async () => {
    const { characterName } = await import('./names')
    resetLangForTests('en')
    const romaji = new Map([['フリーレン', 'Frieren'], ['竈門炭治郎', 'Tanjirou Kamado']])
    expect(characterName({ name: 'フリーレン' }, romaji)).toBe('Frieren')
    expect(characterName({ name: '竈門 炭治郎' }, romaji)).toBe('Tanjirou Kamado')
    expect(characterName({ name: 'モブ', nameEn: null }, romaji)).toBe('モブ')
    resetLangForTests('ja')
    expect(characterName({ name: 'フリーレン' }, romaji)).toBe('フリーレン')
  })
})

describe('castKeys', () => {
  it('makes keys for the whole name, each alias and the given name', async () => {
    const { castKeys } = await import('./shikimori')
    expect(castKeys('漢 羅半')).toEqual(['漢羅半', '羅半'])
    expect(castKeys('響迂 / 趙迂')).toEqual(['響迂/趙迂', '響迂', '趙迂'])
    expect(castKeys('フリーレン')).toEqual(['フリーレン'])
  })
})
