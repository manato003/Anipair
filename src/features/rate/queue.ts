import type { AnnictWork, RatingState } from '../../lib/annict'
import type { KeyAction } from '../../lib/keymap'
import type { Season } from '../../lib/season'
import type { Cover } from '../../lib/storage'

// さかのぼり（過去作の初期登録）の純粋なロジック

// rate: 見た + 総合評価 / watched: 見たけど覚えていない / wanna: 見てないが見たい / watching: 見てる /
// stop: 途中で見るのをやめた（視聴中断。Annict には STOP_WATCHING） / skip: 見てない（Annict には送らない）
export type Answer = { kind: 'rate'; rating: RatingState } | { kind: 'watched' } | { kind: 'wanna' } | { kind: 'watching' } | { kind: 'stop' } | { kind: 'skip' }

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

// covers は Annict の作品 ID ごとの表紙（lib/covers.ts の fetchCovers）
export function toCards(works: AnnictWork[], covers: ReadonlyMap<number, Cover>): Card[] {
  return works.map((work) => ({ work, cover: covers.get(work.annictId) ?? null }))
}

// キーの割り当ては設定画面で変えられる（lib/keymap.ts）
export const RATINGS: readonly { rating: RatingState; label: string; action: KeyAction }[] = [
  { rating: 'BAD', label: '良くない', action: 'rateBad' },
  { rating: 'AVERAGE', label: '普通', action: 'rateAverage' },
  { rating: 'GOOD', label: '良い', action: 'rateGood' },
  { rating: 'GREAT', label: 'とても良い', action: 'rateGreat' },
]
