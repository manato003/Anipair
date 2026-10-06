import { scanMyReviews, type MyReview, type RatingState } from './annict'
import { loadAnnictToken, loadReviewsRaw, saveReviewsRaw } from './storage'

// 自分の感想の一覧を、アプリ全体で1つだけ持つ共有の控え（トークンごとの Map。作品の Annict ID → 感想）。
// 何が「現在の感想」かは、ここだけが持つ。
//
// 読み方（アクティビティは状態の変更やエピソードの記録も含むので、全部を辿ると重い）:
// - 端末に控え（animax.reviews.v1）を置く。中身は感想の一覧と、読んだ最新のアクティビティの日時（syncedThrough）、最後に全部読んだ日時（fullAt）
// - 普段は差分だけ読む。新しい順に辿り、syncedThrough（の少し前）より古い項目に来たら止めて、控えに重ねる
// - 控えが無い・7日以上前に全部読んだ・利用者が求めた（full）ときは、最後まで全部読み直して作り直す
// - 差分の読み込みは、Annict のサイトで感想を消した・直した変更を知らない（アクティビティは感想を作ったときだけ増えるため）。
//   7日に1回の全部の読み込みは、そのずれに追いつくためにある
//
// 控えはいまログインしている人のもの。トークンが変わったら storage.saveAnnictToken が消す

// 全部を読み直す間隔
export const FULL_READ_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
// 前回の最新より少し前まで重ねて読む（時計のずれや同時刻の項目の取りこぼしを防ぐ。重なった分は上書きするだけ）
export const SYNC_MARGIN_MS = 60 * 1000

const EPOCH = new Date(0).toISOString()

interface ReviewsMeta {
  // 読んだ範囲で一番新しいアクティビティ（種類は問わない）の日時
  syncedThrough: string
  // 最後に全部を読んだ日時
  fullAt: string
}

export interface ReviewsSnapshot extends ReviewsMeta {
  v: 1
  reviews: [number, MyReview][]
}

const RATINGS: readonly string[] = ['BAD', 'AVERAGE', 'GOOD', 'GREAT']
const isRating = (v: unknown): boolean => v === null || (typeof v === 'string' && RATINGS.includes(v))
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))

function parseReview(value: unknown): MyReview | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id || typeof r.body !== 'string' || typeof r.createdAt !== 'string') return null
  const axes = ['ratingOverallState', 'ratingStoryState', 'ratingAnimationState', 'ratingMusicState', 'ratingCharacterState'] as const
  if (!axes.every((k) => isRating(r[k]))) return null
  return {
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    ratingOverallState: r.ratingOverallState as RatingState | null,
    ratingStoryState: r.ratingStoryState as RatingState | null,
    ratingAnimationState: r.ratingAnimationState as RatingState | null,
    ratingMusicState: r.ratingMusicState as RatingState | null,
    ratingCharacterState: r.ratingCharacterState as RatingState | null,
  }
}

// 壊れていたら null（控えが無いのと同じ。全部読み直す）。1件でも壊れていれば全体を捨てる
// （一部だけ捨てると、差分の読み込みでは二度と取り戻せないため）
export function parseReviewsSnapshot(value: unknown): ReviewsSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (v.v !== 1 || !isIso(v.syncedThrough) || !isIso(v.fullAt) || !Array.isArray(v.reviews)) return null
  const reviews: [number, MyReview][] = []
  const seen = new Set<number>()
  for (const item of v.reviews) {
    if (!Array.isArray(item) || item.length !== 2) return null
    const [id, raw] = item as [unknown, unknown]
    const review = parseReview(raw)
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || !review || seen.has(id)) return null
    seen.add(id)
    reviews.push([id, review])
  }
  return { v: 1, syncedThrough: v.syncedThrough, fullAt: v.fullAt, reviews }
}

interface Done {
  map: Map<number, MyReview>
  meta: ReviewsMeta
}

interface Entry {
  token: string
  promise: Promise<Map<number, MyReview>>
  // 全部を読む読み込みか（読み込み中に、全部を求められたときの判断に使う）
  full: boolean
  // 読み込みが済んだら入る
  done: Done | null
}

let cache: Entry | null = null

// 控えは、いまログインしているトークンの持ち主のものだけ読み書きする
// （トークンを替えたあとに遅れて届いた、前のアカウントの更新で控えを汚さないため）
const owns = (token: string): boolean => loadAnnictToken() === token

function readPersisted(token: string): Done | null {
  if (!owns(token)) return null
  const snap = parseReviewsSnapshot(loadReviewsRaw())
  return snap ? { map: new Map(snap.reviews), meta: { syncedThrough: snap.syncedThrough, fullAt: snap.fullAt } } : null
}

function persist(entry: Entry): void {
  if (cache !== entry || !entry.done || !owns(entry.token)) return
  const snapshot: ReviewsSnapshot = { v: 1, ...entry.done.meta, reviews: [...entry.done.map] }
  saveReviewsRaw(snapshot)
}

