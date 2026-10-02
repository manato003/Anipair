import type { AnnictWork, RatingState } from '../../lib/annict'
import type { KeyAction } from '../../lib/keymap'
import type { Season } from '../../lib/season'
import type { Cover } from '../../lib/storage'

// さかのぼり（過去作の初期登録）の純粋なロジック

// rate: 見た + 総合評価 / watched: 見たけど覚えていない / wanna: 見てないが見たい / watching: 見てる /
// skip: 見てない（Annict には送らない）
export type Answer = { kind: 'rate'; rating: RatingState } | { kind: 'watched' } | { kind: 'wanna' } | { kind: 'watching' } | { kind: 'skip' }

export interface Card {
  work: AnnictWork
  cover: Cover | null
}

// これより前のクールには進まない
export const OLDEST_YEAR = 1970
// クールを選ぶプルダウンの下限（評価とブラウズで共通）
export const OLDEST_SEASON: Season = { year: OLDEST_YEAR, name: 'winter' }

// まだ何も記録していない作品だけを出す。「見てない」を押した作品も出さない
export function pickQueue(works: AnnictWork[], skipped: ReadonlySet<number>): AnnictWork[] {
  return works.filter((w) => (w.viewerStatusState ?? 'NO_STATE') === 'NO_STATE' && !skipped.has(w.annictId))
}

export function toCards(works: AnnictWork[], covers: ReadonlyMap<number, Cover>): Card[] {
  return works.map((work) => {
    const mal = Number(work.malAnimeId)
    const cover = (Number.isInteger(mal) ? covers.get(mal) : undefined) ?? null
    return { work, cover: cover ?? (work.ogImageUrl ? { url: work.ogImageUrl, color: null } : null) }
  })
}

export function malIdsOf(works: AnnictWork[]): number[] {
  return works.map((w) => Number(w.malAnimeId)).filter((n) => Number.isInteger(n) && n > 0)
}

// キーの割り当ては設定画面で変えられる（lib/keymap.ts）
export const RATINGS: readonly { rating: RatingState; label: string; action: KeyAction }[] = [
  { rating: 'BAD', label: '良くない', action: 'rateBad' },
  { rating: 'AVERAGE', label: '普通', action: 'rateAverage' },
  { rating: 'GOOD', label: '良い', action: 'rateGood' },
  { rating: 'GREAT', label: 'とても良い', action: 'rateGreat' },
]
