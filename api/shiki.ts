// Shikimori への中継（Vercel の関数。Web 標準の Request / Response）。
// 作品の情報（ジャンル・テーマ・制作会社・表紙・点数・前作）と「似た作品」を、Annict に無いぶんだけ Shikimori から取る。
//
// なぜ中継が要るか: Shikimori の API の決まりは「User-Agent にアプリの名前を入れる。ブラウザのふりをしない」で、
// ブラウザからは User-Agent を変えられないため。ついでに、Vercel の CDN の控え（s-maxage）で、同じ作品の問い合わせを全利用者で1回にできる。
//
// 受け付けるのは決まった問い合わせだけ（GET のみ。任意の URL は中継しない）。
//   ?op=animes&ids=1,2,3   作品の情報（MyAnimeList の ID。Shikimori の ID と同じ。50件まで）
//   ?op=similar&id=N       似た作品の MyAnimeList ID（似ている順）
//   ?op=people&q=名前       人物を名前で探す（日本語名つき。作品の詳細のキャスト・スタッフから、その人の参加作品を出すため）
//   ?op=person&id=N        人物の参加作品（声の出演の MyAnimeList の ID と、スタッフとしての ID と役割。役割は Shikimori のロシア語のまま）。
//                          v=4 からは、声の出演に演じたキャラクター（ID とローマ字の名前）を付ける
//   ?op=characters&ids=1,2 キャラクターの日本語名（50人まで。参加作品の一覧の役名に使う。Shikimori の人物の応答はローマ字とロシア語の名前しか無い）
//   ?op=studio&id=N&page=P 制作会社の作品（新しい順に50件ずつ。作品の情報と同じ形）
// 利用者に結びつく情報は受け取らず、何もログに出さない。
//
// 控えと回数（2026-10-12）: Upstash Redis（環境変数 KV_REST_API_URL・KV_REST_API_TOKEN。無ければ今までどおり直接聞く）に、
// Shikimori の公開データを作品ごとに控え（デプロイしても消えない。CDN の控えはデプロイごとに空になり、まとめて頼んだ並びでしか使い回せない）、
// Shikimori へ実際に送る回数を全利用者で数える（Shikimori の上限は 5rps / 90rpm で、Vercel の出口から数えられる。こちらは 4/秒・80/分で止める）。
// 上限に達したら Shikimori には送らず 429 と Retry-After を返す（画面は待って送り直す）。Upstash に届かなければ、控えも数えるのも飛ばす（止まらない）。
// 置くのは Shikimori の公開データと回数だけ（利用者の情報は置かない）
//
// 注意: api/ の中のファイルはすべて関数として配備される。自己完結にして、テストは tests/ に置く（annict-token.ts と同じ）

const GRAPHQL_URL = 'https://shikimori.io/api/graphql'
const REST_URL = 'https://shikimori.io/api/animes'
const PEOPLE_URL = 'https://shikimori.io/api/people'
const USER_AGENT = 'Anipair (https://anipair.vercel.app/)'
const MAX_IDS = 50
const MAX_SIMILAR = 100
const MAX_RELATED = 30
const MAX_PEOPLE = 8
// 1人の参加作品は、出演・スタッフそれぞれこれまで（多い人でも数百）
const MAX_PERSON_WORKS = 400
// 1作品に付ける役名の数
const MAX_CHARACTERS_PER_WORK = 3
// 制作会社の作品は、50件ずつ4ページ（200件）まで
const MAX_STUDIO_PAGE = 4
const TIMEOUT_MS = 8000

// 作品は変わらないので1週間 CDN に置く。期限が切れても1日は古いものを返しながら裏で取り直す
const CACHE_OK = 'public, s-maxage=604800, stale-while-revalidate=86400'

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// Shikimori の公開データの控えと、Shikimori へ送る回数（Upstash Redis。テストでは偽物を渡す）
export interface ShikiStore {
  get(keys: readonly string[]): Promise<(string | null)[]>
  set(entries: readonly { key: string; value: string; ttl: number }[]): Promise<void>
  // Shikimori へ1回送ってよいか。よければ null、上限なら待つ秒数
  take(now: number): Promise<number | null>
}

