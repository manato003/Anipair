// 「Annict でログイン」のトークン交換。Vercel の関数（Web 標準の Request / Response）。
// Annict の OAuth はトークンの交換に client_secret が要る（PKCE 非対応）ので、秘密をブラウザに出さないためにここだけ関数を使う。
// 受け取った code を Annict に渡して、返ってきた access_token をそのまま返すだけ。何も保存せず、code・トークン・秘密をログに出さない。
// 例外は接続元ごとの回数だけ（2026-11-10）: IP を分の番号と混ぜたハッシュで、1分の回数を Upstash に2分だけ置く（下の EXCHANGES_PER_CLIENT_PER_MINUTE）。
//
// 注意: api/ の中のファイルはすべて関数として配備される。このファイルは自己完結にして、テストは tests/ に置く
// （api/ の中に別の .ts を置いて import すると、配備時の解決が不確かになるため）

const ANNICT_TOKEN_URL = 'https://api.annict.com/oauth/token'
// アプリ名と連絡先。Annict は「機械的に送るなら User-Agent に入れてほしい（負荷が高いとき、遮断の前に連絡できる）」としている
// （開発者向けヘルプ「Annictのレート制限」、2026-10-25）。ブラウザからの呼び出しには付けられないので、ここだけ
const USER_AGENT = 'Anipair (https://anipair.com/)'

// 関数が読む環境変数。VITE_ を付けない（付けると公開の JS に入る）
export interface TokenEnv {
  ANNICT_CLIENT_ID?: string
  ANNICT_CLIENT_SECRET?: string
  // 許可するリダイレクト先（カンマ区切り）。例: https://example.vercel.app/,http://localhost:3000/
  ANNICT_REDIRECT_URIS?: string
  // 接続元ごとの回数を数える Upstash（Vercel の連携が入れる名前。api/shiki.ts・api/tier.ts と同じデータベース）。無ければ数えない
  KV_REST_API_URL?: string
  KV_REST_API_TOKEN?: string
  UPSTASH_REDIS_REST_URL?: string
  UPSTASH_REDIS_REST_TOKEN?: string
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// 1つの接続元から Annict へトークンの交換を送らせる数（1分。2026-11-10、Fable の点検の F7）。
// でたらめな code を送り続けると、Anipair の client_secret で失敗の交換を何度も Annict に送らせられる（Annict から Anipair が乱暴に見える）。
// Origin が無い呼び出しは curl で偽れるので、断っても効かない。Vercel Firewall の回数のルールは Hobby では1つで、ほかに使っている。
// ふつうのログインは1回なので届かない。全体の上限は置かない（置くと、それを使い切って全員のログインを止められる）
export const EXCHANGES_PER_CLIENT_PER_MINUTE = 10
const COUNTER_KEY = 'annict-token:1:c'
const COUNTER_TIMEOUT_MS = 1500

// 接続元ごとの回数（Upstash Redis。テストでは偽物を渡す）。数えた後の値を返す
export interface ExchangeCounter {
  count(key: string): Promise<number>
}

// Upstash の REST（pipeline）。SDK を入れずに fetch で話す（api/shiki.ts と同じ）
export function upstashCounter(url: string, token: string, fetchFn: FetchLike = fetch): ExchangeCounter {
  return {
    async count(key) {
      const full = `${COUNTER_KEY}:${key}`
      const res = await fetchFn(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
          ['INCR', full],
          ['EXPIRE', full, 120],
        ]),
        signal: AbortSignal.timeout(COUNTER_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error('store')
      const out = (await res.json()) as { result?: unknown; error?: unknown }[]
      if (!Array.isArray(out) || out.some((x) => x?.error)) throw new Error('store')
      return Number(out[0]?.result)
    },
  }
}

export function counterFromEnv(env: TokenEnv): ExchangeCounter | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? upstashCounter(url, token) : null
}

