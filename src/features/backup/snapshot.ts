import type { LibraryEntry, MyReview, RatingState, StatusState } from '../../lib/annict'
import { serializePasses, type Passes } from '../match/passes'
import { serializeUnseen, type Unseen } from '../rate/unseen'

// バックアップの中身（GitHub の backup.json と、ファイルへの書き出しで共通）。画面にも通信にも触れない純粋な関数だけを置く。
// 復元はまだ作らないが、あとで作れるように、状態と日時・評価5項目と本文・パス・見てないを全部入れる

export interface SnapshotReview {
  id: string
  createdAt: string
  body: string
  overall: RatingState | null
  story: RatingState | null
  animation: RatingState | null
  music: RatingState | null
  character: RatingState | null
}

export interface SnapshotWork {
  annictId: number
  // 感想だけ残っていてライブラリから消えた作品は、感想の控えにタイトルが無いので null
  workId: string | null
  title: string | null
  malAnimeId: string | null
  state: StatusState | null
  stateAt: string | null
  review: SnapshotReview | null
}

export interface Snapshot {
  version: 1
  createdAt: string
  app: 'animax'
  works: SnapshotWork[]
  passes: ReturnType<typeof serializePasses>
  unseen: ReturnType<typeof serializeUnseen>
}

export interface SnapshotInput {
  library: readonly LibraryEntry[]
  reviews: ReadonlyMap<number, MyReview>
  passes: Passes
  unseen: Unseen
  now: Date
}

function toSnapshotReview(r: MyReview): SnapshotReview {
  return {
    id: r.id,
    createdAt: r.createdAt,
    body: r.body,
    overall: r.ratingOverallState,
    story: r.ratingStoryState,
    animation: r.ratingAnimationState,
    music: r.ratingMusicState,
    character: r.ratingCharacterState,
  }
}

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const works = new Map<number, SnapshotWork>()
  for (const e of input.library) {
    const review = input.reviews.get(e.annictId)
    works.set(e.annictId, {
      annictId: e.annictId,
      workId: e.workId,
      title: e.title,
      malAnimeId: e.malAnimeId,
      state: e.state,
      stateAt: e.stateAt,
      review: review ? toSnapshotReview(review) : null,
    })
  }
  // ライブラリから消えた作品の感想も残す（評価を1つも失わないため）
  for (const [annictId, r] of input.reviews) {
    if (works.has(annictId)) continue
    works.set(annictId, { annictId, workId: null, title: null, malAnimeId: null, state: null, stateAt: null, review: toSnapshotReview(r) })
  }
  return {
    version: 1,
    createdAt: input.now.toISOString(),
    app: 'animax',
    // 作品 ID の順に並べる（毎回同じ順なので、git の差分が変わった作品だけになる）
    works: [...works.values()].sort((a, b) => a.annictId - b.annictId),
    passes: serializePasses(input.passes),
    unseen: serializeUnseen(input.unseen),
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  // キーの順序は問わない（手で直されたファイルでも、中身が同じなら同じとみなす）
  return ka.every((k) => k in b && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

function withoutCreatedAt(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const { createdAt, ...rest } = value as Record<string, unknown>
  void createdAt
  return rest
}

// 取った時刻だけが違うスナップショットは同じとみなす（中身が同じなら書かない）。b は GitHub から読んだ生の値
export function sameSnapshot(a: Snapshot, b: unknown): boolean {
  return deepEqual(withoutCreatedAt(a), withoutCreatedAt(b))
}

export interface SnapshotCounts {
  watched: number
  wanna: number
  watching: number
  // 中断・視聴中止
  other: number
  rated: number
}

export function countSnapshot(snapshot: Snapshot): SnapshotCounts {
  const counts: SnapshotCounts = { watched: 0, wanna: 0, watching: 0, other: 0, rated: 0 }
  for (const w of snapshot.works) {
    if (w.state === 'WATCHED') counts.watched++
    else if (w.state === 'WANNA_WATCH') counts.wanna++
    else if (w.state === 'WATCHING') counts.watching++
    else if (w.state) counts.other++
    if (w.review?.overall) counts.rated++
  }
  return counts
}

// コミットメッセージと設定画面で共通の言い方
export function describeCounts(c: SnapshotCounts): string {
  return `見た ${c.watched}・見たい ${c.wanna}・評価 ${c.rated}`
}
