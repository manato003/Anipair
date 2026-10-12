// 問い合わせ（質問・不具合・要望）を、問い合わせ専用の非公開リポジトリの Issue にする（送り先は環境変数 FEEDBACK_REPO）。Vercel の関数（Web 標準の Request / Response）。
// 利用者は GitHub のアカウントが無くても、アプリのフォームから送れる。GitHub のトークンはここ（サーバー）にだけ置き、ブラウザには出さない。
// 受け取ったものは Issue にするだけで、ほかに保存せず、ログにも出さない。送った人の IP アドレスなどは Issue に書かない。
// 荒らし対策: 同じオリジンからの POST だけ・大きさと長さの上限・機械の送信を見分ける隠し欄・回数の上限（Vercel Firewall）。
// 本文は GitHub の通知や参照にならないよう、コードブロックに入れ、@ と #数字 を無害にする。
//
// 注意: api/ の中のファイルはすべて関数として配備される。自己完結にして、テストは tests/ に置く（annict-token.ts と同じ）

// 関数が読む環境変数。VITE_ を付けない（付けると公開の JS に入る）
export interface FeedbackEnv {
  // GitHub の fine-grained トークン（問い合わせを入れるリポジトリの Issues: Read and write だけ）
  FEEDBACK_GITHUB_TOKEN?: string
  // 問い合わせを入れるリポジトリ（owner/name）
  FEEDBACK_REPO?: string
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// 種類（画面の選択肢と同じ）。値は Issue のラベルにもする
export const FEEDBACK_KINDS = { bug: '不具合', idea: '要望', question: '質問', other: 'その他' } as const
export type FeedbackKind = keyof typeof FEEDBACK_KINDS
// すべての問い合わせに付けるラベル（開発の課題と見分ける）
export const FROM_USERS_LABEL = '利用者から'

export const MIN_BODY = 5
export const MAX_BODY = 2000
export const MAX_CONTACT = 100
export const MAX_DEVICE = 300
// 24時間に作る Issue の数の上限（この関数を直接呼ぶスクリプトの連投で、非公開のリポジトリを埋めさせない）。
// 1つの IP ごとの回数の上限は Vercel Firewall でかける。これは IP を変えて来たときの、全体の歯止め
export const DAILY_LIMIT = 30
const DAY_MS = 24 * 60 * 60 * 1000

// 受け付ける要求の大きさ（文字数の上限より十分大きく、それ以上は読まない）
const MAX_REQUEST_BYTES = 16 * 1024

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

function fail(status: number, error: string): Response {
  return json(status, { error })
}

// 改行は \n にそろえ、タブと改行のほかの制御文字を除く
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
}

