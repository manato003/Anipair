import { fetchLibrary, type LibraryEntry, type RatingState } from '../../lib/annict'
import { refreshMyReviews } from '../../lib/myReviews'
import { fetchMedia, fetchSimilarMany, isSimilarCached, type FetchOptions, type Media } from '../../lib/shikimori'
import { buildProfile, buildSeeds, type Seed } from './taste'

// 好みを調べる作品の上限（Shikimori 2回ぶん）
export const MAX_SEEDS = 100

// 「似た作品」は、好きな作品と苦手な作品のすべてについて調べる（1作品につき1回の問い合わせ。端末に30日控えるので、初めてのときだけ時間がかかる）。
// 以前は好き32件・苦手8件までにしていたが、利用者の記録で測ると、上限を外すと隠した好きな作品が候補に入る割合が 0.61 → 0.73 に上がった
// （2026-10-07、scripts/match_eval.ts。上限があると、評価を増やしても33件目からの好きな作品が候補を広げなかった）。
// 控えていない作品がこの数を超えるときは、待ち時間の案内を出す
export const LONG_WAIT_UNCACHED = 30
export const LONG_WAIT_NOTE = '初めて調べる作品が多いので、数分かかります（記録が多いほど長くなります）。次からは端末の控えを使うので速くなります。待つあいだ、ほかのページを見ていても大丈夫です。'

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

// 「似た作品」を調べる作品を選ぶ: 好きな作品すべて（重みの大きい順）のあとに、苦手な作品すべて
export function pickSimilarSeeds(seeds: Seed[]): Seed[] {
  const byWeight = (a: Seed, b: Seed) => Math.abs(b.weight) - Math.abs(a.weight)
  return [...seeds.filter((s) => s.weight > 0).sort(byWeight), ...seeds.filter((s) => s.weight < 0).sort(byWeight)]
}

// 感想から総合評価だけを取り出す（作品の annictId → 評価）
function ratingsOf(reviews: ReadonlyMap<number, { ratingOverallState: RatingState | null }>): Map<number, RatingState> {
  const out = new Map<number, RatingState>()
  for (const [id, r] of reviews) if (r.ratingOverallState) out.set(id, r.ratingOverallState)
  return out
}

// 手順: Annict のライブラリと評価を読む → 重みの大きい作品（上限 MAX_SEEDS）の情報を Shikimori から取って好みを作る →
// 好きな作品の「似た作品」を Shikimori から集める。好きな作品が1件も無いときは Shikimori を呼ばない。
// 評価は共有の感想の控え（myReviews.ts）から。ここで差分だけ読み直すので、全部を辿り直すことは無い。
// shikimori は Shikimori への問い合わせの優先度（先読みのときは裏の優先度にして、画面の問い合わせを遅らせない）
// onStep の note は、時間がかかるときの案内（画面の読み込み中の下に出す）。
// work は、端末に控えの無い（問い合わせて待つ）作品の進み具合。画面が残り時間を見積もるのに使う（控えのある作品はすぐ終わるので数えない）
export type StepHandler = (step: string, note?: string, work?: { done: number; total: number }) => void

async function load(token: string, onStep?: StepHandler, shikimori: FetchOptions = {}): Promise<Taste> {
  onStep?.('Annict の記録を読み込み中')
  const library = await fetchLibrary(token)
  const ratings = ratingsOf(await refreshMyReviews(token))
  const seeds = buildSeeds(library, ratings)
  const topSeeds = [...seeds].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, MAX_SEEDS)
  const hasLikes = seeds.some((s) => s.weight > 0)
  onStep?.('好みを分析しています')
  const seedMedia = hasLikes ? await fetchMedia(topSeeds.map((s) => s.malId), shikimori) : new Map<number, Media>()
  const similarSeeds = hasLikes ? pickSimilarSeeds(seeds) : []
  const uncached = new Set(similarSeeds.filter((s) => !isSimilarCached(s.malId)).map((s) => s.malId))
  const note = uncached.size > LONG_WAIT_UNCACHED ? LONG_WAIT_NOTE : undefined
  let fetched = 0
  const similar = await fetchSimilarMany(
    similarSeeds.map((s) => s.malId),
    (done, total, malId) => {
      if (uncached.has(malId)) fetched += 1
      onStep?.(`似た作品を検索中（${done}/${total}）`, note, uncached.size > 0 ? { done: fetched, total: uncached.size } : undefined)
    },
    shikimori,
  )
  return { library, ratings, seeds, topSeeds, seedMedia, similarSeeds, similar, profile: buildProfile(topSeeds, seedMedia) }
}

// 起動中は、同じトークンなら読んだものを使い回す（読み込みは1つの Promise。失敗したら捨てる）。
// 評価が増えたあとに読み直したいときは forgetTaste
let cache: { token: string; promise: Promise<Taste> } | null = null

// onStep は、実際に読み込むときだけ呼ばれる（使い回すときは呼ばれない）
export function loadTaste(token: string, onStep?: StepHandler): Promise<Taste> {
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

// 起動中に先読みした印（トークンごと。1起動に1回まで）
const prefetched = new Set<string>()

// 好みの先読み。loadTaste と同じ手順で、Shikimori への問い合わせを裏の優先度で行う。
// 目的は、似た作品の一覧（端末に30日控える）と作品の情報を先に集めておくこと。
// 読んだ好みそのものは使い回しの控え（loadTaste の cache）には入れない
// （あとで評価が増えたときに、古い好みを返さないため。マッチングは毎回 forgetTaste して読み直す）。
// 失敗は黙って捨てる（本番の読み込みが改めて試す）。同じトークンでは1起動に1回だけ。
// すでに本番の読み込みが始まっているなら何もしない
export async function prefetchTaste(token: string): Promise<void> {
  if (prefetched.has(token) || (cache && cache.token === token)) return
  prefetched.add(token)
  try {
    await load(token, undefined, { background: true })
  } catch {
    // 先読みなので、失敗しても何も出さない
  }
}

// テスト用: 先読みした印を消す
export function resetPrefetchedTaste(): void {
  prefetched.clear()
}
