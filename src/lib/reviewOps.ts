import { createReviewWith, fetchReview, updateReview, type MyReview, type RatingState, type ReviewAxes } from './annict'
import { deleteReviewIfExists, isUncertainFailure, markUncertain, settleUncertainReview } from './uncertainWrites'

// 感想（総合と4項目の評価、本文）を Annict に送る手順。総合だけを変えるときも、項目と本文を保存するときも、ここを通る。
// - 変えたあとの中身を決めて送る。5項目そろっていれば更新（updateReview は5項目すべてが必須）
// - そろっていなければ、新しく作ってから古いものを消す（先に作るので、途中で失敗しても消えない。項目も本文も引き継ぐ）
// - 中身が空（評価も本文も無い）になるときだけ消す。「評価なし」に戻しても、本文かほかの項目があれば感想は残す
// - 送る直前に、控えにある感想を Annict から読み直す（Annict のサイトで直した本文を古い控えで上書きしない。消されていれば作り直す）
// - 作成が「届いたか分からない」失敗（5xx・つながらない）をしたら印を残し、次に書くときに届いていたかを確かめる（lib/uncertainWrites.ts。二重に作らない）
// - 消すのは、既に無ければ消せたのと同じ（送り直しで 404 を失敗にしない）

export interface ReviewContent {
  axes: ReviewAxes
  body: string
}

type FullAxes = { [K in keyof ReviewAxes]: RatingState }

export type ReviewPlan =
  | { kind: 'none' }
  | { kind: 'create'; content: ReviewContent }
  | { kind: 'delete'; reviewId: string }
  | { kind: 'update'; reviewId: string; body: string; axes: FullAxes }
  | { kind: 'replace'; oldId: string; content: ReviewContent }

export const AXIS_KEYS = ['ratingOverallState', 'ratingStoryState', 'ratingAnimationState', 'ratingMusicState', 'ratingCharacterState'] as const

const NO_AXES: ReviewAxes = { ratingOverallState: null, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }

export function contentOf(review: MyReview | null): ReviewContent {
  if (!review) return { axes: { ...NO_AXES }, body: '' }
  return { axes: Object.fromEntries(AXIS_KEYS.map((k) => [k, review[k]])) as unknown as ReviewAxes, body: review.body }
}

const isEmpty = (c: ReviewContent) => AXIS_KEYS.every((k) => c.axes[k] === null) && c.body.trim() === ''
const fullAxes = (a: ReviewAxes): FullAxes | null => (AXIS_KEYS.every((k) => a[k] !== null) ? (a as FullAxes) : null)

export function planReviewSave(current: MyReview | null, next: ReviewContent): ReviewPlan {
  if (!current) return isEmpty(next) ? { kind: 'none' } : { kind: 'create', content: next }
  if (isEmpty(next)) return { kind: 'delete', reviewId: current.id }
  if (AXIS_KEYS.every((k) => current[k] === next.axes[k]) && current.body === next.body) return { kind: 'none' }
  const axes = fullAxes(next.axes)
  if (axes) return { kind: 'update', reviewId: current.id, body: next.body, axes }
  return { kind: 'replace', oldId: current.id, content: next }
}

// 総合だけを変える（ほかの項目と本文はそのまま）
export function planRatingChange(current: MyReview | null, next: RatingState | null): ReviewPlan {
  const c = contentOf(current)
  return planReviewSave(current, { ...c, axes: { ...c.axes, ratingOverallState: next } })
}

// 実行して、実行後の感想の ID を返す（消したら null、変わらなければ元の ID）
export async function applyReviewPlan(token: string, workId: string, plan: ReviewPlan, currentId: string | null): Promise<string | null> {
  switch (plan.kind) {
    case 'none':
      return currentId
    case 'create':
      return createReviewWith(token, workId, plan.content.axes, plan.content.body)
    case 'delete':
      await deleteReviewIfExists(token, plan.reviewId)
      return null
    case 'update':
      await updateReview(token, plan.reviewId, plan.body, plan.axes)
      return plan.reviewId
    case 'replace': {
      const id = await createReviewWith(token, workId, plan.content.axes, plan.content.body)
      await deleteReviewIfExists(token, plan.oldId)
      return id
    }
  }
}

export function blankReview(): MyReview {
  return { id: '', body: '', createdAt: new Date().toISOString(), ...NO_AXES }
}

// 控えにある感想を、送る直前に Annict から読み直す（控えに無ければ読まない。読み込み1回ぶん増えるのは、感想がある作品だけ）
async function latest(token: string, cached: MyReview | null): Promise<MyReview | null> {
  return cached?.id ? fetchReview(token, cached.id) : null
}

async function run(token: string, workId: string, cached: MyReview | null, next: ReviewContent): Promise<MyReview | null> {
  // 前回の作成が届いていたかもしれない作品なら、まず確かめる（届いていれば、それが今の感想）
  const current = await settleUncertainReview(token, workId, cached)
  const plan = planReviewSave(current, next)
  const at = Date.now()
  let id: string | null
  try {
    id = await applyReviewPlan(token, workId, plan, current?.id ?? null)
  } catch (e) {
    if ((plan.kind === 'create' || plan.kind === 'replace') && isUncertainFailure(e)) {
      markUncertain({ kind: 'review', workId, at, oldId: plan.kind === 'replace' ? plan.oldId : null })
    }
    throw e
  }
  if (!id) return null
  const created = plan.kind === 'create' || plan.kind === 'replace'
  return { id, body: next.body, createdAt: created || !current ? new Date().toISOString() : current.createdAt, ...next.axes }
}

// 感想の中身（5項目と本文）を保存し、保存後の感想を返す（空にしたら消して null）。
// cached は共有の控えにある感想（送る直前に読み直す）
export async function saveReview(token: string, workId: string, cached: MyReview | null, next: ReviewContent): Promise<MyReview | null> {
  return run(token, workId, await latest(token, cached), next)
}

// 総合評価を rating に変え、変えた後の感想を返す（ほかの項目と本文が無ければ消して null）。
// cached は「送信の時点での共有の控え」を渡す（画面の表示は先に変わっているので、それを渡すと古い ID で消してしまう）
export async function changeRating(token: string, workId: string, cached: MyReview | null, rating: RatingState | null): Promise<MyReview | null> {
  const current = await latest(token, cached)
  const c = contentOf(current)
  return run(token, workId, current, { ...c, axes: { ...c.axes, ratingOverallState: rating } })
}

export const RATING_ORDER: readonly RatingState[] = ['GREAT', 'GOOD', 'AVERAGE', 'BAD']

export const RATING_LABEL: Record<RatingState, string> = {
  BAD: '良くない',
  AVERAGE: '普通',
  GOOD: '良い',
  GREAT: 'とても良い',
}

// 項目別の評価の名前（Annict の表記に合わせる）
export const AXIS_LABEL: Record<Exclude<(typeof AXIS_KEYS)[number], 'ratingOverallState'>, string> = {
  ratingAnimationState: '映像',
  ratingCharacterState: 'キャラクター',
  ratingStoryState: 'ストーリー',
  ratingMusicState: '音楽',
}
