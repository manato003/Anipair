import { fetchMediaByMal, type AniMedia } from '../../lib/anilist'
import { fetchLibrary, fetchMyRatings, type LibraryEntry, type RatingState } from '../../lib/annict'
import { buildProfile, buildSeeds, type Seed } from './taste'

// 好みを調べる作品の上限（AniList 2回ぶん）
export const MAX_SEEDS = 100

// 好きな作品がこの件数に届くと、好みの推定が安定する目安
export const ENOUGH_LIKED = 10

// 「好み」の元になるもの。マッチング・見たいのおすすめ順・好みの傾向で共通に使う
export interface Taste {
  library: LibraryEntry[]
  ratings: Map<number, RatingState>
  seeds: Seed[]
  topSeeds: Seed[]
  seedMedia: Map<number, AniMedia>
  profile: Map<string, number>
}

// 手順: Annict のライブラリと評価を読む → 重みの大きい作品（上限 MAX_SEEDS）の情報を AniList から取る → 好みを作る。
// 好きな作品が1件も無いときは AniList を呼ばない
async function load(token: string, onStep?: (step: string) => void): Promise<Taste> {
  onStep?.('Annict の記録を読んでいます')
  const library = await fetchLibrary(token)
  const ratings = await fetchMyRatings(token)
  const seeds = buildSeeds(library, ratings)
  const topSeeds = [...seeds].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, MAX_SEEDS)
  onStep?.('好みを調べています')
  const seedMedia = seeds.some((s) => s.weight > 0) ? await fetchMediaByMal(topSeeds.map((s) => s.malId)) : new Map<number, AniMedia>()
  return { library, ratings, seeds, topSeeds, seedMedia, profile: buildProfile(topSeeds, seedMedia) }
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
