import type { LibraryEntry, RatingState } from '../../lib/annict'
import type { Cover } from '../../lib/storage'

// 普段の評価（いま見ている作品を、見終わったら評価する）の純粋なロジック

// rate: 見た + 総合評価 / watched: 見終わった（評価しない）/ still: まだ見てる（何も送らず次へ）/
// hold: 一時中断 / stop: 視聴中止
export type WatchAnswer = { kind: 'rate'; rating: RatingState } | { kind: 'watched' } | { kind: 'still' } | { kind: 'hold' } | { kind: 'stop' }

export interface WatchCard {
  entry: LibraryEntry
  cover: Cover | null
}

// 見てる作品を、見始めた日が古い順に（長く見ている作品ほど見終わっていそう）。日時が分からないものは最後
export function pickWatching(library: LibraryEntry[]): LibraryEntry[] {
  const time = (e: LibraryEntry) => (e.stateAt ? Date.parse(e.stateAt) : NaN)
  return library
    .filter((e) => e.state === 'WATCHING')
    .sort((a, b) => {
      const ta = time(a)
      const tb = time(b)
      if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.isNaN(ta) === Number.isNaN(tb) ? 0 : Number.isNaN(ta) ? 1 : -1
      return ta - tb
    })
}

export function toWatchCards(entries: LibraryEntry[], covers: ReadonlyMap<number, Cover>): WatchCard[] {
  return entries.map((entry) => {
    const mal = Number(entry.malAnimeId)
    return { entry, cover: (Number.isInteger(mal) ? covers.get(mal) : undefined) ?? null }
  })
}

export function watchMalIds(entries: LibraryEntry[]): number[] {
  return entries.map((e) => Number(e.malAnimeId)).filter((n) => Number.isInteger(n) && n > 0)
}
