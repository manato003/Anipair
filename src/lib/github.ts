// GitHub の private リポジトリに置いた JSON を読み書きする（Contents API）。
// Annict に置き場所の無いデータと、全記録のバックアップだけをここに置く。
// リポジトリは利用者ごとに違うので、トークンとあわせて「つなぎ」として受け取る

// 利用者が設定でつないだ GitHub。トークンとリポジトリ（owner/name）の両方がそろったときだけ作る
export interface GithubConnection {
  token: string
  repo: string
}

export type GitHubErrorKind = 'auth' | 'conflict' | 'network' | 'api'

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind
  constructor(message: string, kind: GitHubErrorKind) {
    super(message)
    this.kind = kind
  }
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

// 利用制限の応答か: 残り回数 0（x-ratelimit-remaining）、待ち時間の指示（retry-after）、本文の "rate limit"。429 はそれだけで制限
async function isRateLimited(res: Response): Promise<boolean> {
  if (res.status === 429) return true
  if (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.get('retry-after') !== null) return true
  try {
    const body = (await res.clone().json()) as { message?: unknown }
    return typeof body.message === 'string' && /rate limit/i.test(body.message)
  } catch {
    return false
  }
}

async function call(url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new GitHubError('GitHub に接続できませんでした。通信を確認してください', 'network')
  }
  // 403 は、利用制限（レート制限）でも返る。トークンの問題と分けないと、入れ直しを促してしまう
  if ((res.status === 403 || res.status === 429) && (await isRateLimited(res))) {
    throw new GitHubError('GitHub の利用制限に達しました。しばらく待ってからもう一度試してください', 'api')
  }
  if (res.status === 401 || res.status === 403) {
    throw new GitHubError('GitHub のトークンが使えません。設定で入れ直してください', 'auth')
  }
  // 409: 他の端末が先に書いた / 422: sha が古い
  if (res.status === 409 || res.status === 422) throw new GitHubError('他の端末と同時に書き込みました', 'conflict')
  return res
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export interface RemoteJson {
  value: unknown
  // ファイルがまだ無ければ null
  sha: string | null
}

export async function readJson(conn: GithubConnection, path: string): Promise<RemoteJson> {
  const res = await call(`https://api.github.com/repos/${conn.repo}/contents/${path}`, { headers: headers(conn.token), cache: 'no-store' })
  if (res.status === 404) return { value: null, sha: null }
  if (!res.ok) throw new GitHubError(`GitHub がエラーを返しました（HTTP ${res.status}）`, 'api')
  const json = (await res.json()) as { content: string; sha: string }
  try {
    return { value: JSON.parse(fromBase64(json.content)), sha: json.sha }
  } catch {
    // 壊れていたら空として扱い、次の書き込みで上書きする（履歴は git に残る）
    return { value: null, sha: json.sha }
  }
}

// リポジトリに置く JSON の書式。ファイルに書き出すバックアップも同じ書式にして、同じ中身が同じバイト列になるようにする
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 1) + '\n'
}

export async function writeJson(conn: GithubConnection, path: string, value: unknown, sha: string | null, message: string): Promise<void> {
  const res = await call(`https://api.github.com/repos/${conn.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(conn.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: toBase64(formatJson(value)), ...(sha ? { sha } : {}) }),
  })
  if (!res.ok) throw new GitHubError(`GitHub に保存できませんでした（HTTP ${res.status}）`, 'api')
}

// トークンでデータのリポジトリに届くかを確かめる
export async function checkAccess(conn: GithubConnection): Promise<void> {
  const res = await call(`https://api.github.com/repos/${conn.repo}`, { headers: headers(conn.token) })
  if (res.status === 404) {
    throw new GitHubError(`このトークンでは ${conn.repo} が見えません。リポジトリ名と、トークンの対象リポジトリを確認してください`, 'auth')
  }
  if (!res.ok) throw new GitHubError(`GitHub がエラーを返しました（HTTP ${res.status}）`, 'api')
}
