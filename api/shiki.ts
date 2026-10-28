// Shikimori への中継（Vercel の関数。Web 標準の Request / Response）。
// 作品の情報（ジャンル・テーマ・制作会社・表紙・点数・前作）と「似た作品」を、Annict に無いぶんだけ Shikimori から取る。
//
// なぜ中継が要るか: Shikimori の API の決まりは「User-Agent にアプリの名前を入れる。ブラウザのふりをしない」で、
// ブラウザからは User-Agent を変えられないため。ついでに、Vercel の CDN の控え（s-maxage）で、同じ作品の問い合わせを全利用者で1回にできる。
//
// 受け付けるのは決まった問い合わせだけ（GET のみ。任意の URL は中継しない）。
//   ?op=animes&ids=1,2,3   作品の情報（MyAnimeList の ID。Shikimori の ID と同じ。50件まで）
//   ?op=similar&id=N       似た作品の MyAnimeList ID（似ている順）
//   ?op=similar&ids=1,2,3  控えにある分だけ、まとめて返す（50件まで。Shikimori には聞かない。無い分は missing で返し、画面が id で1件ずつ聞く）。
//                          初回のマッチングで70件ほどを1件ずつ0.7秒おきに頼んでいたのを、控えのある分は1回で済ませる
//   人物と作品の検索（people・search）は Upstash に控えない（任意の文字で控えが膨らむため）。CDN では控える（同じ人の検索が速くなる。CDN の量はこちらの枠ではない）
//   ?op=people&q=名前       人物を名前で探す（日本語名つき。作品の詳細のキャスト・スタッフから、その人の参加作品を出すため）
//   ?op=search&q=題名       作品を題名（英語・ローマ字）で探し、MyAnimeList の ID と日本語の題名を返す（Annict の検索は日本語の題名にしか当たらないため）
//   ?op=person&id=N        人物の参加作品（声の出演の MyAnimeList の ID と、スタッフとしての ID と役割。役割は Shikimori のロシア語のまま）。
//                          v=4 からは、声の出演に演じたキャラクター（ID とローマ字の名前）を付ける
//   ?op=characters&ids=1,2 キャラクターの日本語名（50人まで。参加作品の一覧の役名に使う。Shikimori の人物の応答はローマ字とロシア語の名前しか無い）
//   ?op=studio&id=N&page=P 制作会社の作品（新しい順に50件ずつ。作品の情報と同じ形）。v=7 からは op=find と同じく、応答の annict にその作品の分だけの対応を付ける
//                          （Tier表の作品選びで、制作会社の作品を足すとき。2026-10-28）
//   ?op=cast&id=N          作品のキャラクターのローマ字と日本語の名前（英語の画面で、Annict のキャラクター名を英語にするため。主役から150人まで）
//   ?op=find&genre=1,10&studio=N&from=2022-spring&to=2026-autumn&order=popularity&page=P
//                          期間の作品を、ジャンル（すべてを持つ）と制作会社（1社）で探す（ブラウズの絞り込み。Annict はジャンル・制作会社で探せないため）。
//                          人気順か放送日順で50件ずつ4ページまで。応答の annict は、その作品の分だけの Annict の作品 ID（下の op=link で覚えたもの）
//   POST ?op=link          画面が題名で結び付けた、MyAnimeList の ID → Annict の作品 ID を覚える（次の人は題名で探さずに済む）。
//                          誰でも書けるので、画面は受け取った対応を Annict で引き直して確かめる。作品の控えにある ID だけ受け付ける
// 利用者に結びつく情報は受け取らず、何もログに出さない。
//
// 控えと回数（2026-10-12）: Upstash Redis（環境変数 KV_REST_API_URL・KV_REST_API_TOKEN。無ければ今までどおり直接聞く）に、
// Shikimori の公開データを作品ごとに控え（デプロイしても消えない。CDN の控えはデプロイごとに空になり、まとめて頼んだ並びでしか使い回せない）、
// Shikimori へ実際に送る回数を全利用者で数える（Shikimori の上限は 5rps / 90rpm で、Vercel の出口から数えられる。こちらは 4/秒・80/分で止める）。
// 上限に達したら Shikimori には送らず 429 と Retry-After を返す（画面は待って送り直す）。Upstash に届かなければ、控えも数えるのも飛ばす（止まらない）。
// 置くのは Shikimori の公開データと回数と、作品の ID どうしの対応だけ（利用者の情報は置かない）。
// 対応（Annict の作品 ID）は Annict の API利用規約 第7条（ID は紐付けのために保持できる・サーバーに置いてよい）に沿い、
// 第6条（まとまったデータを取り出させない）のため、条件検索と制作会社の作品の結果の作品の分だけを返す（対応を引くだけの問い合わせは作らない）
//
// 注意: api/ の中のファイルはすべて関数として配備される。自己完結にして、テストは tests/ に置く（annict-token.ts と同じ）