// GitHub で誰かへの通知（@名前）や、別の Issue への参照（#12）にならないよう、間に見えない文字を挟む
export function defuse(text: string): string {
  return text.replace(/@/g, '@​').replace(/#(?=\d)/g, '#​')
}

// 本文はコードブロックに入れる（リンクや書式として読まれない）。中にある ` の並びより長い囲みを使う
function fenced(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}text\n${text}\n${fence}`
}

export interface FeedbackInput {
  kind: FeedbackKind
  body: string
  contact: string | null
  device: string | null
}

// 受け取った JSON を確かめて、Issue に使える形にする。おかしければ null
export function parseFeedback(raw: unknown): FeedbackInput | null {
  if (!raw || typeof raw !== 'object') return null
  const { kind, body, contact, device } = raw as Record<string, unknown>
  // in は継承したもの（constructor・toString など）も通すので、自分の項目だけを見る（2026-10-12 のレビュー）
  if (typeof kind !== 'string' || !Object.hasOwn(FEEDBACK_KINDS, kind)) return null
  if (typeof body !== 'string') return null
  const text = clean(body).trim()
  if (text.length < MIN_BODY || text.length > MAX_BODY) return null
  const optional = (v: unknown, max: number): string | null | undefined => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v !== 'string') return undefined
    const s = clean(v).replace(/\n/g, ' ').trim()
    return s.length > max ? undefined : s || null
  }
  const c = optional(contact, MAX_CONTACT)
  const d = optional(device, MAX_DEVICE)
  if (c === undefined || d === undefined) return null
  return { kind: kind as FeedbackKind, body: text, contact: c, device: d }
}

// 利用者が書いたもの（本文・返信先・端末）は、すべてコードブロックの中に入れる。地の文に出すのは、こちらで決めた文字だけ
// （返信先などを地の文に書くと、リンクや画像・見出しを仕込めてしまう。2026-10-11 のコミットの点検）
export function issueOf(input: FeedbackInput): { title: string; body: string; labels: string[] } {
  const kind = FEEDBACK_KINDS[input.kind]
  const firstLine = input.body.split('\n').find((l) => l.trim())?.trim() ?? ''
  const head = firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine
  const meta = [`返信先: ${input.contact ?? 'なし'}`, `アプリと端末: ${input.device ?? '添えない'}`].join('\n')
  const lines = [
    `**種類**: ${kind}`,
    '',
    fenced(defuse(meta)),
    '',
    fenced(defuse(input.body)),
    '',
    '---',
    'アプリの問い合わせのフォームから送られました（api/feedback.ts）。返事が要るときは、返信先に送ります。',
  ]
  return { title: `[${kind}] ${defuse(head)}`, body: lines.join('\n'), labels: [FROM_USERS_LABEL, kind] }
}

// この24時間に、フォームから作った Issue の数。数えられなかったら null（受け付けない。読めないときは作るのもたいてい失敗する）。
// 注意: 数えてから作るまでの間に隙間があるので、同時にたくさん送られると上限を越えて作られうる（ゆるい歯止め）。
// 主な防ぎは Vercel Firewall の IP ごとの回数の上限。トークンは1つのリポジトリの Issues だけで、GitHub にも短時間に作れる数の上限がある。
// 確実に止めるには、件数をまとめて数える保存先（Vercel KV など）が要る（2026-10-11 のコミットの点検。今は足さない）
async function recentCount(repo: string, headers: Record<string, string>, fetchFn: FetchLike, at: number): Promise<number | null> {
  const since = new Date(at - DAY_MS).toISOString()
  const url = `https://api.github.com/repos/${repo}/issues?state=all&per_page=100&labels=${encodeURIComponent(FROM_USERS_LABEL)}&since=${encodeURIComponent(since)}`
  try {
    const res = await fetchFn(url, { method: 'GET', headers })
    if (!res.ok) return null
    const list = (await res.json()) as { created_at?: string }[]
    return Array.isArray(list) ? list.filter((i) => typeof i.created_at === 'string' && Date.parse(i.created_at) >= at - DAY_MS).length : null
  } catch {
    return null
  }
}

export async function handleFeedback(request: Request, env: FeedbackEnv, fetchFn: FetchLike = fetch, now: () => number = Date.now): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'method_not_allowed')
  const token = env.FEEDBACK_GITHUB_TOKEN?.trim()
  const repo = env.FEEDBACK_REPO?.trim()
  // どれが足りないかは外に教えない
  if (!token || !repo || !REPO_PATTERN.test(repo)) return fail(503, 'not_configured')

  // このサイトの画面から送られたものだけ受け付ける（ブラウザは POST に Origin を付ける）
  const origin = request.headers.get('origin')
  if (origin !== new URL(request.url).origin) return fail(403, 'origin_not_allowed')

  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > MAX_REQUEST_BYTES) return fail(413, 'too_large')
  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_REQUEST_BYTES) return fail(413, 'too_large')
    raw = JSON.parse(text)
  } catch {
    return fail(400, 'bad_request')
  }
  // 人には見えない欄に何か入っていたら、機械の送信とみなして、受け付けたふりをして捨てる
  const trap = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).website : undefined
  if (typeof trap === 'string' && trap !== '') return json(201, { ok: true })

  const input = parseFeedback(raw)
  if (!input) return fail(400, 'bad_request')

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'Anipair feedback (https://anipair.vercel.app/)',
  }
  const recent = await recentCount(repo, headers, fetchFn, now())
  if (recent === null) return fail(502, 'upstream_error')
  if (recent >= DAILY_LIMIT) return fail(429, 'daily_limit')

  let res: Response
  try {
    res = await fetchFn(`https://api.github.com/repos/${repo}/issues`, { method: 'POST', headers, body: JSON.stringify(issueOf(input)) })
  } catch {
    return fail(502, 'upstream_unreachable')
  }
  if (!res.ok) return fail(502, 'upstream_error')
  return json(201, { ok: true })
}

export function POST(request: Request): Promise<Response> {
  return handleFeedback(request, process.env)
}
