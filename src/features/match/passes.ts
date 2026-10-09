// マッチングで「パス」または「スルー」した作品（画面の名前は「興味なし」「保留」）。期間がたったら候補に戻す。
// - パス: 見ないと決めた。3ヶ月（91日）は出さない
// - スルー: 今は決めない。少し時間をあけてまた出し、考え直す機会を作る
// 取り消しは項目を消さずに active: false で残す（消すと、他の端末の控えと合わせたときに復活する）

export type HideKind = 'pass' | 'skip'

export const HIDE_DAYS: Record<HideKind, number> = { pass: 91, skip: 7 }

export interface PassEntry {
  at: string
  active: boolean
  kind: HideKind
}

// キーは MyAnimeList の ID（候補は Shikimori から来るので Annict の ID はまだ分からない）
export type Passes = Map<number, PassEntry>

export function parsePasses(value: unknown): Passes {
  const out: Passes = new Map()
  if (!value || typeof value !== 'object') return out
  const passes = (value as { passes?: unknown }).passes
  if (!passes || typeof passes !== 'object' || Array.isArray(passes)) return out
  for (const [k, v] of Object.entries(passes as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue
    const { at, active, kind } = v as Record<string, unknown>
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
    // スルーを足す前の記録には kind が無い。それはすべてパス
    out.set(id, { at, active: active !== false, kind: kind === 'skip' ? 'skip' : 'pass' })
  }
  return out
}

type StoredEntry = { at: string; active: boolean; kind?: 'skip' }

// パスには kind を書かない（スルーを足す前の記録と同じ形のまま）
export function serializePasses(passes: Passes): { version: 1; passes: Record<string, StoredEntry> } {
  const sorted = [...passes].sort(([a], [b]) => a - b)
  return {
    version: 1,
    passes: Object.fromEntries(
      sorted.map(([k, v]) => [String(k), v.kind === 'skip' ? { at: v.at, active: v.active, kind: 'skip' as const } : { at: v.at, active: v.active }]),
    ),
  }
}

// 同じ作品は、新しく操作した方を採る
export function mergePasses(a: Passes, b: Passes): Passes {
  const out: Passes = new Map(a)
  for (const [k, v] of b) {
    const cur = out.get(k)
    if (!cur || Date.parse(v.at) > Date.parse(cur.at)) out.set(k, v)
  }
  return out
}

export function samePasses(a: Passes, b: Passes): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (!w || w.at !== v.at || w.active !== v.active || w.kind !== v.kind) return false
  }
  return true
}

// いま候補から外している作品。パスは3ヶ月、スルーは1週間
export function activePassIds(passes: Passes, now: Date): Set<number> {
  const out = new Set<number>()
  for (const [k, v] of passes) {
    const limit = now.getTime() - HIDE_DAYS[v.kind] * 24 * 60 * 60 * 1000
    if (v.active && Date.parse(v.at) >= limit) out.add(k)
  }
  return out
}
