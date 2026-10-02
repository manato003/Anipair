import type { AniMedia } from '../../lib/anilist'
import type { LibraryEntry, RatingState, StatusState } from '../../lib/annict'
import { matchesFilter, type MatchFilter } from './matchFilter'

// 好みの推定と候補の順位付け。すべて純粋な関数

export interface Seed {
  malId: number
  title: string
  weight: number
}

const RATING_WEIGHT: Record<RatingState, number> = { GREAT: 2, GOOD: 1, AVERAGE: 0, BAD: -1.5 }

// 記録1件が好みの手がかりとしてどれだけ効くか。見たいは「まだ見ていない」ので手がかりにしない
export function seedWeight(state: StatusState, rating: RatingState | undefined): number {
  switch (state) {
    case 'WATCHED':
      return rating ? RATING_WEIGHT[rating] : 0.5
    case 'WATCHING':
      return rating ? RATING_WEIGHT[rating] : 0.5
    case 'STOP_WATCHING':
      return -1
    default:
      return 0
  }
}

export function malIdOf(entry: { malAnimeId: string | null }): number | null {
  const n = Number(entry.malAnimeId)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function buildSeeds(library: LibraryEntry[], ratings: ReadonlyMap<number, RatingState>): Seed[] {
  const seeds: Seed[] = []
  for (const e of library) {
    const malId = malIdOf(e)
    const weight = seedWeight(e.state, ratings.get(e.annictId))
    if (malId && weight !== 0) seeds.push({ malId, title: e.title, weight })
  }
  return seeds
}

// 見たことのある作品（途中まで・途中でやめたも含む）。続編を出してよいかの判定に使う
export function seenMalIds(library: LibraryEntry[]): Set<number> {
  const seen = new Set<number>()
  for (const e of library) {
    const id = malIdOf(e)
    if (id && e.state !== 'WANNA_WATCH') seen.add(id)
  }
  return seen
}

// 作品の特徴。ジャンル・タグ（関連度つき）・制作会社を同じ空間に並べる
export function features(m: AniMedia): Map<string, number> {
  const f = new Map<string, number>()
  for (const g of m.genres) f.set(`g:${g}`, 1)
  for (const t of m.tags) if (t.rank >= 50) f.set(`t:${t.name}`, t.rank / 100)
  for (const s of m.studios) f.set(`s:${s}`, 0.8)
  return f
}

// 評価の重みで特徴を足し合わせた「好み」。重みの絶対値の合計で割り、評価の件数に左右されにくくする
export function buildProfile(seeds: Seed[], media: ReadonlyMap<number, AniMedia>): Map<string, number> {
  const profile = new Map<string, number>()
  let total = 0
  for (const s of seeds) {
    const m = media.get(s.malId)
    if (!m) continue
    total += Math.abs(s.weight)
    for (const [k, v] of features(m)) profile.set(k, (profile.get(k) ?? 0) + s.weight * v)
  }
  if (total > 0) for (const [k, v] of profile) profile.set(k, v / total)
  return profile
}

export interface PoolEntry {
  malId: number
  recScore: number
  // この候補を推薦している、好きな作品
  from: Seed[]
}

// 好きな作品に付いた「これも好きな人が多い」を集める。苦手な作品から推薦されている分は減点する
export function collectPool(seeds: Seed[], media: ReadonlyMap<number, AniMedia>, exclude: ReadonlySet<number>): PoolEntry[] {
  const pool = new Map<number, PoolEntry>()
  for (const s of seeds) {
    const m = media.get(s.malId)
    if (!m) continue
    for (const r of m.recommendations) {
      if (exclude.has(r.idMal)) continue
      const e = pool.get(r.idMal) ?? { malId: r.idMal, recScore: 0, from: [] }
      e.recScore += s.weight * Math.log1p(Math.max(r.rating, 0))
      if (s.weight > 0) e.from.push(s)
      pool.set(r.idMal, e)
    }
  }
  return [...pool.values()].filter((e) => e.recScore > 0).sort((a, b) => b.recScore - a.recScore)
}

export interface Candidate {
  media: AniMedia
  score: number
  reasons: string[]
}

const ALLOWED_FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE', 'ONA', 'OVA'])

export function contentScore(m: AniMedia, profile: ReadonlyMap<string, number>): number {
  const f = features(m)
  if (f.size === 0) return 0
  let sum = 0
  for (const [k, v] of f) sum += v * (profile.get(k) ?? 0)
  return sum / Math.sqrt(f.size)
}

export function rankCandidates(
  pool: PoolEntry[],
  details: ReadonlyMap<number, AniMedia>,
  profile: ReadonlyMap<string, number>,
  seen: ReadonlySet<number>,
  // 形式と放送年の絞り込み（無ければ絞らない）。成人向け・未放送・MV などと、前作を見ていない続編を除くのは、これとは別に常に行う
  filter?: MatchFilter,
): Candidate[] {
  const rows: { media: AniMedia; rec: number; content: number; entry: PoolEntry; sequel: boolean }[] = []
  for (const entry of pool) {
    const m = details.get(entry.malId)
    if (!m || m.isAdult || m.status === 'NOT_YET_RELEASED') continue
    if (m.format && !ALLOWED_FORMATS.has(m.format)) continue
    if (filter && !matchesFilter(m, filter)) continue
    // 前作を見ていない続編は出さない。前作を見ていれば出す
    const sequel = m.prequels.length > 0
    if (sequel && !m.prequels.some((p) => seen.has(p))) continue
    rows.push({ media: m, rec: entry.recScore, content: contentScore(m, profile), entry, sequel })
  }
  const maxRec = Math.max(1e-9, ...rows.map((r) => r.rec))
  const maxContent = Math.max(1e-9, ...rows.map((r) => Math.abs(r.content)))
  return rows
    .map((r) => ({
      media: r.media,
      score: r.rec / maxRec + 0.6 * (r.content / maxContent),
      reasons: explain(r.media, r.entry, profile, r.sequel),
    }))
    .sort((a, b) => b.score - a.score)
}

export const GENRE_JA: Record<string, string> = {
  Action: 'アクション',
  Adventure: '冒険',
  Comedy: 'コメディ',
  Drama: 'ドラマ',
  Ecchi: 'お色気',
  Fantasy: 'ファンタジー',
  Horror: 'ホラー',
  'Mahou Shoujo': '魔法少女',
  Mecha: 'ロボット',
  Music: '音楽',
  Mystery: 'ミステリー',
  Psychological: 'サイコ',
  Romance: '恋愛',
  'Sci-Fi': 'SF',
  'Slice of Life': '日常',
  Sports: 'スポーツ',
  Supernatural: '超常',
  Thriller: 'スリラー',
}

export function explain(m: AniMedia, entry: PoolEntry, profile: ReadonlyMap<string, number>, sequel: boolean): string[] {
  const reasons: string[] = []
  const from = [...entry.from].sort((a, b) => b.weight - a.weight).slice(0, 2)
  if (from.length) reasons.push(`${from.map((s) => `『${s.title}』`).join('')}が好きな人のおすすめ`)
  const genres = m.genres
    .filter((g) => (profile.get(`g:${g}`) ?? 0) > 0 && GENRE_JA[g])
    .sort((a, b) => (profile.get(`g:${b}`) ?? 0) - (profile.get(`g:${a}`) ?? 0))
    .slice(0, 2)
  if (genres.length) reasons.push(`好きなジャンル: ${genres.map((g) => GENRE_JA[g]).join('・')}`)
  const studio = m.studios.find((s) => (profile.get(`s:${s}`) ?? 0) > 0.3)
  if (studio) reasons.push(`好きな制作会社: ${studio}`)
  if (sequel) reasons.push('前作を見ています')
  return reasons
}
