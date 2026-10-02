// さかのぼりで「見てない」を押した作品。端末の控えと GitHub（unseen.json）で共有する。
// 期限は無い。取り消しは項目を消さずに active: false で残す（消すと、他の端末の控えと合わせたときに復活する。passes.ts と同じ）

export interface UnseenEntry {
  at: string
  active: boolean
}

// キーは Annict の作品 ID
export type Unseen = Map<number, UnseenEntry>

// 旧版（端末だけの配列）から移した項目の日時。あとの本当の操作は、どの端末のものでもこれに勝つ
export const LEGACY_AT = '1970-01-01T00:00:00.000Z'

export function parseUnseen(value: unknown): Unseen {
  const out: Unseen = new Map()
  if (!value || typeof value !== 'object') return out
  const unseen = (value as { unseen?: unknown }).unseen
  if (!unseen || typeof unseen !== 'object' || Array.isArray(unseen)) return out
  for (const [k, v] of Object.entries(unseen as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue
    const { at, active } = v as Record<string, unknown>
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
    out.set(id, { at, active: active !== false })
  }
  return out
}

export function serializeUnseen(unseen: Unseen): { version: 1; unseen: Record<string, UnseenEntry> } {
  const sorted = [...unseen].sort(([a], [b]) => a - b)
  return { version: 1, unseen: Object.fromEntries(sorted.map(([k, v]) => [String(k), { at: v.at, active: v.active }])) }
}

// 同じ作品は、新しく操作した方を採る
export function mergeUnseen(a: Unseen, b: Unseen): Unseen {
  const out: Unseen = new Map(a)
  for (const [k, v] of b) {
    const cur = out.get(k)
    if (!cur || Date.parse(v.at) > Date.parse(cur.at)) out.set(k, v)
  }
  return out
}

export function sameUnseen(a: Unseen, b: Unseen): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (!w || w.at !== v.at || w.active !== v.active) return false
  }
  return true
}

// いま「見てない」にしている作品
export function activeUnseenIds(unseen: Unseen): Set<number> {
  const out = new Set<number>()
  for (const [k, v] of unseen) if (v.active) out.add(k)
  return out
}

// 旧形式の配列を項目にする
export function fromLegacy(ids: readonly number[]): Unseen {
  return new Map(ids.map((id) => [id, { at: LEGACY_AT, active: true }]))
}
