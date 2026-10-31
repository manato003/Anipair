import type { Season } from '../../lib/season'

// ログイン前の紹介ページ（Landing.tsx）のデモに使う作品。配るのは MyAnimeList の ID の並びだけで、
// 題名・表紙・ジャンル・似た作品は /api/shiki から後で受け取る（Annict の API は呼ばない。API利用規約 第6条）。
// 選び方: Shikimori に日本語の題名とポスターがある・Annict にも作品がある・季節とジャンルが偏らない。
// 中継で題名とポスターがあることを確かめた（2026-10-31）。入れ替えたら、同じように確かめる
export interface DemoShelf {
  season: Season
  ids: readonly number[]
}

export const DEMO_SHELVES: readonly DemoShelf[] = [
  {
    season: { year: 2023, name: 'autumn' },
    // 葬送のフリーレン・薬屋のひとりごと・SPY×FAMILY Season 2・陰の実力者になりたくて！2nd・シャングリラ・フロンティア・Dr.STONE NEW WORLD 第2クール・
    // ゴブリンスレイヤーII・アンデッドアンラック・東京リベンジャーズ 天竺編・鴨乃橋ロンの禁断推理・ひきこまり吸血姫の悶々・はめつのおうこく
    ids: [52991, 54492, 53887, 54595, 52347, 55644, 47160, 52741, 54918, 53879, 54103, 54362],
  },
  {
    season: { year: 2022, name: 'autumn' },
    // ぼっち・ざ・ろっく！・チェンソーマン・機動戦士ガンダム 水星の魔女・モブサイコ100 III・SPY×FAMILY 第2クール・ブルーロック・
    // BLEACH 千年血戦篇・うる星やつら・不滅のあなたへ Season2・僕のヒーローアカデミア 6期・アキバ冥途戦争・転生したら剣でした
    ids: [47917, 44511, 49828, 50172, 50602, 49596, 41467, 50710, 49709, 49918, 52193, 49891],
  },
  {
    season: { year: 2018, name: 'winter' },
    // ヴァイオレット・エヴァーガーデン・宇宙よりも遠い場所・ゆるキャン△・ダーリン・イン・ザ・フランキス・からかい上手の高木さん・ポプテピピック・
    // りゅうおうのおしごと！・恋は雨上がりのように・刻刻・オーバーロードII・斉木楠雄のΨ難 2・学園ベビーシッターズ
    ids: [33352, 35839, 34798, 35849, 35860, 35330, 35905, 34984, 36548, 35073, 34612, 35222],
  },
]

// 評価のカードに出す順。棚から1作品ずつ交互に（よく知られた作品から）
export const DEMO_QUEUE: readonly number[] = [52991, 47917, 33352, 54492, 44511, 35839, 53887, 49828, 34798, 52347, 50172, 35860]

// 「おまかせで答える」の答え（評価のカードの順の先頭から）
export const DEMO_SAMPLE: ReadonlyMap<number, DemoAnswer> = new Map([
  [52991, 'GREAT'],
  [47917, 'GREAT'],
  [33352, 'GOOD'],
  [54492, 'GOOD'],
  [44511, 'AVERAGE'],
  [35839, 'GREAT'],
  [53887, 'WANNA'],
  [49828, 'BAD'],
])

// デモの答え。評価4つ・覚えてない（評価なしで見た）・見たい・見てない
export type DemoAnswer = 'GREAT' | 'GOOD' | 'AVERAGE' | 'BAD' | 'NONE' | 'WANNA' | 'SKIP'

export const DEMO_IDS: readonly number[] = DEMO_SHELVES.flatMap((s) => s.ids)
