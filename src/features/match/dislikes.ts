import { t } from '../../lib/i18n'
import type { Media } from '../../lib/shikimori'
import { KNOWN_STUDIOS, studioKey } from '../../lib/studios'
import { GENRE_JA } from './taste'

// マッチングで除く苦手な項目。利用者が選んで宣言し、当たる作品は候補から完全に除く（点数を下げるだけにはしない）。
// - 項目: Shikimori のジャンル・テーマ・対象層を束ねたもの（作品ごとに付け方が揺れるので、近いものを1つにまとめる）と、1話の長さ・話数
// - ジャンル: 束ねた項目に無いものを、利用者が Shikimori のジャンル・テーマ・対象層から1つずつ足す
// - 制作会社・人物: 名指しで除く。制作会社は作品の制作会社と、人物は Shikimori の人物の参加作品（声の出演とスタッフ）と突き合わせる
// 取り消しは項目を消さずに active: false で残す（消すと、他の端末の控えと合わせたときに復活する。passes.ts と同じ）

export type TopicId =
  | 'ecchi'
  | 'harem'
  | 'isekai'
  | 'horror'
  | 'romance'
  | 'daily'
  | 'female'
  | 'blgl'
  | 'sports'
  | 'mecha'
  | 'idol'
  | 'history'
  | 'kids'
  | 'short'
  | 'long'

// loss: 外すと評判の高い作品（Shikimori の TV の人気上位1000件のうち8点以上）のうち、一緒に外れる割合（%）。巻き添えの大きさとして画面に添える。
// scripts/dislike_collateral.py で数えた（2026-10-29）。項目の定義を変えたら、あちらも直して数え直す。
// お色気に年齢区分 r_plus は使わない（MONSTER・カウボーイビバップ・ダンジョン飯なども入る。下調べ docs/research/reports/苦手な項目として除けるデータ.md）
export const DISLIKE_TOPICS: readonly { id: TopicId; readonly label: string; names?: readonly string[]; test?: (m: Media) => boolean; loss: number }[] = [
  { id: 'ecchi', get label() { return t('お色気', 'Ecchi') }, names: ['Ecchi'], loss: 2.8 },
  { id: 'harem', get label() { return t('ハーレム', 'Harem') }, names: ['Harem', 'Reverse Harem'], loss: 0.6 },
  { id: 'isekai', get label() { return t('異世界・転生', 'Isekai / Reincarnation') }, names: ['Isekai', 'Reincarnation', 'Villainess'], loss: 8.4 },
  { id: 'horror', get label() { return t('ホラー・グロ', 'Horror / Gore') }, names: ['Horror', 'Gore'], loss: 6.5 },
  { id: 'romance', get label() { return t('恋愛', 'Romance') }, names: ['Romance', 'Love Polygon', 'Love Status Quo'], loss: 19.3 },
  { id: 'daily', get label() { return t('日常', 'Slice of life') }, names: ['Slice of Life', 'CGDCT', 'Iyashikei'], loss: 5.6 },
  { id: 'female', get label() { return t('女性向け', 'Shoujo / Josei') }, names: ['Shoujo', 'Josei'], loss: 7.8 },
  { id: 'blgl', get label() { return t('BL・GL', 'Boys Love / Girls Love') }, names: ['Boys Love', 'Girls Love', 'Yaoi', 'Yuri'], loss: 1.2 },
  { id: 'sports', get label() { return t('スポーツ', 'Sports') }, names: ['Sports', 'Team Sports', 'Combat Sports'], loss: 6.8 },
  { id: 'mecha', get label() { return t('ロボット', 'Mecha') }, names: ['Mecha'], loss: 3.1 },
  { id: 'idol', get label() { return t('アイドル', 'Idols') }, names: ['Idols (Female)', 'Idols (Male)'], loss: 0 },
  { id: 'history', get label() { return t('歴史・時代劇', 'Historical') }, names: ['Historical', 'Samurai'], loss: 11.2 },
  { id: 'kids', get label() { return t('子ども向け', 'Kids') }, names: ['Kids'], loss: 0 },
  // 1話の長さ・話数が分からない作品（0）は当てない
  { id: 'short', get label() { return t('短い作品（1話15分未満）', 'Short episodes (under 15 min)') }, test: (m) => (m.duration ?? 0) > 0 && (m.duration ?? 0) < 15, loss: 0.3 },
  {
    id: 'long',
    get label() { return t('長い作品（40話以上）', 'Long series (40+ episodes)') },
    test: (m) => Math.max(m.episodes ?? 0, m.episodesAired ?? 0) >= 40,
    loss: 9.0,
  },
]

