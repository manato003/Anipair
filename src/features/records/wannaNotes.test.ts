import { describe, expect, it } from 'vitest'
import { mergeWannaNotes, noteOf, parseWannaNotes, priorityFirst, sameWannaNotes, serializeWannaNotes, type WannaNotes } from './wannaNotes'

const n = (at: string, priority: boolean, memo = '') => ({ at, priority, memo })

describe('wannaNotes', () => {
  it('reads and writes the file shape, dropping broken entries and cutting long memos', () => {
    const notes = parseWannaNotes({ version: 1, notes: { '3': n('2026-10-01T00:00:00Z', true, 'あ'.repeat(250)), '4': { at: 'bad' }, x: n('2026-10-01T00:00:00Z', false) } })
    expect([...notes.keys()]).toEqual([3])
    expect(notes.get(3)!.memo).toHaveLength(200)
    expect(serializeWannaNotes(notes).notes['3'].priority).toBe(true)
    expect(parseWannaNotes(null).size).toBe(0)
  })

  it('merges by the newer change, keeping cleared entries so they do not come back', () => {
    const a: WannaNotes = new Map([[1, n('2026-10-01T00:00:00Z', true, 'メモ')]])
    const b: WannaNotes = new Map([
      [1, n('2026-10-02T00:00:00Z', false)],
      [2, n('2026-10-02T00:00:00Z', true)],
    ])
    const merged = mergeWannaNotes(a, b)
    expect(merged.get(1)).toEqual(n('2026-10-02T00:00:00Z', false))
    expect(noteOf(merged, 1)).toBeNull()
    expect(noteOf(merged, 2)).toEqual({ priority: true, memo: '' })
    expect(sameWannaNotes(merged, mergeWannaNotes(b, a))).toBe(true)
  })

  it('puts priority items first without changing the order inside each group', () => {
    expect(priorityFirst([1, 2, 3, 4], (x) => x % 2 === 0)).toEqual([2, 4, 1, 3])
  })
})
