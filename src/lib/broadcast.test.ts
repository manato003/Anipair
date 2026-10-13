// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { broadcastLabel, EMPTY_PREFS, upcomingByChannel, weekSchedule, formatBroadcast, hasChoice, matches, nextBroadcast, parseBroadcastPrefs, resetBroadcastPrefs, setBroadcastPrefs, type Slot } from './broadcast'
import { readStoredBroadcast } from './storage'

beforeEach(() => {
  localStorage.clear()
  resetBroadcastPrefs()
})

// 2026-10-13(火) 12:00 日本時間
const NOW = new Date('2026-10-13T03:00:00Z')
const slot = (at: string, ch: string, g = '動画サービス'): Slot => ({ at, ch, g })

describe('parseBroadcastPrefs', () => {
  it('keeps only known services, regions and satellites', () => {
    expect(parseBroadcastPrefs({ services: ['netflix', 'nope', 'danime'], region: '関東', satellites: ['bs', 'x'] })).toEqual({
      services: ['netflix', 'danime'],
      region: '関東',
      satellites: ['bs'],
      at: null,
    })
    expect(parseBroadcastPrefs({ region: '火星' }).region).toBeNull()
    expect(parseBroadcastPrefs('broken')).toEqual(EMPTY_PREFS)
    expect(hasChoice(EMPTY_PREFS)).toBe(false)
  })

  it('saves the choice on this device', () => {
    setBroadcastPrefs({ services: ['abema'], region: null, satellites: [] }, NOW)
    expect(readStoredBroadcast()).toEqual({ services: ['abema'], region: null, satellites: [], at: NOW.toISOString() })
  })
})

describe('matches', () => {
  it('matches a service by any of its Annict channels, terrestrial by region, BS and CS by group', () => {
    const p = { services: ['nico' as const], region: '関東' as const, satellites: ['bs' as const] }
    expect(matches(slot('x', 'dアニメストア ニコニコ支店'), p)).toBe(true)
    expect(matches(slot('x', 'dアニメストア'), p)).toBe(false)
    expect(matches(slot('x', 'TOKYO MX', 'テレビ 関東'), p)).toBe(true)
    expect(matches(slot('x', 'MBS毎日放送', 'テレビ 近畿'), p)).toBe(false)
    expect(matches(slot('x', 'BS11イレブン', 'BSデジタル'), p)).toBe(true)
    expect(matches(slot('x', 'AT-X', 'スカパー'), p)).toBe(false)
  })

  // #34: 地域を選んだら全国の局（NHK など）も。ABEMA はまとまりで見る（ABEMA アニメLIVE など名前の違うチャンネルも）
  it('includes nationwide stations with any region, and every ABEMA channel', () => {
    const p = { services: ['abema' as const], region: '近畿' as const, satellites: [] }
    expect(matches(slot('x', 'NHK総合', 'テレビ 全国'), p)).toBe(true)
    expect(matches(slot('x', 'ABEMA アニメLIVE', 'ABEMA'), p)).toBe(true)
    expect(nextBroadcast([slot('2026-10-20T03:00:00Z', 'ABEMA みんなのアニメ', 'ABEMA')], p, NOW)?.channel).toBe('ABEMA')
    expect(matches(slot('x', 'NHK総合', 'テレビ 全国'), { ...p, region: null })).toBe(false)
  })
})

describe('nextBroadcast', () => {
  const prefs = { services: ['danime' as const, 'netflix' as const], region: null, satellites: [] }
  it('picks the earliest upcoming one among the chosen channels', () => {
    const next = nextBroadcast(
      [
        slot('2026-10-12T15:00:00Z', 'dアニメストア'), // もう過ぎた
        slot('2026-10-17T15:00:00Z', 'TOKYO MX', 'テレビ 関東'), // 選んでいない
        slot('2026-10-20T03:00:00Z', 'Netflix'),
        slot('2026-10-19T15:00:00Z', 'dアニメストア'),
      ],
      prefs,
      NOW,
    )
    expect(next).toEqual({ at: new Date('2026-10-19T15:00:00Z'), channel: 'dアニメストア', more: false })
  })

  it('says ほか when another chosen channel starts at the same time, and nothing without a match', () => {
    const at = '2026-10-19T15:00:00Z'
    const next = nextBroadcast([slot(at, 'dアニメストア'), slot(at, 'Netflix')], prefs, NOW)!
    expect(broadcastLabel(next, NOW)).toBe('次の放送 10/20(火) 0:00 Netflixほか')
    expect(nextBroadcast([slot(at, 'Hulu')], prefs, NOW)).toBeNull()
  })
})

describe('formatBroadcast', () => {
  it('uses Japan time, with 今日 and 明日', () => {
    expect(formatBroadcast(new Date('2026-10-13T14:30:00Z'), NOW)).toBe('今日 23:30')
    expect(formatBroadcast(new Date('2026-10-13T15:00:00Z'), NOW)).toBe('明日 0:00')
    expect(formatBroadcast(new Date('2026-10-17T15:05:00Z'), NOW)).toBe('10/18(日) 0:05')
  })
})