const TOPIC_IDS: ReadonlySet<string> = new Set(DISLIKE_TOPICS.map((d) => d.id))

// 1つずつ足すジャンルの巻き添え（%。項目の loss と同じ数え方。scripts/dislike_collateral.py の GENRE_LOSS を写した。2026-10-29）。
// 人気上位1000件に1作も無いものは載せていない（0 として出す）
const GENRE_LOSS: Record<string, number> = {
  Action: 37.3, 'Adult Cast': 13.4, Adventure: 24.2, Anthropomorphic: 0.6, 'Avant Garde': 0.6, 'Boys Love': 0.0, CGDCT: 1.9, Childcare: 2.5,
  'Combat Sports': 0.9, Comedy: 28.6, Crossdressing: 0.6, Delinquents: 0.9, Detective: 2.8, Drama: 31.1, Ecchi: 2.8, Educational: 0.0, Fantasy: 22.7,
  'Gag Humor': 4.3, 'Girls Love': 0.0, Gore: 5.6, Gourmet: 0.9, Harem: 0.3, 'High Stakes Game': 0.6, Historical: 11.2, Horror: 2.2,
  'Idols (Female)': 0.0, Isekai: 7.1, Iyashikei: 3.7, Josei: 2.2, Kids: 0.0, 'Love Polygon': 4.3, 'Love Status Quo': 0.6, 'Magical Sex Shift': 0.0,
  'Mahou Shoujo': 0.9, 'Martial Arts': 1.9, Mecha: 3.1, Medical: 0.6, Military: 5.6, Music: 3.7, Mystery: 15.2, Mythology: 4.0,
  'Organized Crime': 5.0, 'Otaku Culture': 2.5, Parody: 3.1, 'Performing Arts': 1.9, Pets: 0.0, Psychological: 9.6, Racing: 0.6, Reincarnation: 5.3,
  'Reverse Harem': 0.3, Romance: 18.9, Samurai: 3.4, School: 24.8, 'Sci-Fi': 10.9, Seinen: 15.5, Shoujo: 5.6, Shounen: 39.8, Showbiz: 1.6,
  'Slice of Life': 4.3, Space: 1.2, Sports: 6.8, 'Strategy Game': 1.9, 'Super Power': 8.1, Supernatural: 17.4, Survival: 2.5, Suspense: 12.4,
  'Team Sports': 4.3, 'Time Travel': 3.7, 'Urban Fantasy': 4.3, Vampire: 2.2, 'Video Game': 0.6, Villainess: 0.0, 'Visual Arts': 0.6, Workplace: 0.9,
  Yaoi: 1.2, Yuri: 0.0,
}

// 1つずつ足せるジャンル（GENRE_JA にある名前）。成人向け（アプリの候補に出ない）と、中身の手がかりにならない「受賞作」は除く。
// キーは英数字の形（genre:sliceoflife）。保存のキーに空白や括弧を入れないため
export const DISLIKE_GENRES: readonly { key: string; name: string; loss: number }[] = Object.keys(GENRE_JA)
  .filter((name) => !['Hentai', 'Erotica', 'Award Winning'].includes(name))
  .map((name) => ({ key: `genre:${studioKey(name)}`, name, loss: GENRE_LOSS[name] ?? 0 }))

const GENRE_BY_KEY: ReadonlyMap<string, string> = new Map(DISLIKE_GENRES.map((g) => [g.key, g.name]))

// そのジャンルを含む束ねた項目（選んでいれば、ジャンルを1つずつ足す必要はない）
export function topicOfGenre(name: string): (typeof DISLIKE_TOPICS)[number] | undefined {
  return DISLIKE_TOPICS.find((d) => d.names?.includes(name))
}

// Annict の団体を、候補の作品の制作会社と突き合わせられる形にする。名の知れた会社なら Shikimori の ID、
// それ以外は英語名（無ければ英字だけの名前）の照合の形。どちらも無ければ null（和名だけの団体は結べない）
export function studioTarget(org: { annictId: number; name: string; nameEn: string | null }): { id: string; shikimoriId?: number; nameKey?: string } | null {
  const known = KNOWN_STUDIOS.find((s) => s.annictId === org.annictId)
  if (known) return { id: `studio:${known.shikimoriId}`, shikimoriId: known.shikimoriId }
  const ascii = /^[\x20-\x7e]+$/.test(org.name) ? org.name : ''
  const key = studioKey(org.nameEn || ascii)
  return key ? { id: `studio:n:${key}`, nameKey: key } : null
}

