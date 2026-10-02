import { describe, expect, it, vi } from 'vitest'
import type { MyReview } from './annict'

const calls: string[] = []
vi.mock('./annict', () => ({
  createReview: vi.fn(async (_t: string, w: string, r: string, body = '') => {
    calls.push(`create ${w} ${r} "${body}"`)
    return 'NEW'
  }),
  deleteReview: vi.fn(async (_t: string, id: string) => void calls.push(`delete ${id}`)),
  updateReview: vi.fn(async (_t: string, id: string, body: string, axes: Record<string, string>) =>
    void calls.push(`update ${id} "${body}" ${axes.ratingOverallState}/${axes.ratingStoryState}`),
  ),
}))

const { applyRatingPlan, planRatingChange } = await import('./reviewOps')

function review(extra: Partial<MyReview> = {}): MyReview {
  return {
    id: 'R1',
    body: '',
    createdAt: '2026-09-29T00:00:00Z',
    ratingOverallState: 'GOOD',
    ratingStoryState: null,
    ratingAnimationState: null,
    ratingMusicState: null,
    ratingCharacterState: null,
    ...extra,
  }
}

describe('planRatingChange', () => {
  it('creates when there is no review, and does nothing when clearing nothing', () => {
    expect(planRatingChange(null, 'GREAT')).toEqual({ kind: 'create', rating: 'GREAT' })
    expect(planRatingChange(null, null)).toEqual({ kind: 'none' })
  })

  it('does nothing when the rating is unchanged, and deletes when cleared', () => {
    expect(planRatingChange(review(), 'GOOD')).toEqual({ kind: 'none' })
    expect(planRatingChange(review(), null)).toEqual({ kind: 'delete', reviewId: 'R1' })
  })

  it('replaces an overall-only review, keeping the body written on Annict', () => {
    expect(planRatingChange(review({ body: '感想' }), 'BAD')).toEqual({ kind: 'replace', oldId: 'R1', rating: 'BAD', body: '感想' })
  })

  it('updates in place when all five axes are set, keeping the other four', () => {
    const full = review({ ratingStoryState: 'GREAT', ratingAnimationState: 'AVERAGE', ratingMusicState: 'GOOD', ratingCharacterState: 'BAD', body: 'x' })
    expect(planRatingChange(full, 'BAD')).toEqual({
      kind: 'update',
      reviewId: 'R1',
      body: 'x',
      axes: { ratingOverallState: 'BAD', ratingStoryState: 'GREAT', ratingAnimationState: 'AVERAGE', ratingMusicState: 'GOOD', ratingCharacterState: 'BAD' },
    })
  })

  it('replaces when only some of the other axes are set', () => {
    expect(planRatingChange(review({ ratingStoryState: 'GREAT' }), 'AVERAGE').kind).toBe('replace')
  })
})

describe('applyRatingPlan', () => {
  it('creates the new review before deleting the old one', async () => {
    calls.length = 0
    const id = await applyRatingPlan('t', 'W1', { kind: 'replace', oldId: 'R1', rating: 'BAD', body: '感想' }, 'R1')
    expect(calls).toEqual(['create W1 BAD "感想"', 'delete R1'])
    expect(id).toBe('NEW')
  })

  it('returns the id after each kind of change', async () => {
    calls.length = 0
    expect(await applyRatingPlan('t', 'W1', { kind: 'none' }, 'R9')).toBe('R9')
    expect(await applyRatingPlan('t', 'W1', { kind: 'delete', reviewId: 'R9' }, 'R9')).toBeNull()
    expect(await applyRatingPlan('t', 'W1', { kind: 'create', rating: 'GOOD' }, null)).toBe('NEW')
    expect(calls).toEqual(['delete R9', 'create W1 GOOD ""'])
  })
})