const DAY = 86400
// 作品の情報: 放送が終わった作品は30日、放送中・放送前は1日（話数や状態が変わる）。Shikimori に無い ID は7日
const TTL_RELEASED = 30 * DAY
const TTL_CHANGING = DAY
const TTL_MISSING = 7 * DAY
const TTL_SIMILAR = 30 * DAY
const TTL_CHARACTER = 30 * DAY
const TTL_PERSON = 7 * DAY
const TTL_STUDIO = DAY
// 全利用者で Shikimori へ送る上限（Shikimori は 5rps / 90rpm。少し下で止める）
const PER_SECOND = 4
const PER_MINUTE = 80
// 控えの名前の版（控える形を変えたら上げる）
const KEY = 'shiki:1'
const STORE_TIMEOUT_MS = 1500

// Upstash の REST（pipeline）。SDK を入れずに fetch で話す
export function upstashStore(url: string, token: string, fetchFn: FetchLike = fetch): ShikiStore {
  async function pipeline(commands: readonly (string | number)[][]): Promise<unknown[]> {
    const res = await fetchFn(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error('store')
    const out = (await res.json()) as { result?: unknown; error?: unknown }[]
    if (!Array.isArray(out) || out.some((x) => x?.error)) throw new Error('store')
    return out.map((x) => x.result)
  }
  return {
    async get(keys) {
      if (keys.length === 0) return []
      const [values] = await pipeline([['MGET', ...keys]])
      return Array.isArray(values) ? values.map((v) => (typeof v === 'string' ? v : null)) : keys.map(() => null)
    },
    async set(entries) {
      if (entries.length > 0) await pipeline(entries.map((e) => ['SET', e.key, e.value, 'EX', e.ttl]))
    },
    async take(now) {
      const sec = Math.floor(now / 1000)
      const min = Math.floor(sec / 60)
      const [perSec, , perMin] = await pipeline([
        ['INCR', `${KEY}:rate:s:${sec}`],
        ['EXPIRE', `${KEY}:rate:s:${sec}`, 5],
        ['INCR', `${KEY}:rate:m:${min}`],
        ['EXPIRE', `${KEY}:rate:m:${min}`, 120],
      ])
      if (Number(perMin) > PER_MINUTE) return 60 - (sec % 60)
      if (Number(perSec) > PER_SECOND) return 1
      return null
    },
  }
}

// 環境変数から（Vercel の Upstash の連携が入れる名前。手元と E2E には無いので null）
export function storeFromEnv(env: Record<string, string | undefined>): ShikiStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? upstashStore(url, token) : null
}

// 控えに届かないときは、控えなしで続ける（一度失敗したら、その問い合わせの間はもう使わない）
function safeStore(store: ShikiStore | null) {
  let alive = store !== null
  async function guard<T>(f: (s: ShikiStore) => Promise<T>, fallback: T): Promise<T> {
    if (!alive || !store) return fallback
    try {
      return await f(store)
    } catch {
      alive = false
      return fallback
    }
  }
  return {
    get: (keys: readonly string[]) => guard((s) => s.get(keys), keys.map((): string | null => null)),
    set: (entries: readonly { key: string; value: string; ttl: number }[]) => guard((s) => s.set(entries), undefined),
    take: (now: number) => guard((s) => s.take(now), null),
  }
}

const parseJson = (v: string | null): unknown => {
  if (v === null) return undefined
  try {
    return JSON.parse(v) as unknown
  } catch {
    return undefined
  }
}

// 固定の問い合わせ（利用者の入力は variables の ids だけ。数字のコンマ区切りに検証してから入れる）
const ANIME_FIELDS = `malId name japanese english kind rating status score episodes episodesAired duration
  airedOn { year }
  poster { originalUrl mainUrl }
  genres { name kind }
  studios { id name }
  related { relationKind anime { malId } }
  statusesStats { status count }
  scoresStats { score count }`