// 接続元（Vercel が付ける）。IPv6 は /64 にまとめる。分からなければ空（api/shiki.ts の clientOf と同じ。自己完結にするため写してある）
export function clientOf(request: Request): string {
  const ip = (request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim()
  if (!ip.includes(':')) return ip
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (v4) return v4[1]
  const [head, tail] = ip.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
  return `${groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

// 接続元を、分の番号と混ぜたハッシュにする（IP そのものは置かない）
async function clientHash(ip: string, now: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${Math.floor(now / 60000)}:${ip}`))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 接続元の上限を超えていたら待つ秒数、超えていなければ null。Upstash に届かないときは数えずに通す（ログインを止めない）
async function overLimit(request: Request, counter: ExchangeCounter | null, now: number): Promise<number | null> {
  const ip = clientOf(request)
  if (!counter || !ip) return null
  let n: number
  try {
    n = await counter.count(await clientHash(ip, now))
  } catch {
    return null
  }
  return n > EXCHANGES_PER_CLIENT_PER_MINUTE ? 60 - (Math.floor(now / 1000) % 60) : null
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    // トークンを含むので、どこにも控えさせない
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  })
}

function fail(status: number, error: string, extra?: Record<string, string>): Response {
  return json(status, { error }, extra)
}

function allowedRedirects(env: TokenEnv): string[] {
  return (env.ANNICT_REDIRECT_URIS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// code は短い英数字の文字列。長すぎるものや変な文字は Annict に渡さない
const CODE_PATTERN = /^[A-Za-z0-9._~+/=-]{1,512}$/
// Annict のトークン交換を待つ上限
const UPSTREAM_TIMEOUT_MS = 10_000
// 受け付ける要求の大きさ（code と redirectUri だけなので小さい）
const MAX_REQUEST_BYTES = 4 * 1024

// 本文を上限のバイト数まで読む。超えたら読むのをやめて null（Content-Length が無い・偽りでも、上限より多くは読まない。
// 前は全部読んでから文字数で見ていた）
async function readLimited(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > max) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(all)
}

export async function exchangeToken(
  request: Request,
  env: TokenEnv,
  fetchFn: FetchLike = fetch,
  counter: ExchangeCounter | null = null,
  now: () => number = Date.now,
): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'method_not_allowed', { Allow: 'POST' })

  const clientId = env.ANNICT_CLIENT_ID?.trim()
  const clientSecret = env.ANNICT_CLIENT_SECRET?.trim()
  const allowed = allowedRedirects(env)
  // どれが足りないかは外に教えない
  if (!clientId || !clientSecret || allowed.length === 0) return fail(500, 'server_not_configured')

  let body: unknown
  try {
    const text = await readLimited(request, MAX_REQUEST_BYTES)
    if (text === null) return fail(413, 'too_large')
    body = JSON.parse(text)
  } catch {
    return fail(400, 'bad_request')
  }
  const { code, redirectUri } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (typeof code !== 'string' || !CODE_PATTERN.test(code) || typeof redirectUri !== 'string') return fail(400, 'bad_request')

  // 許可した一覧にあるものだけ受け付ける（ほかの場所に code を送らせない）
  if (!allowed.includes(redirectUri)) return fail(400, 'redirect_uri_not_allowed')

  // ブラウザは POST に Origin を付ける。ログインしたページ（= リダイレクト先）以外から呼ばれたものは断る
  const origin = request.headers.get('origin')
  if (origin !== null) {
    let expected: string
    try {
      expected = new URL(redirectUri).origin
    } catch {
      // 一覧の書き間違い。URL として読めないものは使えない
      return fail(500, 'server_not_configured')
    }
    if (origin !== expected) return fail(403, 'origin_not_allowed')
  }

  // Annict に送るものだけ、接続元ごとに数える（入力の検査で断ったものは数えない）
  const wait = await overLimit(request, counter, now())
  if (wait !== null) return fail(429, 'rate_limited', { 'Retry-After': String(wait) })

  let res: Response
  try {
    res = await fetchFn(ANNICT_TOKEN_URL, {
      // Annict が答えないとき、ログインを待たせ続けない
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
  } catch {
    return fail(502, 'upstream_unreachable')
  }
  // code が古い・使用済みなど。利用者がやり直せば直る
  if (res.status === 400 || res.status === 401) return fail(400, 'invalid_grant')
  if (!res.ok) return fail(502, 'upstream_error')

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return fail(502, 'upstream_error')
  }
  const token = data && typeof data === 'object' ? (data as Record<string, unknown>).access_token : undefined
  if (typeof token !== 'string' || !token) return fail(502, 'upstream_error')
  // 返すのは access_token だけ（Annict の返したほかの項目は渡さない）
  return json(200, { access_token: token })
}

export function POST(request: Request): Promise<Response> {
  return exchangeToken(request, process.env, fetch, counterFromEnv(process.env))
}
