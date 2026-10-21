import { persistedMap } from './persistedMap'

// 作品の公式の英題（Shikimori の english）を、MyAnimeList の ID ごとに覚えておく（英語の画面の作品名。lib/names.ts の workTitle）。
// 英語圏で配信を見ている人には、ローマ字の題名（Kusuriya no Hitorigoto）より公式の英題（The Apothecary Diaries）の方が通じる（2026-10-20 利用者）。
// 表紙を取るために Shikimori の作品データはもう読んでいるので、そこに入っている英題を控えるだけにする（問い合わせは増やさない）。
// 次に開いたとき、表紙を読み終える前から英題で出せるように、端末にも残す（利用者の記録ではないので、持ち主ごとには分けない）。
// MyAnimeList の ID → 英題。端末に残す数の上限は 3000（新しく覚えた順に残す。lib/persistedMap.ts）
const titles = persistedMap<string>('titleEn', 3000, (v) => (typeof v === 'string' && v.trim() ? v : null))

// Shikimori から読んだ作品の英題を覚える（無ければ何もしない）
export function noteEnglishTitle(malId: number, english: string | null | undefined): void {
  if (!Number.isInteger(malId) || malId <= 0 || typeof english !== 'string' || !english.trim()) return
  if (titles.get(String(malId)) === english) return
  titles.set(String(malId), english)
}

export function englishTitleOf(malId: number | string | null | undefined): string | null {
  const n = typeof malId === 'string' ? Number(malId) : malId
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return null
  return titles.get(String(n)) ?? null
}

// テスト用: 覚えた英題を捨てる
export function resetEnglishTitlesForTests(): void {
  titles.reset()
}