// 差分の起点。同じトークンで読み込み済みならメモリの内容（端末に保存できない環境でも毎回全部を読まずに済む）、無ければ端末の控え
function baseFor(token: string, prior: Entry | null): Done | null {
  if (prior && prior.token === token && prior.done) return { map: new Map(prior.done.map), meta: prior.done.meta }
  return readPersisted(token)
}

function needsFull(base: Done | null, now: number): boolean {
  if (!base) return true
  const age = now - Date.parse(base.meta.fullAt)
  // 負は時計が巻き戻っている（端末の時計のずれ）。信用せずに読み直す
  return age < 0 || age >= FULL_READ_INTERVAL_MS
}

async function sync(token: string, full: boolean, base: Done | null, now: number): Promise<Done> {
  if (full || !base) {
    const scan = await scanMyReviews(token)
    return { map: scan.reviews, meta: { syncedThrough: scan.newest ?? EPOCH, fullAt: new Date(now).toISOString() } }
  }
  const stopBefore = new Date(Date.parse(base.meta.syncedThrough) - SYNC_MARGIN_MS).toISOString()
  const scan = await scanMyReviews(token, { stopBefore })
  const map = base.map
  for (const [annictId, review] of scan.reviews) {
    const prev = map.get(annictId)
    // 同じ感想は読んだ中身で上書きし、別の感想なら新しい方を採る
    if (!prev || prev.id === review.id || prev.createdAt <= review.createdAt) map.set(annictId, review)
  }
  const newest = scan.newest && Date.parse(scan.newest) > Date.parse(base.meta.syncedThrough) ? scan.newest : base.meta.syncedThrough
  return { map, meta: { syncedThrough: newest, fullAt: base.meta.fullAt } }
}

function start(token: string, forceFull: boolean, prior: Entry | null): Entry {
  const base = baseFor(token, prior)
  const now = Date.now()
  const full = forceFull || needsFull(base, now)
  const entry: Entry = {
    token,
    full,
    done: null,
    promise: sync(token, full, base, now).then(
      (done) => {
        entry.done = done
        persist(entry)
        return done.map
      },
      (e: unknown) => {
        // 失敗したら捨てる。読み直しの失敗なら、読み込み済みだった前の控えをそのまま使い続ける
        if (cache === entry) cache = prior && prior.token === token && prior.done ? prior : null
        throw e
      },
    ),
  }
  return entry
}

// 通信せずに、いま手元にある感想の控えをのぞく（メモリの読み込み済み、無ければ端末の控え）。どちらも無ければ null。
// 起動したらすぐ一覧を出すために使う（そのあと getMyReviews / refreshMyReviews で読み直す）
export function peekMyReviews(token: string): Map<number, MyReview> | null {
  if (cache && cache.token === token && cache.done) return new Map(cache.done.map)
  const persisted = readPersisted(token)
  return persisted ? persisted.map : null
}

// 1作品の感想だけを、通信せずにのぞく（答えるたびに呼ぶので、一覧を写さない）
export function peekMyReview(token: string, annictId: number): MyReview | null {
  if (cache && cache.token === token && cache.done) return cache.done.map.get(annictId) ?? null
  return readPersisted(token)?.map.get(annictId) ?? null
}

// 共有の控えを返す。無ければ読み込む（普段は差分。同じトークンの読み込み中なら、それに便乗する）
export function getMyReviews(token: string): Promise<Map<number, MyReview>> {
  if (!cache || cache.token !== token) cache = start(token, false, cache)
  return cache.promise
}

// 別の経路で感想が増えたかもしれないとき（記録ページの読み込み・マッチング・バックアップの前）に、読み直させる。
// 普段は差分だけ。full: true は利用者が「読み直す」を求めたとき（全部を読み直す）。
// 同じトークンの読み込み中なら、その読み込みを待つ（全部を求められたのに差分だけの読み込み中なら、全部の読み込みを始め直す）
export function refreshMyReviews(token: string, opts: { full?: boolean } = {}): Promise<Map<number, MyReview>> {
  const prior = cache
  if (prior && prior.token === token && !prior.done && (prior.full || !opts.full)) return prior.promise
  cache = start(token, opts.full ?? false, prior)
  return cache.promise
}

// 評価を変えたあとに、控え（メモリと端末）を直す。読み込み中なら終わるのを待つ
export async function rememberReview(token: string, annictId: number, review: MyReview | null): Promise<void> {
  for (;;) {
    const entry = cache
    if (!entry || entry.token !== token) return
    const map = await entry.promise.catch(() => null)
    if (!map) {
      // 失敗した読み込みなら、控えは前のものに戻っている。そちらに直す
      if (cache !== entry) continue
      return
    }
    // 待っているあいだに読み直しが始まっていたら、新しい方の控えに直す
    if (cache !== entry) continue
    if (review) map.set(annictId, review)
    else map.delete(annictId)
    persist(entry)
    return
  }
}

// テスト用: 起動中の控えを捨てる
export function resetMyReviewsMemory(): void {
  cache = null
}
