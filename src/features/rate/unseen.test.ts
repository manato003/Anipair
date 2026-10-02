import { describe, expect, it } from 'vitest'
import { LEGACY_AT, activeUnseenIds, fromLegacy, mergeUnseen, parseUnseen, sameUnseen, serializeUnseen } from './unseen'

describe('parseUnseen / serializeUnseen', () => {
  it('reads the stored shape, dropping broken entries', () => {
    const value = {
      version: 1,
      unseen: {
        '10': { at: '2026-09-30T00:00:00.000Z', active: true },
        '11': { at: '2026-09-30T00:00:00.000Z', active: false },
        '12': { at: 'not a date', active: true },
        '0': { at: '2026-09-30T00:00:00.000Z', active: true },
        x: { at: '2026-09-30T00:00:00.000Z', active: true },
        '13': 'oops',
      },
    }
    expect([...parseUnseen(value)]).toEqual([
      [10, { at: '2026-09-30T00:00:00.000Z', active: true }],
      [11, { at: '2026-09-30T00:00:00.000Z', active: false }],
    ])
  })

  it.each([null, 'x', 5, [], { unseen: [] }, { unseen: 'x' }])('treats %j as empty', (v) => {
    expect(parseUnseen(v).size).toBe(0)
  })

  it('round-trips, sorted by Annict ID', () => {
    const map = new Map([
      [20, { at: '2026-09-02T00:00:00.000Z', active: false }],
      [3, { at: '2026-09-01T00:00:00.000Z', active: true }],
    ])
    const out = serializeUnseen(map)
    expect(out).toEqual({
      version: 1,
      unseen: { '3': { at: '2026-09-01T00:00:00.000Z', active: true }, '20': { at: '2026-09-02T00:00:00.000Z', active: false } },
    })
    expect(Object.keys(out.unseen)).toEqual(['3', '20'])
    expect(sameUnseen(parseUnseen(out), map)).toBe(true)
  })
})

describe('mergeUnseen', () => {
  it('keeps the later action for the same work, including an undo (active: false)', () => {
    const a = new Map([[1, { at: '2026-09-01T00:00:00.000Z', active: true }]])
    const b = new Map([
      [1, { at: '2026-09-02T00:00:00.000Z', active: false }],
      [2, { at: '2026-09-01T00:00:00.000Z', active: true }],
    ])
    const merged = mergeUnseen(a, b)
    expect(merged.get(1)).toEqual({ at: '2026-09-02T00:00:00.000Z', active: false })
    expect(merged.get(2)?.active).toBe(true)
    // 順番を入れ替えても同じ
    expect(sameUnseen(merged, mergeUnseen(b, a))).toBe(true)
  })

  it('an old device-only entry loses to any real later action on any device', () => {
    const legacy = fromLegacy([5])
    const undone = new Map([[5, { at: '2026-09-30T00:00:00.000Z', active: false }]])
    expect(mergeUnseen(legacy, undone).get(5)?.active).toBe(false)
    expect(mergeUnseen(undone, legacy).get(5)?.active).toBe(false)
    expect(legacy.get(5)).toEqual({ at: LEGACY_AT, active: true })
  })
})

describe('activeUnseenIds', () => {
  it('lists only the works that are marked, with no expiry', () => {
    const map = new Map([
      [1, { at: '2000-01-01T00:00:00.000Z', active: true }],
      [2, { at: '2026-09-01T00:00:00.000Z', active: false }],
    ])
    expect([...activeUnseenIds(map)]).toEqual([1])
  })
})