const ANIMES_QUERY = `query($ids: String!) { animes(ids: $ids, limit: ${MAX_IDS}) { ${ANIME_FIELDS} } }`
// 制作会社の作品。新しい順（aired_on は放送日の新しい順）
const STUDIO_QUERY = `query($studio: String!, $page: PositiveInt!) { animes(studio: $studio, limit: ${MAX_IDS}, page: $page, order: aired_on) { ${ANIME_FIELDS} } }`
// 人物を名前で探す（日本語名で照合するので japanese を返す）
const PEOPLE_QUERY = `query($search: String!) { people(search: $search, limit: ${MAX_PEOPLE}) { id name japanese } }`
// キャラクターの日本語名
const CHARACTERS_QUERY = `query($ids: String!) { characters(ids: $ids, limit: ${MAX_IDS}) { id japanese } }`

function respond(status: number, body: unknown, cache: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } })
}

// 失敗は控えさせない
function fail(status: number, error: string, extra: Record<string, string> = {}): Response {
  const res = respond(status, { error }, 'no-store')
  for (const [k, v] of Object.entries(extra)) res.headers.set(k, v)
  return res
}

// 問い合わせの種類ごとに受け付ける版。版を変えて控えを素通りさせる余地を小さくするため、使っている版だけにする。
// 作品と制作会社は、いまの版（6: 点数を付けた人の数）と、開いたままの古い画面が送る直前の2つ（4: 人気、5: 話数）。
// 人物は 2（スタッフの役割）と 4（声の出演のキャラクター）
const VERSIONS: Record<string, readonly string[]> = {
  animes: ['4', '5', '6'],
  studio: ['4', '5', '6'],
  person: ['2', '4'],
}

// 問い合わせの種類ごとに受け付ける引数（v は、応答の形を変えたときにクライアントが CDN の古い控えを避けるための版）
const PARAMS: Record<string, readonly string[]> = {
  animes: ['op', 'ids', 'v'],
  studio: ['op', 'id', 'page', 'v'],
  people: ['op', 'q'],
  person: ['op', 'id', 'v'],
  characters: ['op', 'ids'],
  similar: ['op', 'id'],
}

function parseIds(raw: string | null): number[] | null {
  if (!raw || !/^[1-9][0-9]{0,8}(,[1-9][0-9]{0,8})*$/.test(raw)) return null
  const ids = [...new Set(raw.split(',').map(Number))].sort((a, b) => a - b)
  return ids.length <= MAX_IDS ? ids : null
}

function parseId(raw: string | null): number | null {
  return raw && /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : null
}

// 人物の名前（1〜60字。制御文字は受け付けない）
function parseName(raw: string | null): string | null {
  const name = raw?.trim() ?? ''
  // eslint-disable-next-line no-control-regex
  return name.length >= 1 && name.length <= 60 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null
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
  episodes?: unknown
  episodesAired?: unknown
  duration?: unknown
  airedOn?: { year?: unknown } | null
  poster?: { originalUrl?: unknown; mainUrl?: unknown } | null
  genres?: { name?: unknown; kind?: unknown }[] | null
  studios?: { id?: unknown; name?: unknown }[] | null
  related?: { relationKind?: unknown; anime?: { malId?: unknown } | null }[] | null
  statusesStats?: { status?: unknown; count?: unknown }[] | null
  scoresStats?: { score?: unknown; count?: unknown }[] | null
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
    // 話数（全話数。未定は 0）・放送済みの話数・1話の長さ（分）。作品の要点（全◯話・放送中・一気見の目安）に使う
    eps: num(a.episodes) ?? 0,
    aired: num(a.episodesAired) ?? 0,
    dur: num(a.duration) ?? 0,
    year: num(a.airedOn?.year),
    poster: httpsUrl(a.poster?.originalUrl) && httpsUrl(a.poster?.mainUrl) ? { o: httpsUrl(a.poster?.originalUrl), m: httpsUrl(a.poster?.mainUrl) } : null,
    genres: (a.genres ?? []).flatMap((g) => (str(g.name) && str(g.kind) ? [{ n: str(g.name), k: str(g.kind) }] : [])),
    studios: (a.studios ?? []).flatMap((s) => (str(s.name) ? [str(s.name)] : [])),
    // 制作会社の ID と名前（制作会社の作品の一覧を開くため）
    st: (a.studios ?? []).flatMap((s) => (num(s.id) && str(s.name) ? [{ i: num(s.id), n: str(s.name) }] : [])),
    prequels: (a.related ?? []).flatMap((r) => (r.relationKind === 'prequel' && num(r.anime?.malId) ? [num(r.anime?.malId)] : [])),
    // 関連するアニメ（関係の種類つき）。作品の詳細の「関連作品」で、Annict にシリーズが無いときの代わりに使う。原作の漫画など、アニメでないものは除く
    related: (a.related ?? []).flatMap((r) => (str(r.relationKind) && num(r.anime?.malId) ? [{ k: str(r.relationKind), id: num(r.anime?.malId) }] : [])).slice(0, MAX_RELATED),
    // 人気（Shikimori でこの作品をリストに入れている人の数。見た・見てる・見たいなどの合計）。参加作品の一覧の「人気順」に使う
    pop: (a.statusesStats ?? []).reduce((sum, x) => sum + (num(x?.count) ?? 0), 0),
    // 点数を付けた人の数。ブラウズの評価順で、人数の少ない作品の点数を平均に寄せる（ベイズ平均）のに使う
    sc: (a.scoresStats ?? []).reduce((sum, x) => sum + (num(x?.count) ?? 0), 0),
  }
}

