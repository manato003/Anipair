// 429（回数の制限）で待って送り直すときの共通の部品。Shikimori（shikimori.ts）と Annict（annict.ts）が使う

// 待つ時間を取り出す。Retry-After は秒数（日付の形は読まずに既定へ）。0 以上 cap 以下に収める
export function parseRetryAfter(header: string | null, defaultMs: number, capMs: number): number {
  const sec = header !== null && header.trim() !== '' ? Number(header) : NaN
  const ms = Number.isFinite(sec) && sec >= 0 ? sec * 1000 : defaultMs
  return Math.min(ms, capMs)
}

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
