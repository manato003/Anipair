import { getLang, t } from './i18n'

// 作品名・人名・話の番号・役職を、いまの言語で出す（英語対応の第3段。2026-10-20 利用者）。
// 英語の作品名は、Annict の titleEn（ほとんどがローマ字の題名。MyAnimeList の正式な題名と同じ形）と、Shikimori の name（同じくローマ字）。
// 公式の英題（Shikimori の english）より、どの画面でも同じ名前で出せるローマ字を先に使う（一覧と詳細で名前が変わらないように）。
// 英語名が無ければ日本語のまま。照合・検索・保存には、これまでどおり日本語の title を使う（ここは表示だけ）
const en = () => getLang() === 'en'
const filled = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== ''

// Annict の作品（title と titleEn）
export function workTitle(w: { title: string; titleEn?: string | null }): string {
  return en() && filled(w.titleEn) ? w.titleEn : w.title
}

// Shikimori の作品（native = 日本語、romaji = ローマ字、english = 公式の英題）
export function shikiTitle(title: { native: string | null; romaji: string | null; english: string | null }, fallback = ''): string {
  const order = en() ? [title.romaji, title.english, title.native] : [title.native, title.romaji, title.english]
  return order.find(filled) ?? fallback
}

// Annict の人物・キャラクター・団体（name と nameEn）
export function personName(p: { name: string; nameEn?: string | null }): string {
  return en() && filled(p.nameEn) ? p.nameEn : p.name
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
