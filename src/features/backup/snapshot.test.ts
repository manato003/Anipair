import { describe, expect, it } from 'vitest'
import type { LibraryEntry, MyReview } from '../../lib/annict'
import type { Passes } from '../match/passes'
import type { Unseen } from '../rate/unseen'
import { buildSnapshot, countSnapshot, describeCounts, sameSnapshot } from './snapshot'
import type { WannaNotes } from '../records/wannaNotes'

const NOW = new Date('2026-10-01T12:00:00Z')

function entry(annictId: number, state: LibraryEntry['state'], over: Partial<LibraryEntry> = {}): LibraryEntry {
  return { workId: `W${annictId}`, annictId, title: `作品${annictId}`, malAnimeId: String(annictId * 10), state, stateAt: '2026-09-01T00:00:00Z', ...over }
}

function review(id: string, over: Partial<MyReview> = {}): MyReview {
  return {
    id,
    body: '',
    createdAt: '2026-09-02T00:00:00Z',
    ratingOverallState: 'GOOD',
    ratingStoryState: null,
    ratingAnimationState: null,
    ratingMusicState: null,
    ratingCharacterState: null,
    ...over,
  }
}

const noPasses: Passes = new Map()
const noUnseen: Unseen = new Map()

function build(library: LibraryEntry[], reviews: [number, MyReview][] = [], extra: { passes?: Passes; unseen?: Unseen; wannaNotes?: WannaNotes; now?: Date } = {}) {
  return buildSnapshot({
    library,
    reviews: new Map(reviews),
    passes: extra.passes ?? noPasses,
    unseen: extra.unseen ?? noUnseen,
    wannaNotes: extra.wannaNotes ?? new Map(),
    now: extra.now ?? NOW,
  })
}

describe('buildSnapshot', () => {
  it('has the file header and the serialized passes and unseen', () => {
    const passes: Passes = new Map([[20, { at: '2026-09-20T00:00:00.000Z', active: true, kind: 'skip' }]])
    const unseen: Unseen = new Map([[5, { at: '2026-09-21T00:00:00.000Z', active: false }]])
    const wannaNotes: WannaNotes = new Map([[7, { at: '2026-09-22T00:00:00.000Z', priority: true, memo: '友達のおすすめ' }]])
    const s = build([], [], { passes, unseen, wannaNotes })
    expect(s.version).toBe(1)
    expect(s.app).toBe('animax')
    expect(s.createdAt).toBe('2026-10-01T12:00:00.000Z')
    expect(s.passes).toEqual({ version: 1, passes: { '20': { at: '2026-09-20T00:00:00.000Z', active: true, kind: 'skip' } } })
    expect(s.unseen).toEqual({ version: 1, unseen: { '5': { at: '2026-09-21T00:00:00.000Z', active: false } } })
    expect(s.wannaNotes).toEqual({ version: 1, notes: { '7': { at: '2026-09-22T00:00:00.000Z', priority: true, memo: '友達のおすすめ' } } })
  })

  it('keeps every review axis and the body', () => {
    const r = review('R1', {
      body: 'よかった\n二行目',
      ratingOverallState: 'GREAT',
      ratingStoryState: 'GOOD',
      ratingAnimationState: 'AVERAGE',
      ratingMusicState: 'BAD',
      ratingCharacterState: null,
    })
    const s = build([entry(3, 'WATCHED')], [[3, r]])
    expect(s.works[0]).toEqual({
      annictId: 3,
      workId: 'W3',
      title: '作品3',
      malAnimeId: '30',
      state: 'WATCHED',
      stateAt: '2026-09-01T00:00:00Z',
      review: {
        id: 'R1',
        createdAt: '2026-09-02T00:00:00Z',
        body: 'よかった\n二行目',
        overall: 'GREAT',
        story: 'GOOD',
        animation: 'AVERAGE',
        music: 'BAD',
        character: null,
      },
    })
  })

  it('has review null for a work without a review', () => {
    expect(build([entry(3, 'WANNA_WATCH')]).works[0].review).toBeNull()
  })

  it('keeps a review whose work left the library, with null work fields', () => {
    const s = build([entry(3, 'WATCHED')], [[9, review('R9', { body: '消えた作品' })]])
    expect(s.works.map((w) => w.annictId)).toEqual([3, 9])
    expect(s.works[1]).toMatchObject({ annictId: 9, workId: null, title: null, malAnimeId: null, state: null, stateAt: null })
    expect(s.works[1].review).toMatchObject({ id: 'R9', body: '消えた作品', overall: 'GOOD' })
  })

  it('sorts works by annictId, library and orphans together', () => {
    const s = build([entry(30, 'WATCHED'), entry(2, 'WATCHING'), entry(11, 'ON_HOLD')], [[7, review('R7')], [40, review('R40')]])
    expect(s.works.map((w) => w.annictId)).toEqual([2, 7, 11, 30, 40])
  })

})

describe('sameSnapshot', () => {
  it('ignores createdAt', () => {
    const a = build([entry(3, 'WATCHED')], [[3, review('R1')]])
    const b = build([entry(3, 'WATCHED')], [[3, review('R1')]], { now: new Date('2026-10-02T00:00:00Z') })
    expect(a.createdAt).not.toBe(b.createdAt)
    expect(sameSnapshot(a, b)).toBe(true)
    // GitHub から読んだ生の値（JSON を通したもの）とも比べられる
    expect(sameSnapshot(a, JSON.parse(JSON.stringify(b)))).toBe(true)
  })

  it('detects a state, a review and a pass change', () => {
    const base = build([entry(3, 'WATCHED')], [[3, review('R1')]])
    expect(sameSnapshot(base, build([entry(3, 'WATCHING')], [[3, review('R1')]]))).toBe(false)
    expect(sameSnapshot(base, build([entry(3, 'WATCHED')], [[3, review('R1', { body: '直した' })]]))).toBe(false)
    const passes: Passes = new Map([[1, { at: '2026-09-20T00:00:00.000Z', active: true, kind: 'pass' }]])
    expect(sameSnapshot(base, build([entry(3, 'WATCHED')], [[3, review('R1')]], { passes }))).toBe(false)
  })

  it('is false for a missing or broken remote file', () => {
    const s = build([])
    expect(sameSnapshot(s, null)).toBe(false)
    expect(sameSnapshot(s, 'x')).toBe(false)
    expect(sameSnapshot(s, [])).toBe(false)
  })
})

describe('countSnapshot', () => {
  it('counts states and rated works, orphans included in rated only', () => {
    const s = build(
      [entry(1, 'WATCHED'), entry(2, 'WATCHED'), entry(3, 'WANNA_WATCH'), entry(4, 'WATCHING'), entry(5, 'ON_HOLD'), entry(6, 'STOP_WATCHING')],
      [
        [1, review('R1')],
        [2, review('R2', { ratingOverallState: null, body: '本文だけ' })],
        [99, review('R99')],
      ],
    )
    const c = countSnapshot(s)
    expect(c).toEqual({ watched: 2, wanna: 1, watching: 1, other: 2, rated: 2 })
    expect(describeCounts(c)).toBe('見た 2・見たい 1・評価 2')
  })
})
