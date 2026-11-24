import { describe, expect, it } from 'vitest'
import { nextSeason, previousSeason, type Season } from '../../lib/season'
import { mainStaff, marksByMal, noteMark, seriesFacts, studioFor, withCopyrightMark, safeHttpUrl, workMeta, xUrl } from './detail'

describe('marksByMal', () => {
  // 印の元のライブラリは最後に読んだ中身で、書き込みを映さない。作品の詳細で変えた分を重ねる
  it('lays the states just changed in a work sheet over the library last read, until the library is read again', () => {
    const library = [
      { malAnimeId: '1', state: 'WANNA_WATCH' as const },
      { malAnimeId: '2', state: 'WATCHED' as const },
    ]
    expect([...marksByMal(library)]).toEqual([[1, '見たい'], [2, '見た']])
    // 見たい → 見た、記録から外す、ライブラリに無い作品を記録する
    noteMark(1, 'WATCHED', library)
    noteMark(2, null, library)
    noteMark(3, 'WATCHING', library)
    noteMark(null, 'WATCHED', library)
    expect([...marksByMal(library)]).toEqual([[1, '見た'], [3, '見てる']])
    // 読み直したライブラリ（別の配列）には重ねない（読み直した中身のほうが新しい）。前のライブラリに戻っても、もう重ねない
    const reread = [{ malAnimeId: '1', state: 'WATCHED' as const }]
    expect([...marksByMal(reread)]).toEqual([[1, '見た']])
    expect([...marksByMal(library)]).toEqual([[1, '見たい'], [2, '見た']])
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
  expect(workMeta({ seasonYear: 2023, seasonName: 'AUTUMN', media: 'TV' }, 28)).toBe('2023年 秋 · TV · 28話')
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

describe('withCopyrightMark', () => {
  it('adds © when the text has none, and leaves one that has it', () => {
    expect(withCopyrightMark('山田鐘人・アベツカサ／小学館')).toBe('© 山田鐘人・アベツカサ／小学館')
    expect(withCopyrightMark('©山田鐘人')).toBe('©山田鐘人')
    expect(withCopyrightMark('(C) Studio')).toBe('(C) Studio')
    expect(withCopyrightMark('  ')).toBeNull()
    expect(withCopyrightMark(null)).toBeNull()
  })
})

describe('studioFor', () => {
  const refs = [
    { id: 2, name: 'Kyoto Animation' },
    { id: 11, name: 'Madhouse' },
  ]

  it('matches the English name, ignoring case, spaces and punctuation', () => {
    expect(studioFor({ nameEn: 'KYOTO ANIMATION' }, 'アニメーション制作', refs)).toEqual({ id: 2, name: 'Kyoto Animation' })
    expect(studioFor({ nameEn: 'MADHOUSE Inc.' }, '制作', refs)).toEqual({ id: 11, name: 'Madhouse' })
  })

  it('falls back to the only studio for a production role, but never for 製作 (committees)', () => {
    const one = [{ id: 2, name: 'Kyoto Animation' }]
    expect(studioFor({ nameEn: null }, 'アニメーション制作', one)).toEqual(one[0])
    expect(studioFor({ nameEn: null }, '製作', one)).toBeNull()
    expect(studioFor({ nameEn: null }, 'アニメーション制作', refs)).toBeNull()
    expect(studioFor({ nameEn: 'Someone Else' }, '音響制作', [])).toBeNull()
  })
})

describe('seriesFacts', () => {
  const work = (annictId: number, title: string, seasonYear: number, seasonName: string, media = 'TV') => ({ id: `W${annictId}`, annictId, title, seasonYear, seasonName, media, malAnimeId: null, viewerStatusState: null, summary: null })
  // ミニアニメ（配信）は同じ形式でないので数えない
  const series = [{ name: '葬送のフリーレン', works: [work(1, '葬送のフリーレン', 2023, 'AUTUMN'), work(5, 'ミニアニメ', 2023, 'AUTUMN', 'WEB'), work(2, '第2期', 2026, 'WINTER'), work(3, '第3期', 2027, 'AUTUMN')] }]
  const now = new Date('2026-10-07T00:00:00+09:00')

  it('tells which entry in the series it is, and the next one', () => {
    expect(seriesFacts(series, 1, now)).toEqual([
      ['シリーズ', 'TVシリーズの1作目（全3作）'],
      ['次の作品', '『第2期』（2026年 冬）'],
    ])
  })

  it('calls the next one an upcoming sequel when it has not started yet', () => {
    expect(seriesFacts(series, 2, now)).toEqual([
      ['シリーズ', 'TVシリーズの2作目（全3作）'],
      ['放送予定の続編', '『第3期』2027年 秋'],
    ])
    expect(seriesFacts(series, 3, now)).toEqual([['シリーズ', 'TVシリーズの3作目（全3作）']])
  })

  it('shows nothing for a work that is not in a series of two or more of the same format', () => {
    expect(seriesFacts(series, 5, now)).toEqual([])
    expect(seriesFacts([], 1, now)).toEqual([])
    expect(seriesFacts([{ name: 'x', works: [work(9, 'x', 2020, 'SPRING')] }], 9, now)).toEqual([])
    expect(seriesFacts(null, 1, now)).toEqual([])
  })
})