const GRAPHQL_URL = 'https://shikimori.io/api/graphql'
const REST_URL = 'https://shikimori.io/api/animes'
const PEOPLE_URL = 'https://shikimori.io/api/people'
const USER_AGENT = 'Anipair (https://anipair.com/)'
// 1回の作品数の上限。アプリ側（src/lib/shikimori.ts の BATCH）と同じにする
const MAX_IDS = 50
const MAX_SIMILAR = 100
const MAX_RELATED = 30
const MAX_PEOPLE = 8
// 題名の検索で返す作品の数（続編・劇場版まで拾える程度）
const MAX_SEARCH = 10
// 1人の参加作品は、出演・スタッフそれぞれこれまで（多い人でも数百）
const MAX_PERSON_WORKS = 400
// 1作品に付ける役名の数
const MAX_CHARACTERS_PER_WORK = 3
// 作品のキャラクターの名前は、主役から順にこれまで
const MAX_CAST = 150
// 制作会社・ジャンルの作品は、50件ずつ4ページ（200件）まで。アプリ側（src/lib/shikimori.ts の LIST_PAGES）と同じにする
const MAX_LIST_PAGE = 4
const TIMEOUT_MS = 8000

// 作品は変わらないので1週間 CDN に置く。期限が切れても1日は古いものを返しながら裏で取り直す
const CACHE_OK = 'public, s-maxage=604800, stale-while-revalidate=86400'

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// Shikimori の公開データの控えと、Shikimori へ送る回数（Upstash Redis。テストでは偽物を渡す）
export interface ShikiStore {
  get(keys: readonly string[]): Promise<(string | null)[]>
  // ttl は秒。null は期限なし
  set(entries: readonly { key: string; value: string; ttl: number | null }[]): Promise<void>
  // Shikimori へ1回送ってよいか。よければ null、上限なら待つ秒数
  take(now: number): Promise<number | null>
}

const DAY = 86400
// 作品の情報: 放送が終わった作品は90日（点数や続編のつながりは少しずつ変わるが、3か月なら困らない）、
// 放送中・放送前は1日（話数や状態が変わる）。Shikimori に無い ID は7日
const TTL_RELEASED = 90 * DAY
const TTL_CHANGING = DAY
const TTL_MISSING = 7 * DAY
const TTL_SIMILAR = 90 * DAY
const TTL_CHARACTER = 30 * DAY
const TTL_PERSON = 7 * DAY
// 制作会社・ジャンルの作品の一覧（新作が加わり、人気の順も動く）
const TTL_LIST = DAY
// 条件検索の結果。期間が今のクールより前で終わるなら、作品はもう増えにくいので7日
const TTL_FIND_PAST = 7 * DAY
// MyAnimeList の ID → Annict の作品 ID。期限なし。画面が使うたびに Annict で確かめ、作品の統合などで外れたら
// 確かめた画面が題名で探して書き直すので、正確さは保たれる。片付けは必要になったら運営者が点検して手で行う
const TTL_LINK = null
// 条件検索で一度にかけるジャンルの数（すべてを持つ作品なので、多くても結果が減るだけ）
const MAX_FIND_GENRES = 10
// 対応を覚える1回の数と、受け取る本文の大きさ
const MAX_LINKS = 50
const MAX_LINK_BODY = 4096
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
      if (entries.length > 0) await pipeline(entries.map((e) => (e.ttl === null ? ['SET', e.key, e.value] : ['SET', e.key, e.value, 'EX', e.ttl])))
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

