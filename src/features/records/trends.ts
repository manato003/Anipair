import type { LibraryEntry, RatingState } from '../../lib/annict'
import { GENRE_JA } from '../match/taste'

// 好みの傾向（記録ページの「傾向」）。すべて純粋な関数

export interface Distribution {
  // 総合評価ごとの件数（評価は付いているが「見た」以外の状態の作品も数える）
  ratings: Record<RatingState, number>
  // 見たが評価を付けていない
  watchedUnrated: number
  // 評価の件数の合計
  rated: number
}

// ライブラリの作品について、総合評価の分布を数える。ライブラリに無い作品の評価は数えない
export function ratingDistribution(library: readonly LibraryEntry[], ratings: ReadonlyMap<number, RatingState>): Distribution {
  const counts: Record<RatingState, number> = { GREAT: 0, GOOD: 0, AVERAGE: 0, BAD: 0 }
  let watchedUnrated = 0
  for (const e of library) {
    const r = ratings.get(e.annictId)
    if (r) counts[r]++
    else if (e.state === 'WATCHED') watchedUnrated++
  }
  return { ratings: counts, watchedUnrated, rated: counts.GREAT + counts.GOOD + counts.AVERAGE + counts.BAD }
}

export interface Ranked {
  name: string
  weight: number
}

export interface Trends {
  genres: Ranked[]
  tags: Ranked[]
  studios: Ranked[]
  dislikedGenres: Ranked[]
  dislikedTags: Ranked[]
}

export const TOP_GENRES = 5
export const TOP_TAGS = 8
export const TOP_STUDIOS = 3
export const TOP_DISLIKED = 3

function pick(profile: ReadonlyMap<string, number>, prefix: 'g' | 't' | 's', sign: 1 | -1, limit: number): Ranked[] {
  const out: Ranked[] = []
  for (const [k, v] of profile) {
    if (!k.startsWith(`${prefix}:`) || v * sign <= 0) continue
    out.push({ name: k.slice(2), weight: v })
  }
  // 好きなものは重みの大きい順、苦手なものはもっとも負の大きい順。同点は名前順（毎回同じ並びにする）
  return out.sort((a, b) => (b.weight - a.weight) * sign || a.name.localeCompare(b.name)).slice(0, limit)
}

// 好み（ジャンル・タグ・制作会社の重み）から、好きなものの上位と、苦手なものの上位を取り出す
export function topTrends(profile: ReadonlyMap<string, number>): Trends {
  return {
    genres: pick(profile, 'g', 1, TOP_GENRES),
    tags: pick(profile, 't', 1, TOP_TAGS),
    studios: pick(profile, 's', 1, TOP_STUDIOS),
    dislikedGenres: pick(profile, 'g', -1, TOP_DISLIKED),
    dislikedTags: pick(profile, 't', -1, TOP_DISLIKED),
  }
}

// AniList のタグ名は英語。よく出るものだけ日本語にして、無いものは英語のまま出す
export const TAG_JA: Record<string, string> = {
  'Male Protagonist': '男性主人公',
  'Female Protagonist': '女性主人公',
  'Ensemble Cast': '群像劇',
  School: '学園',
  'Coming of Age': '成長',
  'Love Triangle': '三角関係',
  Magic: '魔法',
  Isekai: '異世界',
  Swordplay: '剣戟',
  'Super Power': '超能力',
  Tragedy: '悲劇',
  'Time Manipulation': '時間操作',
  Gore: 'グロ',
  Military: '軍事',
  War: '戦争',
  Mythology: '神話',
  'Post-Apocalyptic': '終末世界',
  Cyberpunk: 'サイバーパンク',
  Dystopian: 'ディストピア',
  Band: 'バンド',
  'Cute Girls Doing Cute Things': '日常系（美少女）',
  'Anti-Hero': 'アンチヒーロー',
  Superhero: 'ヒーロー',
  Space: '宇宙',
  Vampire: '吸血鬼',
  Youkai: '妖怪',
  Detective: '探偵',
  Survival: 'サバイバル',
  'Martial Arts': '武術',
  Historical: '歴史',
  Food: '料理',
  Iyashikei: '癒し系',
  Reincarnation: '転生',
  'Video Games': 'ゲーム',
  Politics: '政治',
  Conspiracy: '陰謀',
  Parody: 'パロディ',
  Robots: 'ロボット',
  Aliens: '宇宙人',
  Workplace: '職場',
  'Otaku Culture': 'オタク文化',
  Shounen: '少年向け',
  Seinen: '青年向け',
  Shoujo: '少女向け',
  Josei: '女性向け',
}

export function genreName(g: string): string {
  return GENRE_JA[g] ?? g
}

export function tagName(t: string): string {
  return TAG_JA[t] ?? t
}
