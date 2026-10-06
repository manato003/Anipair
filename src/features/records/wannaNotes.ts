// 見たいの作品に付ける「優先して見る」の印と短いメモ。Annict の API には保存先が無い（LibraryEntry.note は読めるが書けない）ので、
// 端末の控えと GitHub（wanna-notes.json）で共有する（「見てない」と同じ仕組み。unseen.ts）。
// 同じ作品は、新しく操作した方を採る。外したときも項目は消さず、空の中身で残す（消すと、他の端末の控えと合わせたときに復活する）

export interface WannaNote {
  at: string
  priority: boolean
  memo: string
}

// キーは Annict の作品 ID
export type WannaNotes = Map<number, WannaNote>

export const MEMO_MAX = 200

export function parseWannaNotes(value: unknown): WannaNotes {
  const out: WannaNotes = new Map()
  if (!value || typeof value !== 'object') return out
  const notes = (value as { notes?: unknown }).notes
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return out
  for (const [k, v] of Object.entries(notes as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue
    const { at, priority, memo } = v as Record<string, unknown>
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
    out.set(id, { at, priority: priority === true, memo: typeof memo === 'string' ? memo.slice(0, MEMO_MAX) : '' })
  }
  return out
}

export function serializeWannaNotes(notes: WannaNotes): { version: 1; notes: Record<string, WannaNote> } {
  const sorted = [...notes].sort(([a], [b]) => a - b)
  return { version: 1, notes: Object.fromEntries(sorted.map(([k, v]) => [String(k), { at: v.at, priority: v.priority, memo: v.memo }])) }
}

export function mergeWannaNotes(a: WannaNotes, b: WannaNotes): WannaNotes {
  const out: WannaNotes = new Map(a)
  for (const [k, v] of b) {
    const cur = out.get(k)
    if (!cur || Date.parse(v.at) > Date.parse(cur.at)) out.set(k, v)
  }
  return out
}

export function sameWannaNotes(a: WannaNotes, b: WannaNotes): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (!w || w.at !== v.at || w.priority !== v.priority || w.memo !== v.memo) return false
  }
  return true
}

// いま付いている印とメモ（どちらも無ければ null）
export function noteOf(notes: WannaNotes, annictId: number): { priority: boolean; memo: string } | null {
  const n = notes.get(annictId)
  return n && (n.priority || n.memo.trim()) ? { priority: n.priority, memo: n.memo } : null
}

// 「優先して見る」の作品を先に（それぞれの中の順は変えない）
export function priorityFirst<T>(items: readonly T[], isPriority: (item: T) => boolean): T[] {
  return [...items.filter(isPriority), ...items.filter((i) => !isPriority(i))]
}