// Upstash に届かないときの、関数ごとの控えめな上限（全体の数を数えられないので、1つの関数の中だけで数える）。
// 全体の上限が外れて Shikimori に送りすぎないように。
// 画面は 0.7 秒に1回（1秒約1.4回）なので、1人なら1秒2回で引っかからない。手元・E2E（Upstash を使わない）では数えない
const LOCAL_PER_SECOND = 2
const LOCAL_PER_MINUTE = 40
const local = { sec: -1, perSec: 0, min: -1, perMin: 0 }
export function localTake(now: number): number | null {
  const sec = Math.floor(now / 1000)
  const min = Math.floor(sec / 60)
  if (sec !== local.sec) Object.assign(local, { sec, perSec: 0 })
  if (min !== local.min) Object.assign(local, { min, perMin: 0 })
  local.perSec++
  local.perMin++
  if (local.perMin > LOCAL_PER_MINUTE) return 60 - (sec % 60)
  if (local.perSec > LOCAL_PER_SECOND) return 1
  return null
}

// 控えに届かないときは、控えなしで続ける（一度失敗したら、その問い合わせの間はもう使わない）。
// 回数は、Upstash を使う設定なのに届かないときだけ、関数の中で控えめに数える（上の localTake）
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
    set: (entries: readonly { key: string; value: string; ttl: number | null }[]) => guard((s) => s.set(entries), undefined),
    take: async (now: number) => {
      if (!store) return null
      const wait = await guard((s) => s.take(now), undefined)
      return wait === undefined ? localTake(now) : wait
    },
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
// ジャンル（テーマを含む）の作品。人気順（成人向けは除く）
const GENRE_QUERY = `query($genre: String!, $page: PositiveInt!) { animes(genre: $genre, limit: ${MAX_IDS}, page: $page, order: popularity, censored: true) { ${ANIME_FIELDS} } }`
// 期間・ジャンル・制作会社で探す（成人向けは除く）。並びは2つの決まった値だけなので、問い合わせに直接書く。genre・studio は null なら絞らない
const findQuery = (order: FindOrder) =>
  `query($season: SeasonString!, $genre: String, $studio: String, $page: PositiveInt!) { animes(season: $season, genre: $genre, studio: $studio, limit: ${MAX_IDS}, page: $page, order: ${order}, censored: true) { ${ANIME_FIELDS} } }`
// 人物を名前で探す（日本語名で照合するので japanese を返す）
const PEOPLE_QUERY = `query($search: String!) { people(search: $search, limit: ${MAX_PEOPLE}) { id name japanese } }`
// 作品を題名で探す（成人向けは除く）。画面は日本語の題名で Annict を引き直すので、ID と日本語の題名だけ
const SEARCH_QUERY = `query($search: String!) { animes(search: $search, limit: ${MAX_SEARCH}, censored: true) { malId japanese } }`
// キャラクターの日本語名
const CHARACTERS_QUERY = `query($ids: String!) { characters(ids: $ids, limit: ${MAX_IDS}) { id japanese } }`
// 作品のキャラクター（ローマ字の名前と日本語名。主役・脇役の別）
const CAST_QUERY = `query($ids: String!) { animes(ids: $ids, limit: 1) { characterRoles { rolesEn character { name japanese } } } }`

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
// 作品と制作会社は、いまの版（6: 点数を付けた人の数）と、開いたままの古い画面が送る直前の2つ（4: 人気、5: 話数）。制作会社の 7 は対応を付ける。
// 人物は 2（スタッフの役割）と 4（声の出演のキャラクター）
const VERSIONS: Record<string, readonly string[]> = {
  animes: ['4', '5', '6'],
  studio: ['4', '5', '6', '7'],
  genre: ['6'],
  find: ['1'],
  person: ['2', '4'],
}

