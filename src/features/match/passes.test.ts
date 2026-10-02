import { describe, expect, it } from 'vitest'
import { activePassIds, mergePasses, parsePasses, samePasses, serializePasses, type Passes } from './passes'

describe('parsePasses', () => {
  it('keeps valid entries, treats a missing active flag as active and a missing kind as pass', () => {
    const p = parsePasses({
      version: 1,
      passes: {
        '10': { at: '2026-09-01T00:00:00Z', active: true },
        '11': { at: '2026-09-02T00:00:00Z' },
        '12': { at: '2026-09-03T00:00:00Z', active: false },
        '13': { at: '2026-09-04T00:00:00Z', active: true, kind: 'skip' },
        '14': { at: '2026-09-05T00:00:00Z', kind: 'weird' },
        '0': { at: '2026-09-01T00:00:00Z' },
        abc: { at: '2026-09-01T00:00:00Z' },
        '15': { at: 'not a date' },
        '16': 'x',
      },
    })
    expect([...p]).toEqual([
      [10, { at: '2026-09-01T00:00:00Z', active: true, kind: 'pass' }],
      [11, { at: '2026-09-02T00:00:00Z', active: true, kind: 'pass' }],
      [12, { at: '2026-09-03T00:00:00Z', active: false, kind: 'pass' }],
      [13, { at: '2026-09-04T00:00:00Z', active: true, kind: 'skip' }],
      [14, { at: '2026-09-05T00:00:00Z', active: true, kind: 'pass' }],
    ])
  })

  it.each([null, 'x', [], { passes: [] }, { passes: 'x' }])('treats %j as empty', (v) => {
    expect(parsePasses(v).size).toBe(0)
  })

  it('round-trips through serializePasses, writing kind only for skips', () => {
    const p: Passes = new Map([
      [30, { at: '2026-01-05T00:00:00Z', active: false, kind: 'pass' }],
      [7, { at: '2026-03-01T00:00:00Z', active: true, kind: 'skip' }],
    ])
    const s = serializePasses(p)
    expect(s.passes).toEqual({
      '7': { at: '2026-03-01T00:00:00Z', active: true, kind: 'skip' },
      '30': { at: '2026-01-05T00:00:00Z', active: false },
    })
    expect(Object.keys(s.passes)).toEqual(['7', '30'])
    expect(samePasses(parsePasses(s), p)).toBe(true)
  })
})

describe('mergePasses / samePasses', () => {
  it('keeps the later operation for each work, including an undo and a change of kind', () => {
    const phone: Passes = new Map([
      [1, { at: '2026-09-10T00:00:00Z', active: true, kind: 'skip' }],
      [2, { at: '2026-09-20T00:00:00Z', active: false, kind: 'pass' }],
    ])
    const pc: Passes = new Map([
      [1, { at: '2026-09-12T00:00:00Z', active: true, kind: 'pass' }],
      [2, { at: '2026-09-15T00:00:00Z', active: true, kind: 'pass' }],
      [3, { at: '2026-09-01T00:00:00Z', active: true, kind: 'skip' }],
    ])
    const merged = mergePasses(phone, pc)
    expect(merged.get(1)).toEqual({ at: '2026-09-12T00:00:00Z', active: true, kind: 'pass' })
    expect(merged.get(2)).toEqual({ at: '2026-09-20T00:00:00Z', active: false, kind: 'pass' })
    expect(merged.get(3)).toEqual({ at: '2026-09-01T00:00:00Z', active: true, kind: 'skip' })
    expect(samePasses(mergePasses(pc, phone), merged)).toBe(true)
  })

  it('treats a different kind as a difference', () => {
    const a: Passes = new Map([[1, { at: '2026-09-10T00:00:00Z', active: true, kind: 'skip' }]])
    const b: Passes = new Map([[1, { at: '2026-09-10T00:00:00Z', active: true, kind: 'pass' }]])
    expect(samePasses(a, b)).toBe(false)
  })
})

describe('activePassIds', () => {
  const now = new Date('2026-09-30T00:00:00Z')

  it('hides passes for 91 days (3 months)', () => {
    const p: Passes = new Map([
      [1, { at: '2026-09-29T00:00:00Z', active: true, kind: 'pass' }],
      [2, { at: '2026-07-01T00:00:00Z', active: true, kind: 'pass' }], // ちょうど91日前
      [3, { at: '2026-06-30T23:00:00Z', active: true, kind: 'pass' }], // 91日と1時間前
      [4, { at: '2026-09-28T00:00:00Z', active: false, kind: 'pass' }],
    ])
    expect([...activePassIds(p, now)].sort()).toEqual([1, 2])
  })

  it('hides skips for only 7 days', () => {
    const p: Passes = new Map([
      [1, { at: '2026-09-29T12:00:00Z', active: true, kind: 'skip' }],
      [2, { at: '2026-09-23T00:00:00Z', active: true, kind: 'skip' }], // ちょうど7日前
      [3, { at: '2026-09-22T23:00:00Z', active: true, kind: 'skip' }], // 7日と1時間前
      [4, { at: '2026-09-29T00:00:00Z', active: false, kind: 'skip' }],
      // 同じ日付でもパスなら出さない
      [5, { at: '2026-09-22T23:00:00Z', active: true, kind: 'pass' }],
    ])
    expect([...activePassIds(p, now)].sort()).toEqual([1, 2, 5])
  })
})