describe('upcomingByChannel', () => {
  it('lists each chosen service once, by its earliest upcoming broadcast', () => {
    const p = { services: ['abema' as const, 'netflix' as const], region: null, satellites: [] }
    const list = upcomingByChannel(
      [
        slot('2026-10-20T03:00:00Z', 'Netflix'),
        slot('2026-10-17T15:00:00Z', 'ABEMA アニメ', 'ABEMA'),
        slot('2026-10-16T15:00:00Z', 'ABEMAビデオ', 'ABEMA'),
        slot('2026-10-27T03:00:00Z', 'Netflix'),
        slot('2026-10-12T03:00:00Z', 'Netflix'),
      ],
      p,
      NOW,
    )
    expect(list).toEqual([
      { channel: 'ABEMA', at: new Date('2026-10-16T15:00:00Z') },
      { channel: 'Netflix', at: new Date('2026-10-20T03:00:00Z') },
    ])
  })
})

describe('weekSchedule', () => {
  it('lists each work once per broadcast within 7 days, by day and time, at its earliest chosen channel', () => {
    const p = { services: ['danime' as const, 'netflix' as const], region: '関東' as const, satellites: ['bs' as const] }
    const days = weekSchedule(
      [
        // 金曜 23:00 に配信、土曜 0:00 に Netflix（同じ回なので、早い方だけ）。翌週の分は7日より先
        { work: 'A', slots: [slot('2026-10-16T14:00:00Z', 'dアニメストア'), slot('2026-10-16T15:00:00Z', 'Netflix'), slot('2026-10-23T14:00:00Z', 'dアニメストア')] },
        // 毎日の作品（回ごとに出す）
        { work: 'B', slots: [slot('2026-10-13T10:00:00Z', 'Netflix'), slot('2026-10-14T10:00:00Z', 'Netflix')] },
        // 選んでいないチャンネルだけ
        { work: 'C', slots: [slot('2026-10-14T10:00:00Z', 'Hulu')] },
        // 金曜の地上波と、翌日の BS（同じ回。2026-10-13 に2回並んでいた）
        { work: 'D', slots: [slot('2026-10-16T14:00:00Z', '日本テレビ', 'テレビ 関東'), slot('2026-10-17T14:00:00Z', 'BS日テレ', 'BSデジタル')] },
      ],
      p,
      NOW,
    )
    expect(days.map((d) => [d.day, d.items.map((i) => `${i.work} ${i.channel}`)])).toEqual([
      ['今日', ['B Netflix']],
      ['明日', ['B Netflix']],
      ['10/16(金)', ['A dアニメストア', 'D 日本テレビ']],
    ])
  })
})

// 2026-10-13: 日曜0:30 に dアニメストアで流れた第2話を、火曜12:00 の Netflix で新しい回のように出していた（『生徒会にも穴はある！』）
describe('fresh broadcasts (an episode already shown on another chosen service is not new)', () => {
  // いまは火曜 10:00。第2話は日曜に dアニメストアで流れ済み。Netflix は今日 12:00 に第2話、dアニメストアは次の日曜に第3話
  const now = new Date('2026-10-13T01:00:00Z')
  const slots = [
    { at: '2026-10-13T03:00:00Z', ch: 'Netflix', g: '動画サービス', k: 2 },
    { at: '2026-10-20T03:00:00Z', ch: 'Netflix', g: '動画サービス', k: 3 },
    { at: '2026-10-17T15:30:00Z', ch: 'dアニメストア', g: '動画サービス', k: 3 },
  ]
  const both = { services: ['danime' as const, 'netflix' as const], region: null, satellites: [] }
  it('skips the delayed showing, and lists the next new episode once', () => {
    expect(nextBroadcast(slots, both, now)).toEqual({ at: new Date('2026-10-17T15:30:00Z'), channel: 'dアニメストア', more: false })
    const days = weekSchedule([{ work: 'S', slots }], both, now)
    expect(days.map((d) => [d.day, d.items.map((i) => i.channel)])).toEqual([['10/18(日)', ['dアニメストア']]])
  })
  it('keeps the showing when only that service is chosen', () => {
    const netflix = { services: ['netflix' as const], region: null, satellites: [] }
    expect(nextBroadcast(slots, netflix, now)?.channel).toBe('Netflix')
    expect(nextBroadcast(slots, netflix, now)?.at).toEqual(new Date('2026-10-13T03:00:00Z'))
  })
})

describe('which name comes first at the same time', () => {
  it('names a chosen streaming service before a local station', () => {
    const p = { services: ['danime' as const], region: '関東' as const, satellites: [] }
    const at = '2026-10-17T15:30:00Z'
    const next = nextBroadcast([slot(at, 'とちぎテレビ', 'テレビ 関東'), slot(at, 'dアニメストア'), slot(at, 'TOKYO MX', 'テレビ 関東')], p, NOW)
    expect(next).toMatchObject({ channel: 'dアニメストア', more: true })
  })
})