export interface DislikeEntry {
  at: string
  active: boolean
  // 画面に出す名前（制作会社・人物だけ。選んだときの名前）
  name?: string
}

// キー: topic:<項目>・genre:<ジャンルの英数字の形>・studio:<Shikimori の制作会社の ID>・studio:n:<英語名の照合の形>・person:<Shikimori の人物の ID>
export type Dislikes = Map<string, DislikeEntry>

const KEY_RE = /^(topic:[a-z]+|genre:[a-z0-9]{1,40}|studio:\d{1,9}|studio:n:[a-z0-9]{1,80}|person:\d{1,9})$/
const MAX_NAME = 100

export function parseDislikes(value: unknown): Dislikes {
  const out: Dislikes = new Map()
  if (!value || typeof value !== 'object') return out
  const items = (value as { items?: unknown }).items
  if (!items || typeof items !== 'object' || Array.isArray(items)) return out
  for (const [k, v] of Object.entries(items as Record<string, unknown>)) {
    if (!KEY_RE.test(k) || (k.startsWith('topic:') && !TOPIC_IDS.has(k.slice(6))) || (k.startsWith('genre:') && !GENRE_BY_KEY.has(k)) || !v || typeof v !== 'object') continue
    const { at, active, name } = v as Record<string, unknown>
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) continue
    const entry: DislikeEntry = { at, active: active !== false }
    if (typeof name === 'string' && name.trim()) entry.name = name.trim().slice(0, MAX_NAME)
    out.set(k, entry)
  }
  return out
}

export function serializeDislikes(d: Dislikes): { version: 1; items: Record<string, DislikeEntry> } {
  const sorted = [...d].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return { version: 1, items: Object.fromEntries(sorted.map(([k, v]) => [k, v.name ? { at: v.at, active: v.active, name: v.name } : { at: v.at, active: v.active }])) }
}

// 同じ項目は、新しく操作した方を採る
export function mergeDislikes(a: Dislikes, b: Dislikes): Dislikes {
  const out: Dislikes = new Map(a)
  for (const [k, v] of b) {
    const cur = out.get(k)
    if (!cur || Date.parse(v.at) > Date.parse(cur.at)) out.set(k, v)
  }
  return out
}

export function sameDislikes(a: Dislikes, b: Dislikes): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    const w = b.get(k)
    if (!w || w.at !== v.at || w.active !== v.active || w.name !== v.name) return false
  }
  return true
}

export function activeKeys(d: Dislikes): string[] {
  return [...d].filter(([, v]) => v.active).map(([k]) => k)
}

export function activePeople(d: Dislikes): { id: number; name: string }[] {
  return [...d].flatMap(([k, v]) => (v.active && k.startsWith('person:') ? [{ id: Number(k.slice(7)), name: v.name ?? k }] : []))
}

// 候補の作品が、選んだ項目・ジャンル・制作会社に当たるか（人物は参加作品の ID で、候補を集める前に除く）
export function makeDislikeTest(d: Dislikes): ((m: Media) => boolean) | null {
  const keys = activeKeys(d)
  const topics = DISLIKE_TOPICS.filter((x) => keys.includes(`topic:${x.id}`))
  const names = new Set([...topics.flatMap((x) => x.names ?? []), ...keys.flatMap((k) => GENRE_BY_KEY.get(k) ?? [])])
  const tests = topics.flatMap((x) => (x.test ? [x.test] : []))
  const studioIds = new Set(keys.flatMap((k) => (/^studio:\d+$/.test(k) ? [Number(k.slice(7))] : [])))
  // 名の知れた会社は、制作会社の ID が無い作品にも当たるよう英語名でも照らす
  const studioKeys = new Set([
    ...keys.flatMap((k) => (k.startsWith('studio:n:') ? [k.slice(9)] : [])),
    ...KNOWN_STUDIOS.filter((s) => studioIds.has(s.shikimoriId)).map((s) => studioKey(s.en)),
  ])
  if (names.size === 0 && tests.length === 0 && studioIds.size === 0 && studioKeys.size === 0) return null
  return (m) =>
    [...m.genres, ...m.themes, ...m.demographics].some((g) => names.has(g)) ||
    tests.some((test) => test(m)) ||
    (m.studioRefs ?? []).some((s) => studioIds.has(s.id)) ||
    m.studios.some((s) => studioKeys.has(studioKey(s)))
}
