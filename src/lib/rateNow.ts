import type { RatingState } from './annict'
import { getMyReviews, rememberReview } from './myReviews'
import { changeRating } from './reviewOps'

// 書き込みの列の中で総合評価を付け直す（どの画面からも同じ手順）。送信の時点の実際の感想を共有の控えから読み、
// 付け直した後の感想を控えに戻す。onBefore には、付ける前の総合評価を、送る前に渡す（取り消しで戻すため。送信が失敗しても残す）
export async function rateNow(token: string, workId: string, annictId: number, rating: RatingState | null, onBefore?: (before: RatingState | null) => void): Promise<void> {
  const current = (await getMyReviews(token)).get(annictId) ?? null
  onBefore?.(current?.ratingOverallState ?? null)
  await rememberReview(token, annictId, await changeRating(token, workId, current, rating))
}
