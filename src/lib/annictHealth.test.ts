import { describe, expect, it } from 'vitest'
import { healthDetail, judgeAnnictHealth, type HealthSample } from './annictHealth'

const NOW = 10 * 60 * 60_000
const ok = (ms: number, ago = 0): HealthSample => ({ at: NOW - ago, ms, ok: true })
const failed = (failure: HealthSample['failure'], ago = 0, status?: number): HealthSample => ({ at: NOW - ago, ms: 300, ok: false, failure, status })

describe('judgeAnnictHealth', () => {
  it('is unknown before anything was asked', () => {
    expect(judgeAnnictHealth([], NOW)).toMatchObject({ level: 'unknown', last: null })
  })

  it('is ok when answers come back fast', () => {
    expect(judgeAnnictHealth([ok(120), ok(800)], NOW)).toMatchObject({ level: 'ok', label: '正常' })
  })

  it('is slow when the last answer took over 5 seconds (the slow day: 7 to 15 seconds for a tiny query)', () => {
    expect(judgeAnnictHealth([ok(200), ok(15_300)], NOW)).toMatchObject({ level: 'slow', label: '混み合っています' })
  })

  it('is down when the last ask failed, saying how', () => {
    expect(judgeAnnictHealth([ok(200), failed('server', 0, 502)], NOW).label).toBe('エラーを返しています（HTTP 502）')
    expect(judgeAnnictHealth([failed('timeout')], NOW)).toMatchObject({ level: 'down', label: '応答がありません' })
    expect(judgeAnnictHealth([failed('network')], NOW).level).toBe('down')
  })

  it('stays shaky for 5 minutes after a failure or a slow answer, then turns ok', () => {
    expect(judgeAnnictHealth([failed('server', 4 * 60_000, 502), ok(300)], NOW)).toMatchObject({ level: 'slow', label: expect.stringContaining('不安定') })
    expect(judgeAnnictHealth([ok(9_000, 6 * 60_000), ok(300)], NOW).level).toBe('ok')
  })
})

describe('healthDetail', () => {
  it('says how long the answer took and when', () => {
    expect(healthDetail(ok(420, 10_000), NOW)).toBe('応答 0.4秒・たった今')
    expect(healthDetail(ok(15_300, 3 * 60_000), NOW)).toBe('応答 15秒・3分前')
    expect(healthDetail(failed('server', 2 * 60 * 60_000), NOW)).toBe('0.3秒で失敗・2時間前')
    // 時刻が少し先の記録（画面の時計は30秒ごと）でも負にしない
    expect(healthDetail(ok(100, -20_000), NOW)).toBe('応答 0.1秒・たった今')
    expect(healthDetail(ok(30), NOW)).toBe('応答 0.1秒未満・たった今')
  })
})
