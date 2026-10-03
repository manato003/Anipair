// Shikimori への中継（Vercel の関数。Web 標準の Request / Response）。
// 作品の情報（ジャンル・テーマ・制作会社・表紙・点数・前作）と「似た作品」を、Annict に無いぶんだけ Shikimori から取る。
//
// なぜ中継が要るか: Shikimori の API の決まりは「User-Agent にアプリの名前を入れる。ブラウザのふりをしない」で、
// ブラウザからは User-Agent を変えられないため。ついでに、Vercel の CDN の控え（s-maxage）で、同じ作品の問い合わせを全利用者で1回にできる。
//
// 受け付けるのは決まった問い合わせだけ（GET のみ。任意の URL は中継しない）。
//   ?op=animes&ids=1,2,3   作品の情報（MyAnimeList の ID。Shikimori の ID と同じ。50件まで）
//   ?op=similar&id=N       似た作品の MyAnimeList ID（似ている順）
// 何も保存せず、何もログに出さない（利用者に結びつく情報はそもそも受け取らない）。
//
// 注意: api/ の中のファイルはすべて関数として配備される。自己完結にして、テストは tests/ に置く（annict-token.ts と同じ）

const GRAPHQL_URL = 'https://shikimori.io/api/graphql'
const REST_URL = 'https://shikimori.io/api/animes'
const USER_AGENT = 'Anipair (https://anipair.vercel.app/)'
const MAX_IDS = 50
const MAX_SIMILAR = 100
const MAX_RELATED = 30
const TIMEOUT_MS = 8000

// 作品は変わらないので1週間 CDN に置く。期限が切れても1日は古いものを返しながら裏で取り直す
const CACHE_OK = 'public, s-maxage=604800, stale-while-revalidate=86400'

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// 固定の問い合わせ（利用者の入力は variables の ids だけ。数字のコンマ区切りに検証してから入れる）
const ANIMES_QUERY = `query($ids: String!) { animes(ids: $ids, limit: ${MAX_IDS}) {
  malId name japanese english kind rating status score
  airedOn { year }
  poster { originalUrl mainUrl }
  genres { name kind }
  studios { name }
  related { relationKind anime { malId } }
} }`

function respond(status: number, body: unknown, cache: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } })
}

// 失敗は控えさせない
function fail(status: number, error: string, extra: Record<string, string> = {}): Response {
  const res = respond(status, { error }, 'no-store')
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v)
  return res
}

function parseIds(raw: string | null): number[] | null {
  if (!raw || !/^[1-9][0-9]{0,8}(,[1-9][0-9]{0,8})*$/.test(raw)) return null
  const ids = [...new Set(raw.split(',').map(Number))].sort((a, b) => a - b)
  return ids.length <= MAX_IDS ? ids : null
}

function parseId(raw: string | null): number | null {
  return raw && /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : null
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

const httpsUrl = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://') ? v : null)

interface RawAnime {
  malId?: unknown
  name?: unknown
  japanese?: unknown
  english?: unknown
  kind?: unknown
  rating?: unknown
  status?: unknown
  score?: unknown
  airedOn?: { year?: unknown } | null
  poster?: { originalUrl?: unknown; mainUrl?: unknown } | null
  genres?: { name?: unknown; kind?: unknown }[] | null
  studios?: { name?: unknown }[] | null
  related?: { relationKind?: unknown; anime?: { malId?: unknown } | null }[] | null
}

// 画面が使う項目だけにして返す（Shikimori の応答をそのまま渡さない）。
// score は 0〜10 で、点数の付いていない新しい作品は 0 や null（0 は「無し」として null にそろえる）
function trim(a: RawAnime) {
  const id = num(a.malId)
  if (!id || id <= 0) return null
  const score = num(a.score)
  return {
    id,
    name: str(a.name),
    japanese: str(a.japanese),
    english: str(a.english),
    kind: str(a.kind),
    rating: str(a.rating),
    status: str(a.status),
    score: score && score > 0 ? score : null,
    year: num(a.airedOn?.year),
    poster: httpsUrl(a.poster?.originalUrl) && httpsUrl(a.poster?.mainUrl) ? { o: httpsUrl(a.poster?.originalUrl), m: httpsUrl(a.poster?.mainUrl) } : null,
    genres: (a.genres ?? []).flatMap((g) => (str(g.name) && str(g.kind) ? [{ n: str(g.name), k: str(g.kind) }] : [])),
    studios: (a.studios ?? []).flatMap((s) => (str(s.name) ? [str(s.name)] : [])),
    prequels: (a.related ?? []).flatMap((r) => (r.relationKind === 'prequel' && num(r.anime?.malId) ? [num(r.anime?.malId)] : [])),
    // 関連するアニメ（関係の種類つき）。作品の詳細の「関連作品」で、Annict にシリーズが無いときの代わりに使う。原作の漫画など、アニメでないものは除く
    related: (a.related ?? []).flatMap((r) => (str(r.relationKind) && num(r.anime?.malId) ? [{ k: str(r.relationKind), id: num(r.anime?.malId) }] : [])).slice(0, MAX_RELATED),
  }
}

export async function handleShiki(request: Request, fetchFn: FetchLike = fetch): Promise<Response> {
  if (request.method !== 'GET') return fail(405, 'method_not_allowed', { Allow: 'GET' })
  const q = new URL(request.url).searchParams
  const op = q.get('op')

  let upstream: Response
  try {
    if (op === 'animes') {
      const ids = parseIds(q.get('ids'))
      if (!ids) return fail(400, 'bad_request')
      upstream = await fetchFn(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: ANIMES_QUERY, variables: { ids: ids.join(',') } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } else if (op === 'similar') {
      const id = parseId(q.get('id'))
      if (!id) return fail(400, 'bad_request')
      upstream = await fetchFn(`${REST_URL}/${id}/similar`, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      // MyAnimeList に無い ID。似た作品が無いだけなので、空の一覧として返して控えさせる
      if (upstream.status === 404) return respond(200, { ids: [] }, CACHE_OK)
    } else {
      return fail(400, 'bad_request')
    }
  } catch {
    return fail(502, 'upstream_unreachable')
  }

  if (upstream.status === 429) return fail(429, 'rate_limited', { 'Retry-After': '5' })
  if (!upstream.ok) return fail(502, 'upstream_error')

  let data: unknown
  try {
    data = await upstream.json()
  } catch {
    return fail(502, 'upstream_error')
  }

  if (op === 'animes') {
    const list = (data as { data?: { animes?: RawAnime[] } } | null)?.data?.animes
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    return respond(200, { animes: list.flatMap((a) => trim(a) ?? []) }, CACHE_OK)
  }
  if (!Array.isArray(data)) return fail(502, 'upstream_error')
  const ids = data.flatMap((a: { id?: unknown }) => (num(a?.id) ? [num(a.id)] : [])).slice(0, MAX_SIMILAR)
  return respond(200, { ids }, CACHE_OK)
}

export function GET(request: Request): Promise<Response> {
  return handleShiki(request)
}
