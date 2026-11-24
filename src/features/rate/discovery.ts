import type { Media } from '../../lib/shikimori'

// クールを踏破した画面に添える、ときどきの発見（2026-11-19、Cの案 C2。concept.md「進み具合と称号」の段C）。
// そのクールで見た作品の制作会社・ジャンルから、目立つものを1つだけ選ぶ。称号にはしない（件数で釣らない）。
// 材料は手元のクールの作品だけ（記録全体で数えると、起動ごとに全作品の情報を読むことになる。2026-11-19 利用者）

export interface Discovery {
  kind: 'studio' | 'genre'
  // Shikimori の名前（画面では studioName・genreName で言い換える）
  name: string
  count: number
}

// 発見と言えるのは、同じ制作会社・ジャンルが3本以上のとき（2本では偶然の重なりに近い）
export const DISCOVERY_MIN = 3

// 多い順（同数は名前順）の先頭。min に届かなければ null
function top(names: readonly string[], min: number): { name: string; count: number } | null {
  const counts = new Map<string, number>()
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
  const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return best && best[1] >= min ? { name: best[0], count: best[1] } : null
}

// 制作会社を先に見る（ジャンルより「なるほど」と思える発見になりやすい）。どちらも届かなければ null
export function courDiscovery(watched: readonly Media[]): Discovery | null {
  const studio = top(
    watched.flatMap((m) => [...new Set(m.studios)]),
    DISCOVERY_MIN,
  )
  if (studio) return { kind: 'studio', ...studio }
  const genre = top(
    watched.flatMap((m) => [...new Set(m.genres)]),
    DISCOVERY_MIN,
  )
  return genre ? { kind: 'genre', ...genre } : null
}
