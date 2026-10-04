import { loadOauthState, saveOauthState } from './storage'

// 「Annict でログイン」（OAuth の認可コードフロー）。
// ログインのボタン → Annict の画面 → このアプリの `/?code=…&state=…` に戻る → /api/annict-token で code をトークンに換える。
// トークンの交換には client_secret が要るので、そこだけサーバー側の関数（api/annict-token.ts）に任せている

const AUTHORIZE_URL = 'https://annict.com/oauth/authorize'
const TOKEN_ENDPOINT = '/api/annict-token'
// 読み込みと書き込み（評価や状態を付けるため）
const SCOPE = 'read write'

// client_id は公開してよい値。無い環境（ローカルの開発など）では、ログインのボタンを出さない。
// import.meta.env は名前で1つずつ読む。丸ごと渡すと、Vite が VITE_ で始まる値を全部配信物に書き込む
// （Vercel がビルドに渡すコミットメッセージ・作者名・非公開リポジトリの名前まで入っていた。2026-10-04 に気づいて直した）
export function annictClientId(env: { VITE_ANNICT_CLIENT_ID?: string } = { VITE_ANNICT_CLIENT_ID: import.meta.env.VITE_ANNICT_CLIENT_ID }): string | null {
  const id = env.VITE_ANNICT_CLIENT_ID?.trim()
  return id ? id : null
}

// 戻り先はサイトの先頭。Annict に登録するリダイレクト URI と、関数の許可一覧は、この形（末尾のスラッシュまで）にそろえる
export function redirectUriFor(origin: string): string {
  return `${origin}/`
}

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ client_id: p.clientId, response_type: 'code', redirect_uri: p.redirectUri, scope: SCOPE, state: p.state })
  return `${AUTHORIZE_URL}?${q.toString()}`
}

// 推測されない乱数（なりすましたログインの戻りを断るための印）
export function newState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// ログイン画面へ移る。戻ってきたときに照合できるよう、state をこのタブに控えておく
export function startLogin(p: { clientId: string; origin: string; assign: (url: string) => void; state?: string }): void {
  const state = p.state ?? newState()
  saveOauthState(state)
  p.assign(buildAuthorizeUrl({ clientId: p.clientId, redirectUri: redirectUriFor(p.origin), state }))
}

const CALLBACK_PARAMS = ['code', 'state', 'error', 'error_description']

// いまのアドレスが、Annict から戻ってきたものか（state に加えて、code か error がある）
export function hasCallback(search: string): boolean {
  const q = new URLSearchParams(search)
  return q.has('state') && (q.has('code') || q.has('error'))
}

// 戻ってきたあと、アドレスからログインの印だけを取り除いたもの（code を履歴やブックマークに残さない）。ほかの検索語とハッシュは残す
export function withoutCallback(pathname: string, search: string, hash: string): string {
  const q = new URLSearchParams(search)
  for (const k of CALLBACK_PARAMS) q.delete(k)
  const rest = q.toString()
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`
}

export type LoginResult = { kind: 'token'; token: string } | { kind: 'error'; message: string }

const MESSAGES: Record<string, string> = {
  denied: 'Annict でのログインがキャンセルされました。',
  state: 'ログインの確認に失敗しました。もう一度「Annict でログイン」を押してください。',
  invalid_grant: 'ログインの有効期限が切れたか、すでに使われています。もう一度「Annict でログイン」を押してください。',
  server_not_configured: 'このサイトでは、Annict でのログインがまだ設定されていません。',
  network: 'ログインの受け渡しに接続できませんでした。通信を確認して、もう一度試してください。',
  unavailable: 'ログインの受け渡しが動いていません。個人用アクセストークンを使うか、少し待ってからもう一度試してください。',
}

function failure(key: string): LoginResult {
  return { kind: 'error', message: MESSAGES[key] ?? 'ログインに失敗しました。もう一度試してください。' }
}

// Annict から戻ってきたアドレスを処理する。state を照合し、code を関数に渡してトークンを受け取る。
// 控えておいた state は、成功しても失敗しても1回で捨てる（同じ戻りを2度使わせない）。トークンの保存は呼んだ側が行う
export async function completeLogin(p: { search: string; origin: string; fetchFn?: (url: string, init?: RequestInit) => Promise<Response> }): Promise<LoginResult> {
  const q = new URLSearchParams(p.search)
  const expected = loadOauthState()
  saveOauthState(null)
  const state = q.get('state')
  if (!expected || !state || state !== expected) return failure('state')
  if (q.has('error')) return failure(q.get('error') === 'access_denied' ? 'denied' : 'unknown')
  const code = q.get('code')
  if (!code) return failure('unknown')

  const fetchFn = p.fetchFn ?? fetch
  let res: Response
  try {
    res = await fetchFn(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri: redirectUriFor(p.origin) }),
    })
  } catch {
    return failure('network')
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    // 関数が無い（ローカルの開発サーバーなど）と、JSON でない 404 が返る
    return failure('unavailable')
  }
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (res.ok && typeof data.access_token === 'string' && data.access_token) return { kind: 'token', token: data.access_token }
  return failure(typeof data.error === 'string' ? data.error : 'unknown')
}