// 問い合わせの種類ごとに受け付ける引数（v は、応答の形を変えたときにクライアントが CDN の古い控えを避けるための版）
const PARAMS: Record<string, readonly string[]> = {
  animes: ['op', 'ids', 'v'],
  studio: ['op', 'id', 'page', 'v'],
  genre: ['op', 'id', 'page', 'v'],
  find: ['op', 'genre', 'studio', 'from', 'to', 'order', 'page', 'v'],
  people: ['op', 'q'],
  search: ['op', 'q'],
  person: ['op', 'id', 'v'],
  characters: ['op', 'ids'],
  similar: ['op', 'id', 'ids'],
  cast: ['op', 'id'],
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

type Trimmed = NonNullable<ReturnType<typeof trim>>
type Store = ReturnType<typeof safeStore>

// 作品ごとの控え（放送が終わった作品は長く、放送中・放送前は短く）。一覧の問い合わせで読んだ作品も入れる（あとで詳細や表紙を開くときに Shikimori へ聞かない）
const animeEntries = (animes: readonly Trimmed[]) =>
  animes.map((a) => ({ key: `${KEY}:anime:${a.id}`, value: JSON.stringify(a), ttl: a.status === 'released' ? TTL_RELEASED : TTL_CHANGING }))

// 条件検索の並び（人気順・放送日の新しい順）
type FindOrder = 'popularity' | 'aired_on'
const FIND_ORDERS: readonly string[] = ['popularity', 'aired_on']

// クール（Annict の書き方 2022-spring）→ 年 × 4 + 季節の番号。Shikimori の書き方では autumn が fall
const COURS = ['winter', 'spring', 'summer', 'autumn']
const SHIKI_COURS = ['winter', 'spring', 'summer', 'fall']
function parseCour(raw: string | null): number | null {
  const m = raw ? /^((?:19|20)[0-9]{2})-(winter|spring|summer|autumn)$/.exec(raw) : null
  return m ? Number(m[1]) * 4 + COURS.indexOf(m[2]) : null
}

// 期間（始めと終わりのクール。どちらも含む）を Shikimori の season の書き方に。並べると「どれか」で効く。
// 年をまるごと含む分は「2023_2025」にまとめ、端の年はクールを並べる（2022年 秋〜2026年 春 → fall_2022,2023_2025,winter_2026,spring_2026）
export function seasonQuery(from: number, to: number): string {
  const year = (c: number) => Math.floor(c / 4)
  const cours = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `${SHIKI_COURS[(a + i) % 4]}_${year(a + i)}`)
  const head = from % 4 === 0 ? [] : cours(from, Math.min(to, year(from) * 4 + 3))
  const firstYear = from % 4 === 0 ? year(from) : year(from) + 1
  const lastYear = to % 4 === 3 ? year(to) : year(to) - 1
  const years = firstYear > lastYear ? [] : [firstYear === lastYear ? `${firstYear}` : `${firstYear}_${lastYear}`]
  const tail = to % 4 === 3 || (year(to) === year(from) && head.length > 0) ? [] : cours(Math.max(from, year(to) * 4), to)
  return [...head, ...years, ...tail].join(',')
}

// 条件検索の引数。形は1つに決める（ジャンルは小さい順・重なりなし、ページは必ず付ける）。ジャンルか制作会社のどちらかは要る
function parseFind(q: URLSearchParams) {
  const genreRaw = q.get('genre')
  const genres = genreRaw === null ? [] : parseIds(genreRaw)
  if (!genres || genres.length > MAX_FIND_GENRES || (genreRaw !== null && genres.join(',') !== genreRaw)) return null
  const studio = q.has('studio') ? parseId(q.get('studio')) : null
  if (q.has('studio') && studio === null) return null
  if (genres.length === 0 && studio === null) return null
  const from = parseCour(q.get('from'))
  const to = parseCour(q.get('to'))
  const order = q.get('order')
  const page = parseId(q.get('page'))
  if (from === null || to === null || from > to || !order || !FIND_ORDERS.includes(order) || !page || page > MAX_LIST_PAGE) return null
  return { genres, studio, from, to, order: order as FindOrder, page }
}

