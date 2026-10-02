import { describe, expect, it } from 'vitest'
import { nextSeason, previousSeason, type Season } from '../../lib/season'
import { cleanDescription, mainStaff, safeHttpUrl, workMeta, xUrl } from './detail'

describe('cleanDescription', () => {
  it('turns <br> into line breaks, drops other tags and decodes common entities', () => {
    const raw = 'Elf mage <i>Frieren</i> &amp; friends.<br><br>\n<br>It&#039;s over &mdash; or is it?<br>\n(Source: Crunchyroll)'
    expect(cleanDescription(raw)).toBe("Elf mage Frieren & friends.\n\nIt's over — or is it?\n(Source: Crunchyroll)")
  })

  it('leaves unknown entities alone and handles empty input', () => {
    expect(cleanDescription('a &foo; b')).toBe('a &foo; b')
    expect(cleanDescription(null)).toBe('')
  })
})

describe('mainStaff', () => {
  it('drops "その他", groups repeated roles in order and dedupes names', () => {
    const staffs = [
      { role: '原作', name: '山田鐘人' },
      { role: '原作', name: 'アベツカサ' },
      { role: '監督', name: '斎藤圭一郎' },
      { role: 'その他', name: '誰か' },
      { role: '原作', name: '山田鐘人' },
      { role: '音楽', name: 'Evan Call' },
      { role: '', name: '空' },
    ]
    expect(mainStaff(staffs)).toEqual([
      { role: '原作', names: ['山田鐘人', 'アベツカサ'] },
      { role: '監督', names: ['斎藤圭一郎'] },
      { role: '音楽', names: ['Evan Call'] },
    ])
  })

  it('stops adding new roles at the limit but still fills known ones', () => {
    const staffs = [
      { role: 'A', name: '1' },
      { role: 'B', name: '2' },
      { role: 'C', name: '3' },
      { role: 'A', name: '4' },
    ]
    expect(mainStaff(staffs, 2)).toEqual([
      { role: 'A', names: ['1', '4'] },
      { role: 'B', names: ['2'] },
    ])
  })
})

describe('safeHttpUrl / xUrl', () => {
  it.each([
    ['https://frieren-anime.jp/', 'https://frieren-anime.jp/'],
    ['http://example.com', 'http://example.com/'],
    ['javascript:alert(1)', null],
    ['data:text/html,x', null],
    ['not a url', null],
    ['', null],
    [null, null],
  ])('%j → %j', (input, want) => {
    expect(safeHttpUrl(input)).toBe(want)
  })

  it('builds X links only from plausible usernames', () => {
    expect(xUrl('Anime_Frieren')).toBe('https://x.com/Anime_Frieren')
    expect(xUrl('a/b')).toBeNull()
    expect(xUrl('')).toBeNull()
  })
})

it('workMeta joins season, media and episodes', () => {
  expect(workMeta({ seasonYear: 2023, seasonName: 'AUTUMN', media: 'TV' }, 28)).toBe('2023年秋 TV 28話')
  expect(workMeta({ seasonYear: null, seasonName: null, media: 'MOVIE' })).toBe('劇場版')
})

it('nextSeason is the inverse of previousSeason', () => {
  let s: Season = { year: 2025, name: 'winter' }
  for (let i = 0; i < 9; i++) {
    expect(previousSeason(nextSeason(s))).toEqual(s)
    s = nextSeason(s)
  }
  expect(s).toEqual({ year: 2027, name: 'spring' })
})
