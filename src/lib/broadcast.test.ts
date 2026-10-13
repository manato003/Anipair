// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { broadcastLabel, EMPTY_PREFS, upcomingByChannel, formatBroadcast, hasChoice, matches, nextBroadcast, parseBroadcastPrefs, resetBroadcastPrefs, setBroadcastPrefs, type Slot } from './broadcast'
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
    expect(broadcastLabel(next, NOW)).toBe('次の放送 10/20(火) 0:00 dアニメストアほか')
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

