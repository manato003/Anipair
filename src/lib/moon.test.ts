import { describe, expect, it } from 'vitest'
import { dawnMoon, moonName, moonPass, moonPhase, nightMoon } from './moon'

describe('moon', () => {
  it('follows the moon phase (new moon of the 2024-04-08 eclipse, full moon of 2024-04-23)', () => {
    const fresh = moonPhase(new Date(Date.UTC(2024, 3, 8, 18, 21)))
    expect(fresh.lit).toBeLessThan(0.02)
    const full = moonPhase(new Date(Date.UTC(2024, 3, 23, 23, 49)))
    expect(full.lit).toBeGreaterThan(0.98)
    expect(moonPhase(new Date(Date.UTC(2024, 3, 12))).waxing).toBe(true)
    expect(moonPhase(new Date(Date.UTC(2024, 3, 28))).waxing).toBe(false)
  })

  it('bulges the shadow edge toward the lit side for a crescent and away from it past half', () => {
    const svg = (lit: number) => decodeURIComponent(nightMoon({ age: 3, lit, waxing: true }))
    expect(svg(0.2)).toContain('A10.8 18 0 0 0 24 6Z')
    expect(svg(0.8)).toContain('A10.8 18 0 0 1 24 6Z')
  })

  it('keeps a thin crescent around the new moon, and mirrors the waning moon', () => {
    expect(decodeURIComponent(dawnMoon({ age: 0, lit: 0, waxing: true }))).toContain('A14.4 18 0 0 0 24 6Z')
    expect(decodeURIComponent(dawnMoon({ age: 25, lit: 0.2, waxing: false }))).toContain('rotate(-39 24 24) matrix(-1 0 0 1 48 0)')
  })

  it('names the moon by its age', () => {
    expect(moonName(2.3).name.ja).toBe('三日月')
    expect(moonName(14.8).name.ja).toBe('満月')
    expect(moonName(15.6).name.ja).toBe('十六夜')
    expect(moonName(26).name.ja).toBe('有明月')
    expect(moonName(29.4).name.ja).toBe('晦日月')
    expect(moonName(29.6).name.ja).toBe('新月')
  })

  // 答えは PyEphem（東京、上の縁が地平線に出入りする時刻）。数分のずれまで許す
  it('finds the moonrise, the highest point and the moonset in Tokyo', () => {
    const tokyo = { lat: 35.68, lng: 139.77 }
    const near = (got: Date | null, want: string) => expect(Math.abs((got?.getTime() ?? 0) - Date.parse(want))).toBeLessThan(5 * 60 * 1000)
    // 空にあるときは、さっき昇ってからの1回（満月の夜）
    const up = moonPass(new Date('2024-04-23T12:00Z'), tokyo)
    near(up.rise, '2024-04-23T08:44Z')
    near(up.set, '2024-04-23T19:49Z')
    // 沈んでいるときは、次に昇ってからの1回
    const down = moonPass(new Date('2026-11-20T03:00Z'), tokyo)
    near(down.rise, '2026-11-20T04:30Z')
    near(down.transit, '2026-11-20T10:48Z')
    near(down.set, '2026-11-20T17:15Z')
  })
})