async function handleFind(q: URLSearchParams, store: Store, fetchFn: FetchLike, now: () => number): Promise<Response> {
  const c = parseFind(q)
  if (!c) return fail(400, 'bad_request')
  const key = `${KEY}:find:${c.genres.join(',') || '-'}:${c.studio ?? '-'}:${q.get('from')}:${q.get('to')}:${c.order}:${c.page}`
  const [hit] = await store.get([key])
  const cached = parseJson(hit) as { animes?: unknown } | undefined | null
  let animes: Trimmed[]
  if (cached && Array.isArray(cached.animes)) {
    animes = (cached.animes as Trimmed[]).filter((a) => a && typeof a.id === 'number')
  } else {
    const wait = await store.take(now())
    if (wait !== null) return fail(429, 'rate_limited', { 'Retry-After': String(wait) })
    let upstream: Response
    try {
      upstream = await fetchFn(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          query: findQuery(c.order),
          variables: { season: seasonQuery(c.from, c.to), genre: c.genres.length > 0 ? c.genres.join(',') : null, studio: c.studio === null ? null : String(c.studio), page: c.page },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
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
    const list = (data as { data?: { animes?: RawAnime[] } } | null)?.data?.animes
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    animes = list.flatMap((a) => trim(a) ?? [])
    const d = new Date(now())
    const current = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3)
    await store.set([{ key, value: JSON.stringify({ animes }), ttl: c.to < current ? TTL_FIND_PAST : TTL_LIST }, ...animeEntries(animes)])
  }
  return respondLinked(store, animes)
}

// 作品の一覧に、その作品の分だけの Annict の作品 ID の対応を付けて返す（条件検索と、制作会社の作品の v=7）。
// 対応は控えた一覧に入れず、毎回その作品の分だけ読む（あとから覚えた対応も返せるように）
async function respondLinked(store: Store, animes: readonly Trimmed[]): Promise<Response> {
  const links = await store.get(animes.map((a) => `${KEY}:annict:${a.id}`))
  const annict: Record<string, number> = {}
  animes.forEach((a, i) => {
    const id = parseId(links[i])
    if (id) annict[a.id] = id
  })
  // 対応は増えていくので、CDN には1時間だけ
  return respond(200, { animes, annict }, 'public, s-maxage=3600, stale-while-revalidate=600')
}

// 対応を覚える。本文は {"pairs": [[MyAnimeList の ID, Annict の作品 ID], ...]}（50組まで）。
// 作品の控えに無い ID は受け付けない（任意の ID で控えを埋めさせない。控えに入るのは Shikimori に実在する作品だけ）
async function handleLink(request: Request, store: Store): Promise<Response> {
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_LINK_BODY) return fail(413, 'too_large')
  let text: string
  try {
    text = await request.text()
  } catch {
    return fail(400, 'bad_request')
  }
  if (text.length > MAX_LINK_BODY) return fail(413, 'too_large')
  const pairs = (parseJson(text) as { pairs?: unknown } | undefined | null)?.pairs
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 1e9
  if (!Array.isArray(pairs) || pairs.length === 0 || pairs.length > MAX_LINKS) return fail(400, 'bad_request')
  if (!pairs.every((p) => Array.isArray(p) && p.length === 2 && valid(p[0]) && valid(p[1]))) return fail(400, 'bad_request')
  const list = [...new Map((pairs as [number, number][]).map(([mal, annict]) => [mal, annict]))]
  const known = await store.get(list.map(([mal]) => `${KEY}:anime:${mal}`))
  await store.set(list.filter((_, i) => known[i] !== null && known[i] !== 'null').map(([mal, annict]) => ({ key: `${KEY}:annict:${mal}`, value: String(annict), ttl: TTL_LINK })))
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleShiki(request: Request, fetchFn: FetchLike = fetch, rawStore: ShikiStore | null = null, now: () => number = Date.now): Promise<Response> {
  const store = safeStore(rawStore)
  // 答えを控えてから返す
  const keep = async (key: string | null, body: unknown, ttl: number): Promise<Response> => {
    if (key) await store.set([{ key, value: JSON.stringify(body), ttl }])
    return respond(200, body, CACHE_OK)
  }
  const url = new URL(request.url)
  const q = url.searchParams
  const op = q.get('op')
  // 書き込みは対応を覚える1つだけ（引数は op だけ）
  if (request.method === 'POST' && op === 'link' && [...q.keys()].length === 1) return handleLink(request, store)
  if (request.method !== 'GET') return fail(405, 'method_not_allowed', { Allow: 'GET' })
  // 問い合わせの形を1つに決める。CDN の控えは URL ごとなので、余計な引数や並びの違う ids を付けると控えを素通りして、
  // 毎回 Shikimori に問い合わせさせられる（共有の User-Agent と出口が締め出されると、全員の表紙が出なくなる。2026-10-06 の点検）
  // 継承した名前（constructor・toString など）を拾わないよう、自分の項目だけを見る（拾うと 500 になっていた）
  const allowed = op && Object.hasOwn(PARAMS, op) ? PARAMS[op] : undefined
  const keys = [...q.keys()]
  if (!allowed || keys.some((k) => !allowed.includes(k)) || new Set(keys).size !== keys.length) return fail(400, 'bad_request')
  // 版は、使っている版だけ（上の VERSIONS。「05」のような別の綴りも通さない）
  const v = q.get('v')
  if (v !== null && !(op && Object.hasOwn(VERSIONS, op) ? VERSIONS[op] : []).includes(v)) return fail(400, 'bad_request')
  if (op === 'find') return handleFind(q, store, fetchFn, now)
  if (op === 'similar' && q.has('ids')) {
    // まとめての似た作品: 控えにある分だけ返す（Shikimori には聞かないので、回数も数えない）。控えの中身は増えていくので、CDN には控えない
    const ids = parseIds(q.get('ids'))
    if (!ids || q.has('id')) return fail(400, 'bad_request')
    const values = await store.get(ids.map((id) => `${KEY}:similar:${id}`))
    const found: Record<string, unknown> = {}
    const missing: number[] = []
    ids.forEach((id, i) => {
      const body = parseJson(values[i]) as { ids?: unknown } | null | undefined
      if (body && Array.isArray(body.ids)) found[id] = body.ids
      else missing.push(id)
    })
    return respond(200, { found, missing }, 'no-store')
  }
  if (op === 'animes' || op === 'characters') {
    const ids = parseIds(q.get('ids'))
    if (ids && ids.join(',') !== q.get('ids')) {
      // 並びや重複の違いは、そろえた URL へ送る（同じ中身は1つの控えにする）
      q.set('ids', ids.join(','))
      return new Response(null, { status: 308, headers: { Location: `${url.pathname}?${q.toString()}`, 'Cache-Control': CACHE_OK } })
    }
  }

  // 控えから答えられるものは、Shikimori に聞かずに返す
  // 制作会社の作品に、対応を付けて返すか（v=7）
  const linked = op === 'studio' && q.get('v') === '7'
  let ids: number[] = []
  let cachedAnimes: unknown[] = []
  let cachedChars: unknown[] = []
  const singleKey =
    op === 'similar' && parseId(q.get('id'))
      ? `${KEY}:similar:${q.get('id')}`
      : op === 'person' && parseId(q.get('id'))
        ? `${KEY}:person:${q.get('id')}:${q.get('v') ?? '2'}`
        : (op === 'studio' || op === 'genre') && parseId(q.get('id')) && parseId(q.get('page') ?? '1')
          ? `${KEY}:${op}:${q.get('id')}:${q.get('page') ?? '1'}`
          : op === 'cast' && parseId(q.get('id'))
            ? `${KEY}:cast:${q.get('id')}`
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
    if (linked && body && Array.isArray((body as { animes?: unknown }).animes)) return respondLinked(store, (body as { animes: Trimmed[] }).animes)
    if (!linked && body !== undefined && body !== null) return respond(200, body, CACHE_OK)
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
    } else if (op === 'studio' || op === 'genre') {
      const id = parseId(q.get('id'))
      const page = parseId(q.get('page') ?? '1')
      if (!id || !page || page > MAX_LIST_PAGE) return fail(400, 'bad_request')
      upstream = await send(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          op === 'studio' ? { query: STUDIO_QUERY, variables: { studio: String(id), page } } : { query: GENRE_QUERY, variables: { genre: String(id), page } },
        ),
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
    } else if (op === 'search') {
      const title = parseName(q.get('q'))
      if (!title) return fail(400, 'bad_request')
      upstream = await send(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: title } }),
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
    } else if (op === 'cast') {
      const id = parseId(q.get('id'))
      if (!id) return fail(400, 'bad_request')
      upstream = await send(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: CAST_QUERY, variables: { ids: String(id) } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
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

  if (op === 'animes' || op === 'studio' || op === 'genre') {
    const list = (data as { data?: { animes?: RawAnime[] } } | null)?.data?.animes
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    const animes = list.flatMap((a) => trim(a) ?? [])
    if (op !== 'animes') {
      await store.set(animeEntries(animes))
      if (!linked) return keep(singleKey, { animes }, TTL_LIST)
      if (singleKey) await store.set([{ key: singleKey, value: JSON.stringify({ animes }), ttl: TTL_LIST }])
      return respondLinked(store, animes)
    }
    // 作品ごとに控える。頼んだのに返らなかった ID も「無い」として控える（毎回聞き直さない）
    const found = new Set(animes.map((a) => a.id))
    await store.set([
      ...animeEntries(animes),
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
  if (op === 'cast') {
    // 主役を先に。日本語名は Shikimori の表記のまま返す（「漢 羅半」「響迂 / 趙迂」。Annict は名だけのこともあるので、照合は画面の側で姓と名・別名に分けて行う）。
    // 日本語名の無いキャラクターは返さない
    type RawCast = { rolesEn?: unknown; character?: { name?: unknown; japanese?: unknown } | null }
    const animes = (data as { data?: { animes?: { characterRoles?: RawCast[] | null }[] } } | null)?.data?.animes
    if (!Array.isArray(animes)) return fail(502, 'upstream_error')
    const roles = Array.isArray(animes[0]?.characterRoles) ? (animes[0].characterRoles as RawCast[]) : []
    const main = (r: RawCast) => Array.isArray(r.rolesEn) && r.rolesEn.includes('Main')
    const chars = [...roles.filter(main), ...roles.filter((r) => !main(r))].flatMap((r) => {
      const n = str(r?.character?.name)
      const ja = str(r?.character?.japanese)?.trim()
      return n && ja && n.length <= 60 && ja.length <= 60 ? [{ n, ja }] : []
    })
    return keep(singleKey, { chars: chars.slice(0, MAX_CAST) }, TTL_CHARACTER)
  }
  if (op === 'people') {
    const list = (data as { data?: { people?: { id?: unknown; name?: unknown; japanese?: unknown }[] } } | null)?.data?.people
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    return respond(200, { people: list.flatMap((x) => (num(x?.id) ? [{ id: num(x.id), name: str(x.name), japanese: str(x.japanese) }] : [])) }, CACHE_OK)
  }
  if (op === 'search') {
    const list = (data as { data?: { animes?: { malId?: unknown; japanese?: unknown }[] } } | null)?.data?.animes
    if (!Array.isArray(list)) return fail(502, 'upstream_error')
    return respond(200, {
      animes: list.flatMap((a) => {
        const id = num(a?.malId)
        const ja = str(a?.japanese)?.trim()
        return id && Number.isInteger(id) && id > 0 ? [{ id, japanese: ja && ja.length <= 200 ? ja : null }] : []
      }),
    }, CACHE_OK)
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

// 対応を覚える（POST ?op=link）
export function POST(request: Request): Promise<Response> {
  return handleShiki(request, fetch, storeFromEnv(process.env))
}
