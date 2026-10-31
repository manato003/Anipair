import { getLang } from './i18n'

// 制作会社の名前。Shikimori の制作会社は英語名なので、名の知れた会社は日本語の画面で日本語名に替える。
// 表は、マッチングの苦手な項目（名指しで除く会社のチップ）と、記録・ブラウズの絞り込みのチップ（先に出す会社）で使う

// 名の知れた制作会社（Annict でお気に入りの多い順。2026-10-29）。チップで出し、Annict の団体の検索で選んだときもここにあれば Shikimori の ID で結ぶ。
// Shikimori の ID は、Shikimori の制作会社の一覧と名前で照らして確かめた（和名だけの会社〈スタジオジブリ・カラーなど〉は手で照らした）
export const KNOWN_STUDIOS: readonly { annictId: number; shikimoriId: number; ja: string; en: string }[] = [
  { annictId: 74, shikimoriId: 2, ja: '京都アニメーション', en: 'Kyoto Animation' },
  { annictId: 3, shikimoriId: 132, ja: 'P.A.WORKS', en: 'P.A. Works' },
  { annictId: 25, shikimoriId: 56, ja: 'A-1 Pictures', en: 'A-1 Pictures' },
  { annictId: 45, shikimoriId: 95, ja: '動画工房', en: 'Doga Kobo' },
  { annictId: 944, shikimoriId: 1835, ja: 'CloverWorks', en: 'CloverWorks' },
  { annictId: 402, shikimoriId: 44, ja: 'シャフト', en: 'Shaft' },
  { annictId: 206, shikimoriId: 569, ja: 'MAPPA', en: 'MAPPA' },
  { annictId: 383, shikimoriId: 803, ja: 'TRIGGER', en: 'Trigger' },
  { annictId: 91, shikimoriId: 43, ja: 'ufotable', en: 'ufotable' },
  { annictId: 18, shikimoriId: 11, ja: 'マッドハウス', en: 'Madhouse' },
  { annictId: 7, shikimoriId: 10, ja: 'Production I.G', en: 'Production I.G' },
  { annictId: 9, shikimoriId: 7, ja: 'J.C.STAFF', en: 'J.C.Staff' },
  { annictId: 11, shikimoriId: 4, ja: 'ボンズ', en: 'Bones' },
  { annictId: 179, shikimoriId: 858, ja: 'WIT STUDIO', en: 'Wit Studio' },
  { annictId: 82, shikimoriId: 300, ja: 'SILVER LINK.', en: 'SILVER LINK.' },
  { annictId: 1333, shikimoriId: 1993, ja: 'スタジオバインド', en: 'Studio Bind' },
  { annictId: 101, shikimoriId: 314, ja: 'WHITE FOX', en: 'White Fox' },
  { annictId: 31, shikimoriId: 91, ja: 'feel.', en: 'feel.' },
  { annictId: 135, shikimoriId: 290, ja: 'キネマシトラス', en: 'Kinema Citrus' },
  { annictId: 29, shikimoriId: 14, ja: 'サンライズ', en: 'Sunrise' },
  { annictId: 337, shikimoriId: 21, ja: 'スタジオジブリ', en: 'Studio Ghibli' },
  { annictId: 75, shikimoriId: 418, ja: 'Studio五組', en: 'Studio Gokumi' },
  { annictId: 32, shikimoriId: 441, ja: 'エイトビット', en: '8bit' },
  { annictId: 706, shikimoriId: 1591, ja: 'サイエンスSARU', en: 'Science SARU' },
  { annictId: 164, shikimoriId: 439, ja: 'project No.9', en: 'Project No.9' },
  { annictId: 631, shikimoriId: 47, ja: 'カラー', en: 'Khara' },
  { annictId: 229, shikimoriId: 911, ja: 'パッショーネ', en: 'Passione' },
  { annictId: 83, shikimoriId: 605, ja: 'C2C', en: 'C2C' },
  { annictId: 435, shikimoriId: 456, ja: 'Lerche', en: 'Lerche' },
  { annictId: 26, shikimoriId: 37, ja: 'スタジオディーン', en: 'Studio Deen' },
  { annictId: 22, shikimoriId: 247, ja: 'シンエイ動画', en: 'Shin-Ei Animation' },
  { annictId: 49, shikimoriId: 18, ja: '東映アニメーション', en: 'Toei Animation' },
  { annictId: 376, shikimoriId: 839, ja: 'ライデンフィルム', en: 'LIDENFILMS' },
  { annictId: 55, shikimoriId: 287, ja: 'david production', en: 'David Production' },
  { annictId: 52, shikimoriId: 73, ja: 'トムス・エンタテインメント', en: 'TMS Entertainment' },
  { annictId: 96, shikimoriId: 1, ja: 'studioぴえろ', en: 'Studio Pierrot' },
  { annictId: 23, shikimoriId: 41, ja: 'サテライト', en: 'Satelight' },
  { annictId: 12, shikimoriId: 28, ja: 'OLM', en: 'OLM' },
  { annictId: 394, shikimoriId: 1127, ja: 'Studio 3Hz', en: 'Studio 3Hz' },
  { annictId: 1, shikimoriId: 3, ja: 'GONZO', en: 'Gonzo' },
]

// 制作会社の名前の照合に使う形（英数字だけ。Annict の「StudioBind」と Shikimori の「Studio Bind」を同じにする）
export function studioKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '')
}


// 表に無いが、日本語名で出したい会社（サンライズの今の名前。Tier表の「サンライズ」もこの名前の作品を含める）
const EXTRA_JA: Record<string, string> = { [studioKey('Bandai Namco Filmworks')]: 'バンダイナムコフィルムワークス' } // i18n-ok

const JA_BY_KEY = new Map<string, string>([...KNOWN_STUDIOS.map((s): [string, string] => [studioKey(s.en), s.ja]), ...Object.entries(EXTRA_JA)])
const KNOWN_KEYS: ReadonlySet<string> = new Set(KNOWN_STUDIOS.map((s) => studioKey(s.en)))

// 画面に出す名前。英語の画面と、表に無い会社は Shikimori の英語名のまま
export function studioName(name: string): string {
  return getLang() === 'en' ? name : (JA_BY_KEY.get(studioKey(name)) ?? name)
}

export function isKnownStudio(name: string): boolean {
  return KNOWN_KEYS.has(studioKey(name))
}

// 絞り込みのチップ。名の知れた会社を先に（並びは元のまま＝作品の多い順）、ほかは畳む（first より後ろ）
export function studioChips(list: readonly { name: string; count: number }[]): { items: { id: string; label: string; count: number }[]; first: number } {
  const known = list.filter((s) => isKnownStudio(s.name))
  const rest = list.filter((s) => !isKnownStudio(s.name))
  return { items: [...known, ...rest].map((s) => ({ id: s.name, label: studioName(s.name), count: s.count })), first: known.length }
}
