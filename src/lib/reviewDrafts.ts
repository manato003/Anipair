import type { RatingState, ReviewAxes } from './annict'
import { loadReviewDraftsRaw, saveReviewDraftsRaw } from './storage'

// 保存していない感想の下書き（作品の詳細の「項目別の評価と感想」）。作品の Annict ID ごとに、4項目と本文を端末に置く。
// 総合評価は入れない（総合はボタンを押したときにすぐ Annict に送るので、下書きにならない）。
// 古いものから捨て、多くても MAX 件まで

export type DraftAxes = Omit<ReviewAxes, 'ratingOverallState'>

export interface ReviewDraft {
  axes: DraftAxes
  body: string
  // 最後に書いた日時
  at: string
}

const MAX = 50
const KEYS = ['ratingStoryState', 'ratingAnimationState', 'ratingMusicState', 'ratingCharacterState'] as const
const RATINGS: readonly string[] = ['BAD', 'AVERAGE', 'GOOD', 'GREAT']

function parseDraft(v: unknown): ReviewDraft | null {
  if (!v || typeof v !== 'object') return null
  const d = v as Record<string, unknown>
  const a = d.axes as Record<string, unknown> | undefined
  if (!a || typeof a !== 'object' || typeof d.body !== 'string' || typeof d.at !== 'string' || Number.isNaN(Date.parse(d.at))) return null
  if (!KEYS.every((k) => a[k] === null || (typeof a[k] === 'string' && RATINGS.includes(a[k] as string)))) return null
  const axes = Object.fromEntries(KEYS.map((k) => [k, a[k] as RatingState | null])) as unknown as DraftAxes
  return { axes, body: d.body, at: d.at }
}

// 壊れた項目は捨てる（下書きなので、1件壊れていてもほかは使う）
export function parseDrafts(value: unknown): Map<number, ReviewDraft> {
  const out = new Map<number, ReviewDraft>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(k)
    const d = parseDraft(v)
    if (Number.isInteger(id) && id > 0 && d) out.set(id, d)
  }
  return out
}

function store(map: Map<number, ReviewDraft>): void {
  const newest = [...map].sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, MAX)
  saveReviewDraftsRaw(Object.fromEntries(newest))
}

export function loadDraft(annictId: number): ReviewDraft | null {
  return parseDrafts(loadReviewDraftsRaw()).get(annictId) ?? null
}

export function saveDraft(annictId: number, draft: Omit<ReviewDraft, 'at'>): void {
  const map = parseDrafts(loadReviewDraftsRaw())
  map.set(annictId, { ...draft, at: new Date().toISOString() })
  store(map)
}

export function clearDraft(annictId: number): void {
  const map = parseDrafts(loadReviewDraftsRaw())
  if (map.delete(annictId)) store(map)
}
