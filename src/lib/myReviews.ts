import { fetchMyReviews, type MyReview } from './annict'

// 自分の感想の一覧を1回だけ読み、ブラウズの中で使い回す（アクティビティを全部辿るので毎回は重い）。
// ブラウズで評価を変えたら rememberReview で控えも直す

let cache: { token: string; promise: Promise<Map<number, MyReview>> } | null = null

export function getMyReviews(token: string): Promise<Map<number, MyReview>> {
  if (!cache || cache.token !== token) {
    const promise = fetchMyReviews(token).catch((e) => {
      cache = null
      throw e
    })
    cache = { token, promise }
  }
  return cache.promise
}

export async function rememberReview(token: string, annictId: number, review: MyReview | null): Promise<void> {
  if (!cache || cache.token !== token) return
  const map = await cache.promise.catch(() => null)
  if (!map) return
  if (review) map.set(annictId, review)
  else map.delete(annictId)
}

// 記録ページなど、別の経路で評価が変わったあとに読み直させる
export function forgetMyReviews(): void {
  cache = null
}
