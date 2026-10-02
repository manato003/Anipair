import type { LibraryEntry, RatingState, StatusState } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
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

// 作品の特徴。ジャンル・テーマ・対象層・制作会社を同じ空間に並べる。
// Shikimori のジャンルとテーマには関連度の数値が無いので、どれも同じ重み（対象層は大まかなので半分、制作会社は 0.8）
export function features(m: Media): Map<string, number> {
  const f = new Map<string, number>()
  for (const g of m.genres) f.set(`g:${g}`, 1)
  // 「受賞作」は作品の好みの手がかりにならない（どのジャンルにも付く）ので特徴にしない
  for (const t of m.themes) if (t !== 'Award Winning') f.set(`t:${t}`, 1)
  for (const d of m.demographics) f.set(`d:${d}`, 0.5)
  for (const s of m.studios) f.set(`s:${s}`, 0.8)
  return f
}

// 評価の重みで特徴を足し合わせた「好み」。重みの絶対値の合計で割り、評価の件数に左右されにくくする
export function buildProfile(seeds: Seed[], media: ReadonlyMap<number, Media>): Map<string, number> {
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

// 似た作品の並びの上位ほど強く効かせる。1位を1として、1つ下がるごとに 1/(1+0.15×順位) まで弱める（40位で約 0.14）
export const SIMILAR_RANK_DECAY = 0.15

// 好きな作品に「似た作品」（Shikimori。似ている順）を集める。並びの位置で重みを付け、苦手な作品から出てきた分は減点する。
// similar は、作品の MyAnimeList ID → 似ている順の MyAnimeList ID
export function collectPool(seeds: Seed[], similar: ReadonlyMap<number, readonly number[]>, exclude: ReadonlySet<number>): PoolEntry[] {
  const pool = new Map<number, PoolEntry>()
  for (const s of seeds) {
    const list = similar.get(s.malId)
    if (!list) continue
    list.forEach((id, rank) => {
      if (id === s.malId || exclude.has(id)) return
      const e = pool.get(id) ?? { malId: id, recScore: 0, from: [] }
      e.recScore += s.weight / (1 + rank * SIMILAR_RANK_DECAY)
      if (s.weight > 0 && !e.from.includes(s)) e.from.push(s)
      pool.set(id, e)
    })
  }
  return [...pool.values()].filter((e) => e.recScore > 0).sort((a, b) => b.recScore - a.recScore)
}

export interface Candidate {
  media: Media
  score: number
  reasons: string[]
}

// 特番・スペシャル・MV・PV・CM は出さない
const ALLOWED_FORMATS = new Set(['TV', 'MOVIE', 'ONA', 'OVA'])

export function contentScore(m: Media, profile: ReadonlyMap<string, number>): number {
  const f = features(m)
  if (f.size === 0) return 0
  let sum = 0
  for (const [k, v] of f) sum += v * (profile.get(k) ?? 0)
  return sum / Math.sqrt(f.size)
}

export function rankCandidates(
  pool: PoolEntry[],
  details: ReadonlyMap<number, Media>,
  profile: ReadonlyMap<string, number>,
  seen: ReadonlySet<number>,
  // 形式と放送年の絞り込み（無ければ絞らない）。成人向け・未放送・MV などと、前作を見ていない続編を除くのは、これとは別に常に行う
  filter?: MatchFilter,
): Candidate[] {
  const rows: { media: Media; rec: number; content: number; entry: PoolEntry; sequel: boolean }[] = []
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

// Shikimori（MyAnimeList と同じ分類）のジャンル・テーマ・対象層の日本語。無いものは英語のまま出す（genreName）
export const GENRE_JA: Record<string, string> = {
  // ジャンル
  Action: 'アクション',
  Adventure: '冒険',
  'Avant Garde': '前衛的',
  'Boys Love': 'BL',
  Comedy: 'コメディ',
  Drama: 'ドラマ',
  Ecchi: 'お色気',
  Erotica: 'エロティカ',
  Fantasy: 'ファンタジー',
  'Girls Love': '百合',
  Gourmet: 'グルメ',
  Hentai: 'ヘンタイ',
  Horror: 'ホラー',
  Mystery: 'ミステリー',
  Romance: '恋愛',
  'Sci-Fi': 'SF',
  'Slice of Life': '日常',
  Sports: 'スポーツ',
  Supernatural: '超常',
  Suspense: 'サスペンス',
  Yaoi: 'ヤオイ',
  Yuri: '百合',
  // テーマ
  'Adult Cast': '大人のキャスト',
  Anthropomorphic: '擬人化',
  'Award Winning': '受賞作',
  CGDCT: '日常系（美少女）',
  Childcare: '育児',
  'Combat Sports': '格闘技',
  Crossdressing: '女装・男装',
  Delinquents: '不良',
  Detective: '探偵',
  Educational: '教育',
  'Gag Humor': 'ギャグ',
  Gore: 'グロ',
  Harem: 'ハーレム',
  'High Stakes Game': '駆け引き・頭脳戦',
  Historical: '歴史',
  'Idols (Female)': 'アイドル（女性）',
  'Idols (Male)': 'アイドル（男性）',
  Isekai: '異世界',
  Iyashikei: '癒し系',
  'Love Polygon': '多角関係',
  'Love Status Quo': '進展しない恋愛',
  'Magical Sex Shift': '性別が変わる',
  'Mahou Shoujo': '魔法少女',
  'Martial Arts': '武術',
  Mecha: 'ロボット',
  Medical: '医療',
  Military: '軍事',
  Music: '音楽',
  Mythology: '神話',
  'Organized Crime': '犯罪組織',
  'Otaku Culture': 'オタク文化',
  Parody: 'パロディ',
  'Performing Arts': '舞台芸術',
  Pets: 'ペット',
  Psychological: 'サイコ',
  Racing: 'レース',
  Reincarnation: '転生',
  'Reverse Harem': '逆ハーレム',
  Samurai: '侍',
  School: '学園',
  Showbiz: '芸能界',
  Space: '宇宙',
  'Strategy Game': '戦略ゲーム',
  'Super Power': '超能力',
  Survival: 'サバイバル',
  'Team Sports': 'チームスポーツ',
  'Time Travel': 'タイムトラベル',
  Vampire: '吸血鬼',
  Villainess: '悪役令嬢',
  'Video Game': 'ゲーム',
  'Visual Arts': '美術',
  Workplace: '職場',
  // 対象層
  Josei: '女性向け',
  Kids: '子ども向け',
  Seinen: '青年向け',
  Shoujo: '少女向け',
  Shounen: '少年向け',
}

export function genreName(g: string): string {
  return GENRE_JA[g] ?? g
}

// 好きなものの上位。profile の重みが正で、重みの大きい順（同点は名前順）
function likedNames(names: readonly string[], prefix: 'g' | 't', profile: ReadonlyMap<string, number>, limit: number): string[] {
  return names
    .filter((n) => (profile.get(`${prefix}:${n}`) ?? 0) > 0)
    .sort((a, b) => (profile.get(`${prefix}:${b}`) ?? 0) - (profile.get(`${prefix}:${a}`) ?? 0) || a.localeCompare(b))
    .slice(0, limit)
}

export function explain(m: Media, entry: PoolEntry, profile: ReadonlyMap<string, number>, sequel: boolean): string[] {
  const reasons: string[] = []
  const from = [...entry.from].sort((a, b) => b.weight - a.weight).slice(0, 2)
  if (from.length) reasons.push(`${from.map((s) => `『${s.title}』`).join('')}が好きな人のおすすめ`)
  const genres = likedNames(m.genres, 'g', profile, 2)
  if (genres.length) reasons.push(`好きなジャンル: ${genres.map(genreName).join('・')}`)
  const themes = likedNames(m.themes, 't', profile, 2)
  if (themes.length) reasons.push(`好きなテーマ: ${themes.map(genreName).join('・')}`)
  const studio = m.studios.find((s) => (profile.get(`s:${s}`) ?? 0) > 0.3)
  if (studio) reasons.push(`好きな制作会社: ${studio}`)
  if (sequel) reasons.push('前作を見ています')
  return reasons
}
