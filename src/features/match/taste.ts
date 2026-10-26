import type { LibraryEntry, RatingState, StatusState } from '../../lib/annict'
import { getLang, t } from '../../lib/i18n'
import { malIdOf } from '../../lib/malId'
import { workTitle } from '../../lib/names'
import type { Media } from '../../lib/shikimori'
import { matchesFilter, type MatchFilter } from './matchFilter'

// 好みの推定と候補の順位付け。すべて純粋な関数

export interface Seed {
  malId: number
  title: string
  // 英語の画面に出す題名（Annict の titleEn）
  titleEn?: string | null
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

export function buildSeeds(library: LibraryEntry[], ratings: ReadonlyMap<number, RatingState>): Seed[] {
  const seeds: Seed[] = []
  for (const e of library) {
    const malId = malIdOf(e)
    const weight = seedWeight(e.state, ratings.get(e.annictId))
    if (malId && weight !== 0) seeds.push({ malId, title: e.title, titleEn: e.titleEn, weight })
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
  // この候補と同じシリーズの、好きな作品（いちばん評価の高いもの）と、その作品から見たつながり（sequel・prequel・side_story。addSeries）
  series?: Seed
  seriesKind?: string
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

// 同じシリーズとして扱う関連作品の種類（Shikimori の relationKind）と、上乗せの割合。じかにつながる続編・前作を満額、外伝は小さく。
// parent_story は、シリーズの大元を指すことがある（『機動戦士ガンダムSEED』→ 1979年の『機動戦士ガンダム』）ので入れない。
// スピンオフ・別の版・総集編・登場人物の共通・原作も入れない。外伝を満額にすると、短い特別編やスピンオフの OVA が上位を埋めた
// （2026-10-21 利用者の記録で、30枚のうち2〜13位がシリーズ作。scripts/match_eval.ts --show）
const SERIES_KINDS: ReadonlyMap<string, number> = new Map([
  ['sequel', 1],
  ['prequel', 1],
  ['side_story', 0.35],
])
// シリーズ作の上乗せ（順位の点数。推薦の強さ 1・好みの一致 0.6 に足す）。とても良い（重み 2）の作品の続編で満額、良い（重み 1）で半分
export const SERIES_BONUS = 0.8
// 1話がこれより短い外伝（ミニアニメ・数分の特別編）は上乗せしない
const SHORT_MINUTES = 10
// 似た作品の一覧に入っていないシリーズ作を、新しく候補に足す数の上限（作品の情報を読む数を抑える）
export const SERIES_LIMIT = 30

// 好きな作品のシリーズ作（続編・前作・外伝など）を候補に足し、印を付ける（2026-10-21 利用者 #36: 好評価の作品のシリーズ作は高めに出す）。
// 似た作品の一覧（Shikimori）にはシリーズ作が入らないことが多いので、好きな作品の関連作品から直接足す。
// 記録した・興味なしの作品（exclude）は足さない。関連作品は、好みを作るときに読んだ作品の情報（seedMedia）にあるものだけ使う
export function addSeries(pool: readonly PoolEntry[], seeds: readonly Seed[], seedMedia: ReadonlyMap<number, Media>, exclude: ReadonlySet<number>): PoolEntry[] {
  const byId = new Map(pool.map((e) => [e.malId, { ...e }]))
  let added = 0
  const liked = seeds.filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight)
  for (const s of liked) {
    for (const r of seedMedia.get(s.malId)?.related ?? []) {
      const share = SERIES_KINDS.get(r.kind)
      if (!share || r.malId === s.malId || exclude.has(r.malId)) continue
      let e = byId.get(r.malId)
      if (!e) {
        if (added >= SERIES_LIMIT) continue
        e = { malId: r.malId, recScore: 0, from: [] }
        byId.set(r.malId, e)
        added += 1
      }
      const cur = e.series ? e.series.weight * (SERIES_KINDS.get(e.seriesKind ?? '') ?? 0) : 0
      if (s.weight * share > cur) {
        e.series = s
        e.seriesKind = r.kind
      }
    }
  }
  return [...byId.values()]
}

// シリーズ作の上乗せ（addSeries の印から）。外伝のうち1話の短いものは0
export function seriesBonus(entry: PoolEntry, m: Media): number {
  if (!entry.series) return 0
  const share = SERIES_KINDS.get(entry.seriesKind ?? '') ?? 0
  if (entry.seriesKind === 'side_story' && m.duration && m.duration < SHORT_MINUTES) return 0
  return SERIES_BONUS * Math.min(1, entry.series.weight / 2) * share
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
      score: r.rec / maxRec + 0.6 * (r.content / maxContent) + seriesBonus(r.entry, r.media),
      reasons: explain(r.media, r.entry, profile, r.sequel),
    }))
    .sort((a, b) => b.score - a.score)
}

