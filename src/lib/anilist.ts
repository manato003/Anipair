import { createThrottle } from './throttle'
import { loadCovers, saveCovers, type Cover } from './storage'

// AniList GraphQL API。Annict の API からは古い作品の画像がほぼ取れないので、表紙はこちらから取る
const ENDPOINT = 'https://graphql.anilist.co'

// 2026-09-29 時点で1分30回まで。余裕を見て約28回に抑える
const schedule = createThrottle(2100)

const PER_PAGE = 50

interface RawMedia {
  idMal: number | null
  averageScore: number | null
  coverImage: { extraLarge: string | null; large: string | null; color: string | null } | null
}

async function fetchChunk(malIds: number[]): Promise<RawMedia[]> {
  return schedule(async () => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query($ids: [Int]) {
          Page(perPage: ${PER_PAGE}) {
            media(idMal_in: $ids, type: ANIME) { idMal averageScore coverImage { extraLarge large color } }
          }
        }`,
        variables: { ids: malIds },
      }),
    })
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
    const json = (await res.json()) as { data?: { Page: { media: RawMedia[] } } }
    return json.data?.Page.media ?? []
  })
}

// マッチングに使う作品の情報
export interface AniMedia {
  id: number
  idMal: number
  title: { native: string | null; romaji: string | null; english: string | null }
  format: string | null
  status: string | null
  isAdult: boolean
  seasonYear: number | null
  genres: string[]
  tags: { name: string; rank: number }[]
  studios: string[]
  cover: Cover | null
  // 前作（アニメ）の MyAnimeList ID
  prequels: number[]
  // 「これも好きな人が多い」。rating は AniList の利用者の賛成票
  recommendations: { idMal: number; rating: number }[]
}

interface RawFullMedia {
  id: number
  idMal: number | null
  title: { native: string | null; romaji: string | null; english: string | null }
  format: string | null
  status: string | null
  isAdult: boolean | null
  seasonYear: number | null
  genres: string[] | null
  tags: { name: string; rank: number | null; isMediaSpoiler: boolean | null }[] | null
  studios: { nodes: { name: string }[] } | null
  coverImage: { extraLarge: string | null; large: string | null; color: string | null } | null
  relations: { edges: { relationType: string; node: { idMal: number | null; type: string } | null }[] } | null
  recommendations: { nodes: { rating: number | null; mediaRecommendation: { idMal: number | null } | null }[] } | null
}

const FULL_QUERY = `query($ids: [Int]) { Page(perPage: ${PER_PAGE}) { media(idMal_in: $ids, type: ANIME) {
  id idMal title { native romaji english } format status isAdult seasonYear
  genres tags { name rank isMediaSpoiler }
  studios(isMain: true) { nodes { name } }
  coverImage { extraLarge large color }
  relations { edges { relationType node { idMal type } } }
  recommendations(perPage: 10, sort: RATING_DESC) { nodes { rating mediaRecommendation { idMal } } }
} } }`

function normalize(m: RawFullMedia): AniMedia | null {
  if (!m.idMal) return null
  const url = m.coverImage?.extraLarge ?? m.coverImage?.large
  return {
    id: m.id,
    idMal: m.idMal,
    title: m.title,
    format: m.format,
    status: m.status,
    isAdult: Boolean(m.isAdult),
    seasonYear: m.seasonYear,
    genres: m.genres ?? [],
    // ネタバレのタグは好みの判定に使わない（見た人にしか分からない特徴なので）
    tags: (m.tags ?? []).filter((t) => !t.isMediaSpoiler).map((t) => ({ name: t.name, rank: t.rank ?? 0 })),
    studios: (m.studios?.nodes ?? []).map((s) => s.name),
    cover: url ? { url, color: m.coverImage?.color ?? null } : null,
    prequels: (m.relations?.edges ?? [])
      .filter((e) => e.relationType === 'PREQUEL' && e.node?.type === 'ANIME' && e.node.idMal)
      .map((e) => e.node!.idMal!),
    recommendations: (m.recommendations?.nodes ?? [])
      .filter((n) => n.mediaRecommendation?.idMal)
      .map((n) => ({ idMal: n.mediaRecommendation!.idMal!, rating: n.rating ?? 0 })),
  }
}

// 1回の起動の中では取り直さない（作品の情報はほとんど変わらない）
const mediaCache = new Map<number, AniMedia>()

// MyAnimeList の ID から作品の情報を引く。50件ずつまとめて1回の問い合わせにする
export async function fetchMediaByMal(malIds: number[]): Promise<Map<number, AniMedia>> {
  const missing = [...new Set(malIds)].filter((id) => !mediaCache.has(id))
  for (let i = 0; i < missing.length; i += PER_PAGE) {
    const chunk = missing.slice(i, i + PER_PAGE)
    const media = await schedule(async () => {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: FULL_QUERY, variables: { ids: chunk } }),
      })
      if (res.status === 429) throw new Error('AniList の利用制限に達しました。1分ほど待ってからもう一度試してください')
      if (!res.ok) throw new Error(`AniList がエラーを返しました（HTTP ${res.status}）`)
      const json = (await res.json()) as { data?: { Page: { media: RawFullMedia[] } } }
      return json.data?.Page.media ?? []
    })
    for (const raw of media) {
      const m = normalize(raw)
      if (m) mediaCache.set(m.idMal, m)
    }
  }
  return new Map(malIds.filter((id) => mediaCache.has(id)).map((id) => [id, mediaCache.get(id)!]))
}

// あらすじ（英語）。Annict の作品ページに日本語のあらすじが無いときの代わりに使う（annictPage.ts）。取れなければ null
export async function fetchDescription(malId: number): Promise<{ description: string | null; genres: string[] } | null> {
  try {
    return await schedule(async () => {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: 'query($id: Int) { Media(idMal: $id, type: ANIME) { description(asHtml: false) genres } }',
          variables: { id: malId },
        }),
      })
      if (!res.ok) return null
      const json = (await res.json()) as { data?: { Media: { description: string | null; genres: string[] | null } | null } }
      const m = json.data?.Media
      return m ? { description: m.description, genres: m.genres ?? [] } : null
    })
  } catch {
    return null
  }
}

// AniList の平均点（100点満点）。ブラウズの評価順に使う。点数は変わるので端末には保存せず、起動中だけ使い回す。
// 表紙と同じ問い合わせで取れるので、表紙を取るときに一緒に控える
const scoreCache = new Map<number, number | null>()

// 表紙と平均点をまとめて取り、両方の控えを更新する。取れなかった分は飛ばす
async function fetchAndRemember(malIds: number[], covers: Map<number, Cover>): Promise<boolean> {
  let changed = false
  for (let i = 0; i < malIds.length; i += PER_PAGE) {
    const chunk = malIds.slice(i, i + PER_PAGE)
    try {
      const media = await fetchChunk(chunk)
      // 問い合わせたのに返ってこなかった作品は「点数なし」として控え、何度も問い合わせない
      for (const id of chunk) if (!scoreCache.has(id)) scoreCache.set(id, null)
      for (const m of media) {
        if (!m.idMal) continue
        scoreCache.set(m.idMal, m.averageScore ?? null)
        const url = m.coverImage?.extraLarge ?? m.coverImage?.large
        if (url) {
          covers.set(m.idMal, { url, color: m.coverImage?.color ?? null })
          changed = true
        }
      }
    } catch (e) {
      console.warn('AniList から表紙と平均点を取れませんでした', e)
    }
  }
  return changed
}

// MyAnimeList の ID から表紙を引く。取得済みのものは端末に保存して使い回す。
// 表紙は見た目のためのものなので、取れなかった分は呼び出し側が Annict の画像や文字で代える
export async function fetchCovers(malIds: number[]): Promise<Map<number, Cover>> {
  const cache = loadCovers()
  const missing = [...new Set(malIds)].filter((id) => !cache.has(id))
  if (await fetchAndRemember(missing, cache)) saveCovers(cache)
  return new Map(malIds.filter((id) => cache.has(id)).map((id) => [id, cache.get(id)!]))
}

// MyAnimeList の ID から AniList の平均点を引く。点数の無い作品は null
export async function fetchScores(malIds: number[]): Promise<Map<number, number | null>> {
  const cache = loadCovers()
  const missing = [...new Set(malIds)].filter((id) => !scoreCache.has(id))
  if (await fetchAndRemember(missing, cache)) saveCovers(cache)
  return new Map(malIds.map((id) => [id, scoreCache.get(id) ?? null]))
}
