import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyReview, ReviewAxes } from './annict'

const calls: string[] = []
// Annict にある感想（読み直しの結果）。null なら消されている
let onAnnict: MyReview | null = null
vi.mock('./annict', () => ({
  createReviewWith: vi.fn(async (_t: string, w: string, axes: ReviewAxes, body: string) => {
    calls.push(`create ${w} ${axes.ratingOverallState}/${axes.ratingStoryState} "${body}"`)
    return 'NEW'
  }),
  deleteReview: vi.fn(async (_t: string, id: string) => void calls.push(`delete ${id}`)),
  updateReview: vi.fn(async (_t: string, id: string, body: string, axes: Record<string, string>) =>
    void calls.push(`update ${id} "${body}" ${axes.ratingOverallState}/${axes.ratingStoryState}`),
  ),
  fetchReview: vi.fn(async (_t: string, id: string) => {
    calls.push(`read ${id}`)
    return onAnnict
  }),
}))

const { applyReviewPlan, changeRating, planRatingChange, planReviewSave, saveReview } = await import('./reviewOps')

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

const axes = (extra: Partial<ReviewAxes> = {}): ReviewAxes => ({
  ratingOverallState: null,
  ratingStoryState: null,
  ratingAnimationState: null,
  ratingMusicState: null,
  ratingCharacterState: null,
  ...extra,
})

beforeEach(() => {
  calls.length = 0
  onAnnict = null
})

describe('planRatingChange (only the overall rating changes)', () => {
  it('creates when there is no review, and does nothing when clearing nothing', () => {
    expect(planRatingChange(null, 'GREAT')).toEqual({ kind: 'create', content: { axes: axes({ ratingOverallState: 'GREAT' }), body: '' } })
    expect(planRatingChange(null, null)).toEqual({ kind: 'none' })
  })

  it('does nothing when the rating is unchanged, and deletes an overall-only review when cleared', () => {
    expect(planRatingChange(review(), 'GOOD')).toEqual({ kind: 'none' })
    expect(planRatingChange(review(), null)).toEqual({ kind: 'delete', reviewId: 'R1' })
  })

  it('keeps the review when cleared if it has a body or other axes (only the overall goes)', () => {
    expect(planRatingChange(review({ body: '感想' }), null)).toEqual({ kind: 'replace', oldId: 'R1', content: { axes: axes(), body: '感想' } })
    expect(planRatingChange(review({ ratingStoryState: 'GREAT' }), null)).toEqual({
      kind: 'replace',
      oldId: 'R1',
      content: { axes: axes({ ratingStoryState: 'GREAT' }), body: '' },
    })
  })

  it('replaces a partial review, keeping the body and the axes that were set', () => {
    expect(planRatingChange(review({ body: '感想', ratingStoryState: 'GREAT' }), 'BAD')).toEqual({
      kind: 'replace',
      oldId: 'R1',
      content: { axes: axes({ ratingOverallState: 'BAD', ratingStoryState: 'GREAT' }), body: '感想' },
    })
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
})

describe('planReviewSave (axes and body)', () => {
  it('creates, updates when all five are set, replaces otherwise, deletes when emptied, and does nothing when unchanged', () => {
    expect(planReviewSave(null, { axes: axes({ ratingMusicState: 'GREAT' }), body: '' }).kind).toBe('create')
    expect(planReviewSave(null, { axes: axes(), body: '   ' })).toEqual({ kind: 'none' })
    const all = axes({ ratingOverallState: 'GOOD', ratingStoryState: 'GOOD', ratingAnimationState: 'GOOD', ratingMusicState: 'GOOD', ratingCharacterState: 'GOOD' })
    expect(planReviewSave(review(), { axes: all, body: '良かった' }).kind).toBe('update')
    expect(planReviewSave(review(), { axes: axes({ ratingOverallState: 'GOOD' }), body: '良かった' }).kind).toBe('replace')
    expect(planReviewSave(review(), { axes: axes(), body: '' })).toEqual({ kind: 'delete', reviewId: 'R1' })
    expect(planReviewSave(review(), { axes: axes({ ratingOverallState: 'GOOD' }), body: '' })).toEqual({ kind: 'none' })
  })
})

describe('applyReviewPlan', () => {
  it('creates the new review before deleting the old one', async () => {
    const id = await applyReviewPlan('t', 'W1', { kind: 'replace', oldId: 'R1', content: { axes: axes({ ratingOverallState: 'BAD' }), body: '感想' } }, 'R1')
    expect(calls).toEqual(['create W1 BAD/null "感想"', 'delete R1'])
    expect(id).toBe('NEW')
  })
})

describe('changeRating and saveReview read the review again from Annict right before writing', () => {
  it('uses the body written on Annict, not the stale copy', async () => {
    onAnnict = review({ body: 'Annict で書き直した' })
    const after = await changeRating('t', 'W1', review({ body: '古い控え' }), 'BAD')
    expect(calls).toEqual(['read R1', 'create W1 BAD/null "Annict で書き直した"', 'delete R1'])
    expect(after).toMatchObject({ id: 'NEW', body: 'Annict で書き直した', ratingOverallState: 'BAD' })
  })

  it('creates a new review when the cached one was deleted on Annict', async () => {
    onAnnict = null
    await changeRating('t', 'W1', review(), 'GREAT')
    expect(calls).toEqual(['read R1', 'create W1 GREAT/null ""'])
  })

  it('does not read when there is no cached review', async () => {
    await saveReview('t', 'W1', null, { axes: axes({ ratingStoryState: 'GREAT' }), body: '最高' })
    expect(calls).toEqual(['create W1 null/GREAT "最高"'])
  })

  it('returns null after deleting, and the kept review (overall cleared) otherwise', async () => {
    onAnnict = review()
    expect(await changeRating('t', 'W1', review(), null)).toBeNull()
    onAnnict = review({ body: '残す' })
    expect(await changeRating('t', 'W1', review({ body: '残す' }), null)).toMatchObject({ id: 'NEW', body: '残す', ratingOverallState: null })
  })
})
