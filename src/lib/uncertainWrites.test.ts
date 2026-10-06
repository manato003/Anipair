// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyReview, RecentReview, ReviewAxes } from './annict'

const calls: string[] = []
// 最近の自分のアクティビティ（届いたか分からなかった作成を確かめるときに読む）
let recent: RecentReview[] = []
// 作成をどう失敗させるか（無ければ成功）
let createFails: Error[] = []
// 削除をどう失敗させるか（無ければ成功）
let deleteFails: Error[] = []
let seq = 0
// Annict にある感想（読み直しの結果）
const onAnnict = new Map<string, MyReview>()

vi.mock('./annict', async (orig) => {
  const real = await orig<typeof import('./annict')>()
  return {
    ...real,
    createReviewWith: vi.fn(async (_t: string, w: string, axes: ReviewAxes) => {
      calls.push(`create ${w} ${axes.ratingOverallState}`)
      const e = createFails.shift()
      if (e) throw e
      return `NEW${++seq}`
    }),
    deleteReview: vi.fn(async (_t: string, id: string) => {
      calls.push(`delete ${id}`)
      const e = deleteFails.shift()
      if (e) throw e
    }),
    updateReview: vi.fn(async (_t: string, id: string) => void calls.push(`update ${id}`)),
    fetchReview: vi.fn(async (_t: string, id: string) => onAnnict.get(id) ?? null),
    fetchRecentActivity: vi.fn(async () => {
      calls.push('check')
      return { reviews: recent, records: [] }
    }),
  }
})

const { AnnictError } = await import('./annict')
const { changeRating } = await import('./reviewOps')
const { hasUncertainReview, isUncertainFailure } = await import('./uncertainWrites')

function review(id: string, rating: MyReview['ratingOverallState']): MyReview {
  return { id, body: '', createdAt: new Date().toISOString(), ratingOverallState: rating, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
}

const bad502 = () => new AnnictError('Annict のサーバーが混み合っているか、止まっているようです（HTTP 502）', 'api', 502)

beforeEach(() => {
  calls.length = 0
  recent = []
  createFails = []
  deleteFails = []
  seq = 0
  onAnnict.clear()
})
afterEach(() => localStorage.clear())

describe('isUncertainFailure', () => {
  it('is true for 5xx, a lost connection, and a broken answer; false when Annict refused it', () => {
    expect(isUncertainFailure(bad502())).toBe(true)
    expect(isUncertainFailure(new AnnictError('接続できません', 'network'))).toBe(true)
    expect(isUncertainFailure(new SyntaxError('Unexpected end of JSON input'))).toBe(true)
    expect(isUncertainFailure(new AnnictError('Annict がエラーを返しました: invalid', 'api'))).toBe(false)
    expect(isUncertainFailure(new AnnictError('HTTP 400', 'api', 400))).toBe(false)
    expect(isUncertainFailure(new AnnictError('トークン', 'auth', 401))).toBe(false)
  })
})

describe('a review create that may have arrived (5xx / lost connection)', () => {
  it('sending again finds the review that did arrive and does not make a second one', async () => {
    createFails = [bad502()]
    await expect(changeRating('t', 'W1', null, 'GOOD')).rejects.toThrow('HTTP 502')
    expect(hasUncertainReview('W1')).toBe(true)
    // 実は届いていた
    recent = [{ workId: 'W1', review: review('GHOST', 'GOOD') }]
    const after = await changeRating('t', 'W1', null, 'GOOD')
    expect(after?.id).toBe('GHOST')
    expect(calls).toEqual(['create W1 GOOD', 'check'])
    expect(hasUncertainReview('W1')).toBe(false)
  })

  it('creates again when it had not arrived, and checks only once', async () => {
    createFails = [new AnnictError('接続できません', 'network')]
    await expect(changeRating('t', 'W1', null, 'GOOD')).rejects.toThrow()
    const after = await changeRating('t', 'W1', null, 'GOOD')
    expect(after?.id).toBe('NEW1')
    await changeRating('t', 'W1', after, 'GREAT').catch(() => undefined)
    expect(calls.filter((c) => c === 'check')).toHaveLength(1)
  })

  it('finishes an interrupted replace: deletes the old review once the new one is found', async () => {
    const old = review('OLD', 'AVERAGE')
    onAnnict.set('OLD', old)
    createFails = [bad502()]
    await expect(changeRating('t', 'W1', old, 'GREAT')).rejects.toThrow('HTTP 502')
    recent = [{ workId: 'W1', review: review('GHOST', 'GREAT') }]
    const after = await changeRating('t', 'W1', old, 'GREAT')
    expect(after?.id).toBe('GHOST')
    expect(calls).toEqual(['create W1 GREAT', 'check', 'delete OLD'])
  })

  // 2026-10-06 の点検: 作るのは届いたのに古い感想を消すのが（混み合いなどで確かに）失敗すると、送り直しでもう1つ作っていた
  it('a replace whose create arrived but whose delete failed does not create a second review on retry', async () => {
    const old = review('OLD', 'AVERAGE')
    onAnnict.set('OLD', old)
    deleteFails = [new AnnictError('Annict が混み合っています。少し待ってから試してください', 'api')]
    await expect(changeRating('t', 'W1', old, 'GREAT')).rejects.toThrow('混み合っています')
    expect(hasUncertainReview('W1')).toBe(true)
    recent = [{ workId: 'W1', review: review('NEW1', 'GREAT') }]
    const after = await changeRating('t', 'W1', old, 'GREAT')
    expect(after?.id).toBe('NEW1')
    expect(calls).toEqual(['create W1 GREAT', 'delete OLD', 'check', 'delete OLD'])
  })

  it('undo after an uncertain create deletes the review if it had arrived', async () => {
    createFails = [bad502()]
    await expect(changeRating('t', 'W1', null, 'GOOD')).rejects.toThrow()
    recent = [{ workId: 'W1', review: review('GHOST', 'GOOD') }]
    expect(await changeRating('t', 'W1', null, null)).toBeNull()
    expect(calls).toEqual(['create W1 GOOD', 'check', 'delete GHOST'])
  })

  it('does not check when Annict clearly refused the create', async () => {
    createFails = [new AnnictError('Annict がエラーを返しました: invalid', 'api')]
    await expect(changeRating('t', 'W1', null, 'GOOD')).rejects.toThrow()
    expect(hasUncertainReview('W1')).toBe(false)
    await changeRating('t', 'W1', null, 'GOOD')
    expect(calls).toEqual(['create W1 GOOD', 'create W1 GOOD'])
  })

  it('keeps the mark when the check itself fails (checks again next time)', async () => {
    createFails = [bad502()]
    await expect(changeRating('t', 'W1', null, 'GOOD')).rejects.toThrow()
    const { fetchRecentActivity } = await import('./annict')
    vi.mocked(fetchRecentActivity).mockRejectedValueOnce(bad502())
    await expect(changeRating('t', 'W1', null, 'GOOD')).rejects.toThrow()
    expect(hasUncertainReview('W1')).toBe(true)
  })
})
