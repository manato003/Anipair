import { getLang, t } from './i18n'
import { englishPersonOf } from './englishNames'
import { personKey } from './shikimori'
import { englishTitleOf } from './englishTitles'

// 作品名・人名・話の番号・役職を、いまの言語で出す。
// 英語の作品名は、公式の英題（Shikimori の english。The Apothecary Diaries など）があればそれ、無ければローマ字の題名
// （Annict の titleEn・Shikimori の name。Kusuriya no Hitorigoto など）。英語圏で配信を見ている人には公式の英題の方が通じる。
// Annict の作品の英題は、表紙を取るときに読んだ Shikimori の作品データから覚えたもの（lib/englishTitles.ts。MyAnimeList の ID で引く）。
// 英語名が無ければ日本語のまま。照合・検索・保存には、これまでどおり日本語の title を使う（ここは表示だけ）
const en = () => getLang() === 'en'
const filled = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== ''

// Annict の作品（title と titleEn。MyAnimeList の ID があれば公式の英題を引く）
export function workTitle(w: { title: string; titleEn?: string | null; malAnimeId?: string | null; malId?: number | null }): string {
  if (!en()) return w.title
  const official = englishTitleOf(w.malAnimeId ?? w.malId)
  if (filled(official)) return official
  return filled(w.titleEn) ? w.titleEn : w.title
}

// Shikimori の作品（native = 日本語、romaji = ローマ字、english = 公式の英題）
export function shikiTitle(title: { native: string | null; romaji: string | null; english: string | null }, fallback = ''): string {
  const order = en() ? [title.english, title.romaji, title.native] : [title.native, title.romaji, title.english]
  return order.find(filled) ?? fallback
}

// Annict の英語の表記は「Chihara, Minori」（姓, 名）と「Chika Anzai」（名 姓）が混ざっている。名 姓にそろえる
export function westernOrder(name: string): string {
  const m = name.match(/^([^,]+),\s*([^,]+)$/)
  return m ? `${m[2].trim()} ${m[1].trim()}` : name
}

// Annict の人物・団体（name と nameEn）。英語は Wikidata の英語名（lib/englishNames.ts）→ Annict の英語の表記 → 日本語
export function personName(p: { name: string; nameEn?: string | null }): string {
  if (!en()) return p.name
  const wikidata = englishPersonOf(p.name)
  if (filled(wikidata)) return wikidata
  return filled(p.nameEn) ? westernOrder(p.nameEn) : p.name
}

// キャラクター名。英語は Shikimori のローマ字の名前（日本語名で照合した表。lib/shikimori.ts の fetchCastNames）→ Annict の英語の表記 → 日本語
export function characterName(c: { name: string; nameEn?: string | null }, romaji?: ReadonlyMap<string, string> | null): string {
  if (!en()) return c.name
  const hit = romaji?.get(personKey(c.name))
  if (filled(hit)) return hit
  return filled(c.nameEn) ? westernOrder(c.nameEn) : c.name
}

// 話の番号。日本語は Annict の表記（「第6話」「#6」）。英語は番号から作る（Ep. 6）。番号が無ければ Annict の表記
export function episodeNumber(ep: { number: number | null; numberText: string | null }): string {
  if (en() && ep.number !== null) return `Ep. ${ep.number}`
  return ep.numberText ?? (ep.number !== null ? t(`第${ep.number}話`, `Ep. ${ep.number}`) : '')
}

// Annict のスタッフの役職（roleText は日本語の表記。表の鍵は Annict のデータと照合する語なので i18n-ok）。英語は、よく出る役職を表で直し、「その他」の役職は Annict の英語の表記（roleOtherEn）
const ROLES_EN: Record<string, string> = {
  原作: 'Original work', // i18n-ok
  原案: 'Original concept', // i18n-ok
  監督: 'Director', // i18n-ok
  総監督: 'Chief director', // i18n-ok
  シリーズ監督: 'Series director', // i18n-ok
  チーフディレクター: 'Chief director', // i18n-ok
  副監督: 'Assistant director', // i18n-ok
  助監督: 'Assistant director', // i18n-ok
  シリーズ構成: 'Series composition', // i18n-ok
  脚本: 'Screenplay', // i18n-ok
  キャラクターデザイン: 'Character design', // i18n-ok
  キャラクター原案: 'Original character design', // i18n-ok
  総作画監督: 'Chief animation director', // i18n-ok
  作画監督: 'Animation director', // i18n-ok
  アクション作画監督: 'Action animation director', // i18n-ok
  メカニックデザイン: 'Mechanical design', // i18n-ok
  プロップデザイン: 'Prop design', // i18n-ok
  美術監督: 'Art director', // i18n-ok
  美術設定: 'Art setting', // i18n-ok
  色彩設計: 'Color design', // i18n-ok
  撮影監督: 'Director of photography', // i18n-ok
  '3DCGディレクター': '3DCG director', // i18n-ok
  CGディレクター: 'CG director', // i18n-ok
  編集: 'Editing', // i18n-ok
  音響監督: 'Sound director', // i18n-ok
  音響効果: 'Sound effects', // i18n-ok
  音楽: 'Music', // i18n-ok
  音楽制作: 'Music production', // i18n-ok
  アニメーション制作: 'Animation production', // i18n-ok
  制作: 'Production', // i18n-ok
  製作: 'Production committee', // i18n-ok
  企画: 'Planning', // i18n-ok
  プロデューサー: 'Producer', // i18n-ok
  アニメーションプロデューサー: 'Animation producer', // i18n-ok
  チーフプロデューサー: 'Chief producer', // i18n-ok
  オープニングテーマ: 'Opening theme', // i18n-ok
  エンディングテーマ: 'Ending theme', // i18n-ok
  主題歌: 'Theme song', // i18n-ok
  絵コンテ: 'Storyboard', // i18n-ok
  演出: 'Episode director', // i18n-ok
  コンセプトアート: 'Concept art', // i18n-ok
  タイトルロゴ: 'Title logo', // i18n-ok
}

export function staffRole(role: string, roleOtherEn?: string | null): string {
  if (!en()) return role
  return ROLES_EN[role] ?? (filled(roleOtherEn) ? roleOtherEn : role)
}
