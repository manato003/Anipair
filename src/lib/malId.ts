// 作品の MyAnimeList の ID（Annict の malAnimeId は文字列）。無い・おかしいときは null。
// マッチングの候補・表紙・英題は MyAnimeList の ID でつなぐので、どの画面でもこれで読む
export function malIdOf(entry: { malAnimeId?: string | null }): number | null {
  const n = Number(entry.malAnimeId)
  return Number.isInteger(n) && n > 0 ? n : null
}

// 書き込みの控えに入れる形（無いときは項目ごと省く）
export function idMalOf(malAnimeId: string | null | undefined): number | undefined {
  return malIdOf({ malAnimeId }) ?? undefined
}
