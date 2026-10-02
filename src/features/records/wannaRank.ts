import type { Media } from '../../lib/shikimori'
import { contentScore, explain, type PoolEntry } from '../match/taste'

// 見たい作品を好みの順に並べる（純粋な関数）。マッチングの rankCandidates と同じ式だが、
// 記録済み・続編・形式では1件も落とさない（見たい作品はすべて一覧に残す）

export interface WannaScore {
  score: number
  // 一覧に添える理由（explain の先頭）。無ければ null
  reason: string | null
}

// malIds: 見たい作品の MyAnimeList ID。pool: 好きな作品に似た作品（collectPool で、除外なしで集めたもの）。
// 戻り値は Shikimori の情報が取れた作品だけ。似た作品の一覧に無い作品の「似ている度合い」は 0
export function scoreWanna(
  malIds: readonly number[],
  details: ReadonlyMap<number, Media>,
  pool: readonly PoolEntry[],
  profile: ReadonlyMap<string, number>,
): Map<number, WannaScore> {
  const recs = new Map(pool.map((e) => [e.malId, e]))
  const rows = [...new Set(malIds)].flatMap((malId) => {
    const media = details.get(malId)
    if (!media) return []
    const entry = recs.get(malId) ?? { malId, recScore: 0, from: [] }
    return [{ malId, media, entry, rec: entry.recScore, content: contentScore(media, profile) }]
  })
  const maxRec = Math.max(1e-9, ...rows.map((r) => r.rec))
  const maxContent = Math.max(1e-9, ...rows.map((r) => Math.abs(r.content)))
  return new Map(
    rows.map((r) => [
      r.malId,
      { score: r.rec / maxRec + 0.6 * (r.content / maxContent), reason: explain(r.media, r.entry, profile, false)[0] ?? null },
    ]),
  )
}

// 点数の高い順に並べる。点数の無い作品（MAL の ID が無い・Shikimori に情報が無い）は、もとの順のまま最後に置く
export function orderByScore<T>(items: readonly T[], malIdOf: (item: T) => number | null, scores: ReadonlyMap<number, WannaScore>): T[] {
  const scored: { item: T; score: number; i: number }[] = []
  const rest: T[] = []
  items.forEach((item, i) => {
    const id = malIdOf(item)
    const s = id === null ? undefined : scores.get(id)
    if (s) scored.push({ item, score: s.score, i })
    else rest.push(item)
  })
  // 同点はもとの順
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return [...scored.map((s) => s.item), ...rest]
}
