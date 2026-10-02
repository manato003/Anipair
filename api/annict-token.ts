// 「Annict でログイン」のトークン交換。Vercel の関数（Web 標準の Request / Response）。
// Annict の OAuth はトークンの交換に client_secret が要る（PKCE 非対応）ので、秘密をブラウザに出さないためにここだけ関数を使う。
// 受け取った code を Annict に渡して、返ってきた access_token をそのまま返すだけ。何も保存せず、code・トークン・秘密をログに出さない。
//
// 注意: api/ の中のファイルはすべて関数として配備される。このファイルは自己完結にして、テストは tests/ に置く
// （api/ の中に別の .ts を置いて import すると、配備時の解決が不確かになるため）

const ANNICT_TOKEN_URL = 'https://api.annict.com/oauth/token'

// 関数が読む環境変数。VITE_ を付けない（付けると公開の JS に入る）
export interface TokenEnv {
  ANNICT_CLIENT_ID?: string
  ANNICT_CLIENT_SECRET?: string
  // 許可するリダイレクト先（カンマ区切り）。例: https://example.vercel.app/,http://localhost:3000/
  ANNICT_REDIRECT_URIS?: string
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

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

export async function exchangeToken(request: Request, env: TokenEnv, fetchFn: FetchLike = fetch): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'method_not_allowed', { Allow: 'POST' })

  const clientId = env.ANNICT_CLIENT_ID?.trim()
  const clientSecret = env.ANNICT_CLIENT_SECRET?.trim()
  const allowed = allowedRedirects(env)
  // どれが足りないかは外に教えない
  if (!clientId || !clientSecret || allowed.length === 0) return fail(500, 'server_not_configured')

  let body: unknown
  try {
    body = await request.json()
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

  let res: Response
  try {
    res = await fetchFn(ANNICT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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
  return exchangeToken(request, process.env)
}
