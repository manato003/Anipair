import { createReview, deleteReview, updateReview, type MyReview, type RatingState, type ReviewAxes } from './annict'

// 総合評価を付ける・変える・消すときに、Annict に何を送るか。
// updateReview は5項目すべてが必須なので、総合だけの感想は「新しく作ってから古いものを消す」で付け直す
// （先に作るので、途中で失敗しても評価が消えない）
export type RatingPlan =
  | { kind: 'none' }
  | { kind: 'create'; rating: RatingState }
  | { kind: 'delete'; reviewId: string }
  | { kind: 'update'; reviewId: string; body: string; axes: { [K in keyof ReviewAxes]: RatingState } }
  | { kind: 'replace'; oldId: string; rating: RatingState; body: string }

function fullAxes(r: MyReview, overall: RatingState): { [K in keyof ReviewAxes]: RatingState } | null {
  const { ratingStoryState: s, ratingAnimationState: a, ratingMusicState: m, ratingCharacterState: c } = r
  return s && a && m && c ? { ratingOverallState: overall, ratingStoryState: s, ratingAnimationState: a, ratingMusicState: m, ratingCharacterState: c } : null
}

export function planRatingChange(review: MyReview | null, next: RatingState | null): RatingPlan {
  if (!review) return next ? { kind: 'create', rating: next } : { kind: 'none' }
  if (next === null) return { kind: 'delete', reviewId: review.id }
  if (review.ratingOverallState === next) return { kind: 'none' }
  const axes = fullAxes(review, next)
  if (axes) return { kind: 'update', reviewId: review.id, body: review.body, axes }
  return { kind: 'replace', oldId: review.id, rating: next, body: review.body }
}

// 実行して、実行後の感想の ID を返す（消したら null、変わらなければ元の ID）
export async function applyRatingPlan(token: string, workId: string, plan: RatingPlan, currentId: string | null): Promise<string | null> {
  switch (plan.kind) {
    case 'none':
      return currentId
    case 'create':
      return createReview(token, workId, plan.rating)
    case 'delete':
      await deleteReview(token, plan.reviewId)
      return null
    case 'update':
      await updateReview(token, plan.reviewId, plan.body, plan.axes)
      return plan.reviewId
    case 'replace': {
      const id = await createReview(token, workId, plan.rating, plan.body)
      await deleteReview(token, plan.oldId)
      return id
    }
  }
}

export function blankReview(): MyReview {
  return {
    id: '',
    body: '',
    createdAt: new Date().toISOString(),
    ratingOverallState: null,
    ratingStoryState: null,
    ratingAnimationState: null,
    ratingMusicState: null,
    ratingCharacterState: null,
  }
}

// 総合評価を current から rating に変え、変えた後の感想を返す（消したら null）。
// current は「送信の時点での実際の感想」を渡す（画面の表示は先に変わっているので、それを渡すと古い ID で消してしまう）
export async function changeRating(token: string, workId: string, current: MyReview | null, rating: RatingState | null): Promise<MyReview | null> {
  const id = await applyRatingPlan(token, workId, planRatingChange(current, rating), current?.id ?? null)
  return id && rating ? { ...(current ?? blankReview()), id, ratingOverallState: rating } : null
}

export const RATING_ORDER: readonly RatingState[] = ['GREAT', 'GOOD', 'AVERAGE', 'BAD']

export const RATING_LABEL: Record<RatingState, string> = {
  BAD: '良くない',
  AVERAGE: '普通',
  GOOD: '良い',
  GREAT: 'とても良い',
}