export async function handleShiki(request: Request, fetchFn: FetchLike = fetch, rawStore: ShikiStore | null = null, now: () => number = Date.now): Promise<Response> {
  const store = safeStore(rawStore)
  // 答えを控えてから返す
  const keep = async (key: string | null, body: unknown, ttl: number): Promise<Response> => {
    if (key) await store.set([{ key, value: JSON.stringify(body), ttl }])
    return respond(200, body, CACHE_OK)
  }
  if (request.method !== 'GET') return fail(405, 'method_not_allowed', { Allow: 'GET' })
  const url = new URL(request.url)
  const q = url.searchParams
  const op = q.get('op')
  // 問い合わせの形を1つに決める。CDN の控えは URL ごとなので、余計な引数や並びの違う ids を付けると控えを素通りして、
  // 毎回 Shikimori に問い合わせさせられる（共有の User-Agent と出口が締め出されると、全員の表紙が出なくなる。2026-10-06 の点検）
  const allowed = op ? PARAMS[op] : undefined
  const keys = [...q.keys()]
  if (!allowed || keys.some((k) => !allowed.includes(k)) || new Set(keys).size !== keys.length) return fail(400, 'bad_request')
  // 版は、使っている版だけ（上の VERSIONS。「05」のような別の綴りも通さない）
  const v = q.get('v')
  if (v !== null && !(VERSIONS[op ?? ''] ?? []).includes(v)) return fail(400, 'bad_request')
  if (op === 'animes' || op === 'characters') {
    const ids = parseIds(q.get('ids'))
    if (ids && ids.join(',') !== q.get('ids')) {
      // 並びや重複の違いは、そろえた URL へ送る（同じ中身は1つの控えにする）
      q.set('ids', ids.join(','))
      return new Response(null, { status: 308, headers: { Location: `${url.pathname}?${q.toString()}`, 'Cache-Control': CACHE_OK } })
    }
  }

  // 控えから答えられるものは、Shikimori に聞かずに返す
  let ids: number[] = []
  let cachedAnimes: unknown[] = []
  let cachedChars: unknown[] = []
  const singleKey =
    op === 'similar' && parseId(q.get('id'))
      ? `${KEY}:similar:${q.get('id')}`
      : op === 'person' && parseId(q.get('id'))
        ? `${KEY}:person:${q.get('id')}:${q.get('v') ?? '2'}`
        : op === 'studio' && parseId(q.get('id')) && parseId(q.get('page') ?? '1')
          ? `${KEY}:studio:${q.get('id')}:${q.get('page') ?? '1'}`
          : null
  if (op === 'animes' || op === 'characters') {
    const all = parseIds(q.get('ids'))
    if (!all) return fail(400, 'bad_request')
    const kind = op === 'animes' ? 'anime' : 'char'
    const values = await store.get(all.map((id) => `${KEY}:${kind}:${id}`))
    const parsed = values.map(parseJson)
    ids = all.filter((_, i) => parsed[i] === undefined)
    const hits = parsed.filter((x) => x !== undefined && x !== null)
    if (op === 'animes') cachedAnimes = hits
    else cachedChars = hits
    if (ids.length === 0) return respond(200, op === 'animes' ? { animes: cachedAnimes } : { characters: cachedChars }, CACHE_OK)
  } else if (singleKey) {
    const [hit] = await store.get([singleKey])
    const body = parseJson(hit)
    if (body !== undefined && body !== null) return respond(200, body, CACHE_OK)
  }

  let upstream: Response
  // 全利用者で数えた上限に達したときの、待ってもらう秒数
  let limitedFor: number | null = null
  try {
    // 入力の検査を通ったものだけ、Shikimori へ送る回数を全利用者で数え、上限なら送らない
    const send = async (url: string, init: RequestInit): Promise<Response> => {
      limitedFor = await store.take(now())
      return limitedFor === null ? fetchFn(url, init) : new Response(null, { status: 429 })
    }
    if (op === 'animes') {
      upstream = await send(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: ANIMES_QUERY, variables: { ids: ids.join(',') } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } else if (op === 'characters') {
      upstream = await send(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: CHARACTERS_QUERY, variables: { ids: ids.join(',') } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } else if (op === 'studio') {
      const id = parseId(q.get('id'))
      const page = parseId(q.get('page') ?? '1')
      if (!id || !page || page > MAX_STUDIO_PAGE) return fail(400, 'bad_request')
      upstream = await send(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: STUDIO_QUERY, variables: { studio: String(id), page } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } else if (op === 'people') {
      const name = parseName(q.get('q'))
      if (!name) return fail(400, 'bad_request')
      upstream = await send(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: PEOPLE_QUERY, variables: { search: name } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } else if (op === 'person') {
      const id = parseId(q.get('id'))
      if (!id) return fail(400, 'bad_request')
      upstream = await send(`${PEOPLE_URL}/${id}`, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      // 居ない人。参加作品が無いだけなので、空として返して控えさせる
      if (upstream.status === 404) return keep(singleKey, { cast: [], staff: [] }, TTL_PERSON)
    } else if (op === 'similar') {
      const id = parseId(q.get('id'))
      if (!id) return fail(400, 'bad_request')
      upstream = await send(`${REST_URL}/${id}/similar`, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      // MyAnimeList に無い ID。似た作品が無いだけなので、空の一覧として返して控えさせる
      if (upstream.status === 404) return keep(singleKey, { ids: [] }, TTL_SIMILAR)
    } else {
      return fail(400, 'bad_request')
    }
  } catch {
    return fail(502, 'upstream_unreachable')
  }

  if (limitedFor !== null) return fail(429, 'rate_limited', { 'Retry-After': String(limitedFor) })
  if (upstream.status === 429) return fail(429, 'rate_limited', { 'Retry-After': '5' })
  if (!upstream.ok) return fail(502, 'upstream_error')

  let data: unknown
  try {
    data = await upstream.json()
  } catch {
    return fail(502, 'upstream_error')
  }

  if (op === 'animes' || op === 'studio') {
    const list = (data as { data?: { animes?: RawAnime[] } } | null)?.data?.animes
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    const animes = list.flatMap((a) => trim(a) ?? [])
    if (op === 'studio') return keep(singleKey, { animes }, TTL_STUDIO)
    // 作品ごとに控える。頼んだのに返らなかった ID も「無い」として控える（毎回聞き直さない）
    const found = new Set(animes.map((a) => a.id))
    await store.set([
      ...animes.map((a) => ({ key: `${KEY}:anime:${a.id}`, value: JSON.stringify(a), ttl: a.status === 'released' ? TTL_RELEASED : TTL_CHANGING })),
      ...ids.filter((id) => !found.has(id)).map((id) => ({ key: `${KEY}:anime:${id}`, value: 'null', ttl: TTL_MISSING })),
    ])
    return respond(200, { animes: [...cachedAnimes, ...animes] }, CACHE_OK)
  }
  if (op === 'characters') {
    const list = (data as { data?: { characters?: { id?: unknown; japanese?: unknown }[] } } | null)?.data?.characters
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    // 日本語名は「姓 名」の間を空けて返る。役名としては詰める（「竈門 炭治郎」→「竈門炭治郎」）
    const characters = list.flatMap((c) => {
      const id = num(c?.id)
      const ja = str(c?.japanese)?.replace(/\s+/g, '')
      return id && id > 0 && ja && ja.length <= 60 ? [{ id, ja }] : []
    })
    const found = new Set(characters.map((c) => c.id))
    await store.set([
      ...characters.map((c) => ({ key: `${KEY}:char:${c.id}`, value: JSON.stringify(c), ttl: TTL_CHARACTER })),
      ...ids.filter((id) => !found.has(id)).map((id) => ({ key: `${KEY}:char:${id}`, value: 'null', ttl: TTL_MISSING })),
    ])
    return respond(200, { characters: [...cachedChars, ...characters] }, CACHE_OK)
  }
  if (op === 'people') {
    const list = (data as { data?: { people?: { id?: unknown; name?: unknown; japanese?: unknown }[] } } | null)?.data?.people
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    return respond(200, { people: list.flatMap((x) => (num(x?.id) ? [{ id: num(x.id), name: str(x.name), japanese: str(x.japanese) }] : [])) }, CACHE_OK)
  }
  if (op === 'person') {
    // 声の出演は roles（キャラクターごとの作品）、スタッフは works（作品と役割。主題歌の歌唱なども入る）。アニメの ID を重ねずに返す。
    // 役割は Shikimori のロシア語のまま返し、画面の側で日本語にする（知らない役割は「スタッフ」）
    type RawRole = { characters?: { id?: unknown; name?: unknown }[]; animes?: { id?: unknown }[] }
    const d = data as { roles?: RawRole[]; works?: { anime?: { id?: unknown } | null; role?: unknown }[] } | null
    if (!d || typeof d !== 'object') return fail(502, 'upstream_error')
    const roles = Array.isArray(d.roles) ? d.roles : []
    // 作品ごとの、演じたキャラクターの ID（並びは Shikimori の順）
    const castChars = new Map<number, number[]>()
    const romaji = new Map<number, string>()
    for (const r of roles) {
      const chars = (Array.isArray(r?.characters) ? r.characters : []).flatMap((c) => {
        const cid = num(c?.id)
        if (!cid || cid <= 0) return []
        const name = str(c?.name)
        if (name && name.length <= 60) romaji.set(cid, name)
        return [cid]
      })
      for (const a of Array.isArray(r?.animes) ? r.animes : []) {
        const id = num(a?.id)
        if (!id || id <= 0) continue
        const list = castChars.get(id) ?? []
        for (const c of chars) if (!list.includes(c)) list.push(c)
        castChars.set(id, list)
      }
    }
    const castIds = [...castChars.keys()].slice(0, MAX_PERSON_WORKS)
    const staffRoles = new Map<number, string[]>()
    for (const w of Array.isArray(d.works) ? d.works : []) {
      const id = num(w?.anime?.id)
      const role = str(w?.role)
      if (!id || id <= 0) continue
      const list = staffRoles.get(id) ?? []
      if (role && role.length <= 60 && !list.includes(role) && list.length < 6) list.push(role)
      staffRoles.set(id, list)
    }
    const staff = [...staffRoles].slice(0, MAX_PERSON_WORKS).map(([id, r]) => ({ id, r }))
    // v=2 までの画面には、今までの形（声の出演は ID だけ）で返す
    if (q.get('v') !== '4') return keep(singleKey, { cast: castIds, staff }, TTL_PERSON)
    // 演じたキャラクターは ID とローマ字の名前だけ。日本語名は画面が op=characters で引く（1回の問い合わせで Shikimori へ出るのは1回に保つ）
    const cast = castIds.map((id) => ({ id, ch: (castChars.get(id) ?? []).slice(0, MAX_CHARACTERS_PER_WORK).map((c) => ({ i: c, n: romaji.get(c) ?? null })) }))
    return keep(singleKey, { cast, staff }, TTL_PERSON)
  }
  if (!Array.isArray(data)) return fail(502, 'upstream_error')
  const similar = data.flatMap((a: { id?: unknown }) => (num(a?.id) ? [num(a.id)] : [])).slice(0, MAX_SIMILAR)
  return keep(singleKey, { ids: similar }, TTL_SIMILAR)
}

export function GET(request: Request): Promise<Response> {
  return handleShiki(request, fetch, storeFromEnv(process.env))
}
