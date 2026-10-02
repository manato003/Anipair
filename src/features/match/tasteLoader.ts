import { fetchLibrary, fetchMyRatings, type LibraryEntry, type RatingState } from '../../lib/annict'
import { fetchMedia, fetchSimilarMany, type Media } from '../../lib/shikimori'
import { buildProfile, buildSeeds, type Seed } from './taste'

// 好みを調べる作品の上限（Shikimori 2回ぶん）
export const MAX_SEEDS = 100

// 「似た作品」を調べる作品の上限。1作品につき1回の問い合わせ（端末に30日控えるので、初めてのときだけ時間がかかる）。
// 好きな作品を多く、苦手な作品を少し（苦手な作品に似たものを減点するため）
export const MAX_SIMILAR_LIKED = 32
export const MAX_SIMILAR_DISLIKED = 8

// 好きな作品がこの件数に届くと、好みの推定が安定する目安
export const ENOUGH_LIKED = 10

// 「好み」の元になるもの。マッチング・見たいのおすすめ順・好みの傾向で共通に使う
export interface Taste {
  library: LibraryEntry[]
  ratings: Map<number, RatingState>
  seeds: Seed[]
  topSeeds: Seed[]
  seedMedia: Map<number, Media>
  // 「似た作品」を調べた作品（重みの大きい順）と、その似た作品（似ている順の MyAnimeList ID）
  similarSeeds: Seed[]
  similar: Map<number, number[]>
  profile: Map<string, number>
}

// 「似た作品」を調べる作品を選ぶ: 好きな作品の上位 MAX_SIMILAR_LIKED 件と、苦手な作品の上位 MAX_SIMILAR_DISLIKED 件
export function pickSimilarSeeds(seeds: Seed[]): Seed[] {
  const byWeight = (a: Seed, b: Seed) => Math.abs(b.weight) - Math.abs(a.weight)
  const liked = seeds.filter((s) => s.weight > 0).sort(byWeight).slice(0, MAX_SIMILAR_LIKED)
  const disliked = seeds.filter((s) => s.weight < 0).sort(byWeight).slice(0, MAX_SIMILAR_DISLIKED)
  return [...liked, ...disliked]
}

// 手順: Annict のライブラリと評価を読む → 重みの大きい作品（上限 MAX_SEEDS）の情報を Shikimori から取って好みを作る →
// 好きな作品の「似た作品」を Shikimori から集める。好きな作品が1件も無いときは Shikimori を呼ばない
async function load(token: string, onStep?: (step: string) => void): Promise<Taste> {
  onStep?.('Annict の記録を読んでいます')
  const library = await fetchLibrary(token)
  const ratings = await fetchMyRatings(token)
  const seeds = buildSeeds(library, ratings)
  const topSeeds = [...seeds].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, MAX_SEEDS)
  const hasLikes = seeds.some((s) => s.weight > 0)
  onStep?.('好みを調べています')
  const seedMedia = hasLikes ? await fetchMedia(topSeeds.map((s) => s.malId)) : new Map<number, Media>()
  const similarSeeds = hasLikes ? pickSimilarSeeds(topSeeds) : []
  const similar = await fetchSimilarMany(
    similarSeeds.map((s) => s.malId),
    (done, total) => onStep?.(`似た作品を調べています（${done}/${total}）`),
  )
  return { library, ratings, seeds, topSeeds, seedMedia, similarSeeds, similar, profile: buildProfile(topSeeds, seedMedia) }
}

// 起動中は、同じトークンなら読んだものを使い回す（読み込みは1つの Promise。失敗したら捨てる）。
// 評価が増えたあとに読み直したいときは forgetTaste
let cache: { token: string; promise: Promise<Taste> } | null = null

// onStep は、実際に読み込むときだけ呼ばれる（使い回すときは呼ばれない）
export function loadTaste(token: string, onStep?: (step: string) => void): Promise<Taste> {
  if (cache && cache.token === token) return cache.promise
  const promise = load(token, onStep)
  const entry = { token, promise }
  cache = entry
  promise.catch(() => {
    if (cache === entry) cache = null
  })
  return promise
}

export function forgetTaste(): void {
  cache = null
}
