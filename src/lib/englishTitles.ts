// 作品の公式の英題（Shikimori の english）を、MyAnimeList の ID ごとに覚えておく（英語の画面の作品名。lib/names.ts の workTitle）。
// 英語圏で配信を見ている人には、ローマ字の題名（Kusuriya no Hitorigoto）より公式の英題（The Apothecary Diaries）の方が通じる（2026-10-20 利用者）。
// 表紙を取るために Shikimori の作品データはもう読んでいるので、そこに入っている英題を控えるだけにする（問い合わせは増やさない）。
// 次に開いたとき、表紙を読み終える前から英題で出せるように、端末にも残す（利用者の記録ではないので、持ち主ごとには分けない）
const KEY = 'animax.titleEn.v1'
// 端末に残す数の上限（新しく覚えた順に残す）
const MAX = 3000

let titles: Map<number, string> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function load(): Map<number, string> {
  if (titles) return titles
  titles = new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [id, title] of Object.entries(raw as Record<string, unknown>)) {
        const n = Number(id)
        if (Number.isInteger(n) && n > 0 && typeof title === 'string' && title.trim()) titles.set(n, title)
      }
    }
  } catch {
    // 読めない・壊れているときは、空から覚え直す
  }
  return titles
}

function scheduleSave(): void {
  if (saveTimer !== null) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    const all = [...load()]
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(all.slice(-MAX))))
    } catch {
      // 保存できない環境では、この起動のあいだだけ覚える
    }
  }, 1000)
}

// Shikimori から読んだ作品の英題を覚える（無ければ何もしない）
export function noteEnglishTitle(malId: number, english: string | null | undefined): void {
  if (!Number.isInteger(malId) || malId <= 0 || typeof english !== 'string' || !english.trim()) return
  const map = load()
  if (map.get(malId) === english) return
  map.delete(malId)
  map.set(malId, english)
  scheduleSave()
}

export function englishTitleOf(malId: number | string | null | undefined): string | null {
  const n = typeof malId === 'string' ? Number(malId) : malId
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) return null
  return load().get(n) ?? null
}

// テスト用: 覚えた英題を捨てる
export function resetEnglishTitlesForTests(): void {
  titles = new Map()
}
