import { fetchMedia } from './shikimori'
import { clearLegacyCovers, loadPosters, savePosters, type Cover } from './storage'

// 表紙の出どころを、ここ1か所で決める。どの画面も fetchCovers に作品を渡すだけで、出どころは知らない。
// 表紙は Shikimori のポスター（縦長。端末に控える）だけ。見つからない作品は表紙なしで出す。
// Annict の作品画像は使わない: Annict の開発者が「作品画像は API で公開していない」と言っている（Discord）ので、
// API の Work.image（公式サイトの OGP 画像の URL と権利表記）も問い合わせない（2026-10-04。docs/concept.md の設計の原則）

// 表紙を決めたい作品。Annict の作品なら、どの画面のデータにも入っている項目だけ
export interface CoverSource {
  annictId: number
  malAnimeId: string | null
}

type Resolver = (works: CoverSource[]) => Promise<Map<number, Cover>>

// 通信の要らない部分: 端末に控えたポスター。一覧を先に出すときに、この分だけ先に使える
export function quickCovers(works: readonly CoverSource[]): Map<number, Cover> {
  const posters = loadPosters()
  const out = new Map<number, Cover>()
  for (const w of works) {
    const p = posters.get(Number(w.malAnimeId))
    if (p) out.set(w.annictId, { url: p.o, thumb: p.m, landscape: false })
  }
  return out
}

// Shikimori のポスター。MyAnimeList の ID の分だけ問い合わせて、端末に控える。
// 表紙は見た目のためのものなので、取れなくても止めない（取れなかった作品は表紙なしで出る）
const shikimoriPoster: Resolver = async (works) => {
  const withMal = works.flatMap((w) => {
    const mal = Number(w.malAnimeId)
    return Number.isInteger(mal) && mal > 0 ? [{ annictId: w.annictId, mal }] : []
  })
  if (withMal.length === 0) return new Map()
  const posters = loadPosters()
  const missing = withMal.map((w) => w.mal).filter((id) => !posters.has(id))
  if (missing.length > 0) {
    try {
      const got = await fetchMedia(missing)
      let changed = false
      for (const [mal, m] of got) {
        if (m.cover) {
          posters.set(mal, { o: m.cover.url, m: m.cover.thumb })
          changed = true
        }
      }
      if (changed) savePosters(posters)
    } catch (e) {
      console.warn('Shikimori からポスターを取れませんでした', e)
    }
  }
  const out = new Map<number, Cover>()
  for (const { annictId, mal } of withMal) {
    const p = posters.get(mal)
    if (p) out.set(annictId, { url: p.o, thumb: p.m, landscape: false })
  }
  return out
}

const RESOLVERS: readonly Resolver[] = [shikimoriPoster]

// 作品ごとの表紙（Annict の作品 ID → 表紙）。見つからなかった作品は入らない
export async function fetchCovers(works: readonly CoverSource[]): Promise<Map<number, Cover>> {
  clearLegacyCovers()
  const out = new Map<number, Cover>()
  let rest = [...works]
  for (const resolve of RESOLVERS) {
    if (rest.length === 0) break
    const got = await resolve(rest)
    for (const [id, cover] of got) out.set(id, cover)
    rest = rest.filter((w) => !got.has(w.annictId))
  }
  return out
}