// Shikimori（MyAnimeList と同じ分類）のジャンル・テーマ・対象層の日本語。無いものは英語のまま出す（genreName）
// 日本語の画面だけで使う表なので、右の日本語は訳さない（i18n-ok）。英語の画面では、Shikimori の英語名をそのまま出す
export const GENRE_JA: Record<string, string> = {
  // ジャンル
  Action: 'アクション', // i18n-ok
  Adventure: '冒険', // i18n-ok
  'Avant Garde': '前衛的', // i18n-ok
  'Boys Love': 'BL',
  Comedy: 'コメディ', // i18n-ok
  Drama: 'ドラマ', // i18n-ok
  Ecchi: 'お色気', // i18n-ok
  Erotica: 'エロティカ', // i18n-ok
  Fantasy: 'ファンタジー', // i18n-ok
  'Girls Love': '百合', // i18n-ok
  Gourmet: 'グルメ', // i18n-ok
  Hentai: 'ヘンタイ', // i18n-ok
  Horror: 'ホラー', // i18n-ok
  Mystery: 'ミステリー', // i18n-ok
  Romance: '恋愛', // i18n-ok
  'Sci-Fi': 'SF',
  'Slice of Life': '日常', // i18n-ok
  Sports: 'スポーツ', // i18n-ok
  Supernatural: '超常', // i18n-ok
  Suspense: 'サスペンス', // i18n-ok
  Yaoi: 'ヤオイ', // i18n-ok
  Yuri: '百合', // i18n-ok
  // テーマ
  'Adult Cast': '大人のキャスト', // i18n-ok
  Anthropomorphic: '擬人化', // i18n-ok
  'Award Winning': '受賞作', // i18n-ok
  CGDCT: '日常系（美少女）', // i18n-ok
  Childcare: '育児', // i18n-ok
  'Combat Sports': '格闘技', // i18n-ok
  Crossdressing: '女装・男装', // i18n-ok
  Delinquents: '不良', // i18n-ok
  Detective: '探偵', // i18n-ok
  Educational: '教育', // i18n-ok
  'Gag Humor': 'ギャグ', // i18n-ok
  Gore: 'グロ', // i18n-ok
  Harem: 'ハーレム', // i18n-ok
  'High Stakes Game': '駆け引き・頭脳戦', // i18n-ok
  Historical: '歴史', // i18n-ok
  'Idols (Female)': 'アイドル（女性）', // i18n-ok
  'Idols (Male)': 'アイドル（男性）', // i18n-ok
  Isekai: '異世界', // i18n-ok
  Iyashikei: '癒し系', // i18n-ok
  'Love Polygon': '多角関係', // i18n-ok
  'Love Status Quo': '進展しない恋愛', // i18n-ok
  'Magical Sex Shift': '性別が変わる', // i18n-ok
  'Mahou Shoujo': '魔法少女', // i18n-ok
  'Martial Arts': '武術', // i18n-ok
  Mecha: 'ロボット', // i18n-ok
  Medical: '医療', // i18n-ok
  Military: '軍事', // i18n-ok
  Music: '音楽', // i18n-ok
  Mythology: '神話', // i18n-ok
  'Organized Crime': '犯罪組織', // i18n-ok
  'Otaku Culture': 'オタク文化', // i18n-ok
  Parody: 'パロディ', // i18n-ok
  'Performing Arts': '舞台芸術', // i18n-ok
  Pets: 'ペット', // i18n-ok
  Psychological: 'サイコ', // i18n-ok
  Racing: 'レース', // i18n-ok
  Reincarnation: '転生', // i18n-ok
  'Reverse Harem': '逆ハーレム', // i18n-ok
  Samurai: '侍', // i18n-ok
  School: '学園', // i18n-ok
  Showbiz: '芸能界', // i18n-ok
  Space: '宇宙', // i18n-ok
  'Strategy Game': '戦略ゲーム', // i18n-ok
  'Super Power': '超能力', // i18n-ok
  Survival: 'サバイバル', // i18n-ok
  'Team Sports': 'チームスポーツ', // i18n-ok
  'Time Travel': 'タイムトラベル', // i18n-ok
  'Urban Fantasy': '現代ファンタジー', // i18n-ok
  Vampire: '吸血鬼', // i18n-ok
  Villainess: '悪役令嬢', // i18n-ok
  'Video Game': 'ゲーム', // i18n-ok
  'Visual Arts': '美術', // i18n-ok
  Workplace: '職場', // i18n-ok
  // 対象層
  Josei: '女性向け', // i18n-ok
  Kids: '子ども向け', // i18n-ok
  Seinen: '青年向け', // i18n-ok
  Shoujo: '少女向け', // i18n-ok
  Shounen: '少年向け', // i18n-ok
}

export function genreName(g: string): string {
  return getLang() === 'en' ? g : (GENRE_JA[g] ?? g)
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
  // 日本語は助詞でつなぐ文、英語は語順の違う文なので、言語ごとに文を組み立てる（断片ごとに訳さない）
  const list = (names: readonly string[]) => names.map(genreName).join(t('・', ', '))
  // 好きな作品のシリーズ作は、それを一番に書く（前作を見ていることも、これで分かる）
  if (entry.series) {
    const title = t(`『${entry.series.title}』`, `“${workTitle(entry.series)}”`)
    reasons.push(t(`好きな${title}のシリーズ作品`, `From the same series as ${title}, which you liked`))
  }
  const from = [...entry.from].sort((a, b) => b.weight - a.weight).slice(0, 2)
  if (from.length) {
    const titles = from.map((s) => t(`『${s.title}』`, `“${workTitle(s)}”`))
    reasons.push(t(`${titles.join('')}が好きな人のおすすめ`, `Recommended for fans of ${titles.join(' and ')}`))
  }
  const genres = likedNames(m.genres, 'g', profile, 2)
  if (genres.length) reasons.push(t(`好きなジャンル: ${list(genres)}`, `${genres.length === 1 ? 'Genre' : 'Genres'} you like: ${list(genres)}`))
  const themes = likedNames(m.themes, 't', profile, 2)
  if (themes.length) reasons.push(t(`好きなテーマ: ${list(themes)}`, `${themes.length === 1 ? 'Theme' : 'Themes'} you like: ${list(themes)}`))
  const studio = m.studios.find((s) => (profile.get(`s:${s}`) ?? 0) > 0.3)
  if (studio) reasons.push(t(`好きな制作会社: ${studio}`, `Studio you like: ${studio}`))
  if (sequel && !entry.series) reasons.push(t('前作を見ています', 'You’ve seen the prequel'))
  return reasons
}
