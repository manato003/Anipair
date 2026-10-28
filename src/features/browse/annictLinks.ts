import { fetchWorksByAnnictIds, type BrowseWork } from '../../lib/annict'
import { persistedMap } from '../../lib/persistedMap'
import { linkAnnict, type Media } from '../../lib/shikimori'
import { resolveAnnictWorks } from '../match/resolve'

// Shikimori の作品（MyAnimeList の ID）を Annict の作品に結び付ける（ブラウズの条件検索）。
// 1. 中継が覚えている対応（hinted）と、この起動中に確かめた対応は、Annict の作品 ID でまとめて引き直し、malAnimeId が合うものだけ使う。
//    中継の対応は誰でも書けるので、そのまま信じない（偽の対応なら題名で探し直し、正しい対応を書き直す）
// 2. 残りは題名で探す（resolveAnnictWorks）。見つかったら中継に覚えてもらい、見つからなければ端末に7日覚えて探し直さない。
//    「無い」は中継に置かない（偽の「無い」を全員に配らせない）
// 対応は公開された作品の ID どうしだけで、利用者の情報は入らない

const MISS_MS = 7 * 86_400_000
// MyAnimeList の ID → 次に題名で探してよい時刻
const misses = persistedMap<number>('annictMiss', 3000, (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null))
// この起動中に確かめた対応（MyAnimeList の ID → Annict の作品 ID）
const known = new Map<number, number>()

export interface LinkDeps {
  byIds?: typeof fetchWorksByAnnictIds
  resolve?: (token: string, medias: readonly Media[]) => Promise<Map<number, BrowseWork>>
  link?: typeof linkAnnict
  now?: () => number
}

// 結び付いた作品（MyAnimeList の ID → Annict の作品。ブラウズの一覧と同じ項目）。結び付かなかった作品は入らない
export async function linkWorks(token: string, medias: readonly Media[], hinted: ReadonlyMap<number, number>, deps: LinkDeps = {}): Promise<Map<number, BrowseWork>> {
  const { byIds = fetchWorksByAnnictIds, resolve = resolveAnnictWorks, link = linkAnnict, now = Date.now } = deps
  const out = new Map<number, BrowseWork>()
  const asked = new Map<number, number>()
  for (const m of medias) {
    const id = known.get(m.idMal) ?? hinted.get(m.idMal)
    if (id) asked.set(m.idMal, id)
  }
  if (asked.size > 0) {
    const got = new Map((await byIds(token, [...asked.values()])).map((w) => [w.annictId, w]))
    for (const [mal, id] of asked) {
      const w = got.get(id)
      if (w && w.malAnimeId === String(mal)) {
        out.set(mal, w)
        known.set(mal, id)
      } else {
        known.delete(mal)
      }
    }
  }
  const t = now()
  const rest = medias.filter((m) => !out.has(m.idMal) && !((misses.get(String(m.idMal)) ?? 0) > t))
  if (rest.length === 0) return out
  const found = await resolve(token, rest)
  // 題名の検索の応答には満足度などが無いので、一覧と同じ項目で引き直す（評価順で同じ物差しにする）
  const full = found.size > 0 ? new Map((await byIds(token, [...found.values()].map((w) => w.annictId))).map((w) => [w.annictId, w])) : new Map<number, BrowseWork>()
  const pairs: [number, number][] = []
  for (const m of rest) {
    const w = found.get(m.idMal)
    if (!w) {
      misses.set(String(m.idMal), t + MISS_MS)
      continue
    }
    out.set(m.idMal, full.get(w.annictId) ?? w)
    known.set(m.idMal, w.annictId)
    if (hinted.get(m.idMal) !== w.annictId) pairs.push([m.idMal, w.annictId])
  }
  if (pairs.length > 0) link(pairs)
  return out
}

// テスト用: 覚えた対応と「無い」を捨てる
export function resetAnnictLinksForTests(): void {
  known.clear()
  misses.reset()
}
