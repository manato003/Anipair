// Tier表の共有のリンク（Vercel の関数。Web 標準の Request / Response）。
// 利用者が作った Tier表を短い ID（/t/<ID>）で置き、リンクを知っている人なら誰でも、ログインしなくても見られるようにする。
//
// 置くのは表の題名・段の名前・作品の MyAnimeList の ID と並びだけ（Annict の名前・トークン・作品の評価は受け取らない）。
// 期限はなく、作った人が消せる。作るときに「編集の鍵」を返し、ここには鍵のハッシュだけを置く（鍵は作った人の端末と、その人の GitHub にだけある）。
//
//   GET    ?id=ID      表の中身（CDN で少し控える。直した・消したあとは、控えが切れるまで前の中身が出ることがある）
//   GET    ?page=ID    /t/<ID> の HTML（vercel.json の rewrites で来る）。index.html の題名と OGP をその表のものにして返す
//   GET    ?image=ID   貼ったときのカードの画像（PNG。題名と段の色・名前・作品の数だけ。表紙は入れない）
//   POST               表を作る → { id, key }
//   PUT    ?id=ID      表の中身を新しくする（Authorization: Bearer <鍵>）
//   DELETE ?id=ID      表を消す（Authorization: Bearer <鍵>）
// 作る・直す・消すは、このサイトの画面から（Origin が同じ）だけ受け付ける。
// 作る回数は、接続元ごと（IP のハッシュ。1日で消える）と全体で1日の上限を数える（Vercel Firewall の回数の制限とあわせて使う）。
// 何もログに出さない。
//
// 保存先は Upstash Redis（環境変数 KV_REST_API_URL・KV_REST_API_TOKEN。Shikimori の中継の控えと同じデータベース）。
// 中継の控えはすべて期限つきで、表は期限なし。Upstash の Eviction は期限つきの鍵から消すので、表は後回しになる。
//
// 注意: api/ の中のファイルはすべて関数として配備される。自己完結にして、テストは tests/ に置く（annict-token.ts と同じ）

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

// 表の形の上限（画面の側の src/features/tier/tierList.ts と同じにする）
export const TITLE_MAX = 40
export const TIER_NAME_MAX = 12
export const TIER_MIN = 2
export const TIER_MAX = 10
// 1つの表に入れられる作品の数（見た作品すべての表で千件を超える人がいる）
export const ITEMS_MAX = 2000
const MAX_REQUEST_BYTES = 48 * 1024

// 作る回数の上限（1日）。接続元ごとと、全体
export const CREATE_PER_IP = 20
export const CREATE_PER_DAY = 1000

// ID は英数字10文字（62^10、約59ビット）。順に試して当てられない長さにする
const ID_LENGTH = 10
const ID_PATTERN = /^[0-9A-Za-z]{10}$/
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// 保存の名前の版（置く形を変えたら上げる）
const KEY = 'tier:1'
const STORE_TIMEOUT_MS = 3000

// 読むのは1分 CDN に置く。直した・消したあと、長く前の中身を出さないよう短くする
const CACHE_READ = 'public, s-maxage=60, stale-while-revalidate=60'

export interface SharedTier {
  name: string
  items: number[]
}

export interface SharedTable {
  title: string
  tiers: SharedTier[]
}

// 置く形（鍵のハッシュは読む人に返さない）
interface Stored extends SharedTable {
  hash: string
  createdAt: string
  updatedAt: string
}

export interface TierStore {
  get(id: string): Promise<string | null>
  // 無いときだけ置く。置けたら true
  create(id: string, value: string): Promise<boolean>
  // あるときだけ置き換える。置けたら true
  replace(id: string, value: string): Promise<boolean>
  remove(id: string): Promise<void>
  // 今日の数を1つ増やして返す（1日で消える）
  count(name: string, day: string): Promise<number>
}

// Upstash の REST（pipeline）。SDK を入れずに fetch で話す（api/shiki.ts と同じ）
export function upstashStore(url: string, token: string, fetchFn: FetchLike = fetch): TierStore {
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
    async get(id) {
      const [v] = await pipeline([['GET', `${KEY}:t:${id}`]])
      return typeof v === 'string' ? v : null
    },
    async create(id, value) {
      const [v] = await pipeline([['SET', `${KEY}:t:${id}`, value, 'NX']])
      return v === 'OK'
    },
    async replace(id, value) {
      const [v] = await pipeline([['SET', `${KEY}:t:${id}`, value, 'XX']])
      return v === 'OK'
    },
    async remove(id) {
      await pipeline([['DEL', `${KEY}:t:${id}`]])
    },
    async count(name, day) {
      const key = `${KEY}:n:${name}:${day}`
      const [n] = await pipeline([['INCR', key], ['EXPIRE', key, 2 * 86400]])
      return Number(n)
    },
  }
}

// 手元の開発サーバーと、テストで使う控え（関数を起動し直すと消える）
export function memoryStore(): TierStore {
  const data = new Map<string, string>()
  const counts = new Map<string, number>()
  return {
    get: async (id) => data.get(id) ?? null,
    create: async (id, value) => {
      if (data.has(id)) return false
      data.set(id, value)
      return true
    },
    replace: async (id, value) => {
      if (!data.has(id)) return false
      data.set(id, value)
      return true
    },
    remove: async (id) => {
      data.delete(id)
    },
    count: async (name, day) => {
      const n = (counts.get(`${name}:${day}`) ?? 0) + 1
      counts.set(`${name}:${day}`, n)
      return n
    },
  }
}

export function storeFromEnv(env: Record<string, string | undefined>): TierStore | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? upstashStore(url, token) : null
}

function json(status: number, body: unknown, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache } })
}

const fail = (status: number, error: string, cache = 'no-store') => json(status, { error }, cache)

// 本文を上限のバイト数まで読む。超えたら null（api/feedback.ts と同じ）
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

// 1行の文字（改行・制御文字・書字方向を変える文字を除き、前後の空白を落として上限で切る）
function line(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').trim()
  const chars = [...s]
  return chars.length <= max ? s : null
}

// 受け取った表を確かめる。おかしければ null（直して受け付けることはしない）
export function parseShared(raw: unknown): SharedTable | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { title, tiers } = raw as Record<string, unknown>
  const t = line(title, TITLE_MAX)
  if (t === null || !Array.isArray(tiers) || tiers.length < TIER_MIN || tiers.length > TIER_MAX) return null
  const seen = new Set<number>()
  const out: SharedTier[] = []
  for (const tier of tiers) {
    if (!tier || typeof tier !== 'object' || Array.isArray(tier)) return null
    const { name, items } = tier as Record<string, unknown>
    const n = line(name, TIER_NAME_MAX)
    if (!n || !Array.isArray(items)) return null
    for (const id of items) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > 999_999_999 || seen.has(id)) return null
      seen.add(id)
    }
    if (seen.size > ITEMS_MAX) return null
    out.push({ name: n, items: items as number[] })
  }
  return { title: t, tiers: out }
}

function parseStored(v: string | null): Stored | null {
  if (v === null) return null
  try {
    const o = JSON.parse(v) as Stored
    return o && typeof o.hash === 'string' && Array.isArray(o.tiers) ? o : null
  } catch {
    return null
  }
}

function randomId(): string {
  // 62 の倍数に収まる値だけを使い、文字の出方を偏らせない
  const out: string[] = []
  while (out.length < ID_LENGTH) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    for (const b of bytes) if (b < 248 && out.length < ID_LENGTH) out.push(ALPHABET[b % 62])
  }
  return out.join('')
}

function randomKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 鍵のハッシュを比べる（長さが同じ16進どうしを、途中で止めずに比べる）
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function bearer(request: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') ?? '')
  return m ? m[1] : null
}

// 接続元（Vercel が付ける）。分からなければ空
function clientIp(request: Request): string {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

// index.html の題名と説明を、その表のものにする（OGP は X・Discord・LINE などに貼ったときのカード）。
// 表が無いときは index.html のまま返す（画面が「見つかりません」を出す）
export function pageHtml(template: string, table: SharedTable | null, url: string, image?: string): string {
  if (!table) return template
  const title = `${table.title || 'Tier表'} | Anipair`
  const count = table.tiers.reduce((n, t) => n + t.items.length, 0)
  const description = `${table.tiers.map((t) => t.name).join('・')}の${table.tiers.length}段に${count}作品を並べたTier表です。Anipairで作られました。`
  const meta = [
    ['og:type', 'website'],
    ['og:site_name', 'Anipair'],
    ['og:title', title],
    ['og:description', description],
    ['og:url', url],
    ...(image
      ? [
          ['og:image', image],
          ['og:image:width', String(CARD_WIDTH)],
          ['og:image:height', String(CARD_HEIGHT)],
          ['og:image:alt', `${table.title || 'Tier表'}（${table.tiers.length}段のTier表）`],
        ]
      : []),
  ]
    .map(([p, c]) => `<meta property="${p}" content="${escapeHtml(c)}" />`)
    .concat(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`)
    .join('\n    ')
  // 置き換えは関数で渡す（文字列で渡すと、題名の中の $& や $' が置き換えの記号として読まれる）
  return template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>\n    ${meta}`)
    .replace(/(<meta name="description" content=")[^"]*(")/, (_, head: string, tail: string) => `${head}${escapeHtml(description)}${tail}`)
}

// ビルドした index.html（vercel.json の functions.includeFiles でこの関数に含める）
async function readTemplate(): Promise<string | null> {
  try {
    return await readFile(join(process.cwd(), 'dist', 'index.html'), 'utf-8')
  } catch {
    return null
  }
}

// ---- カードの画像（og:image。1200×630 の PNG）----
// 表の題名と、段の色・名前・作品の数だけを描く。表紙は入れない（作品の数は空の枠で表す）。
// 書体に無い字は描かない（足りない字を外へ取りに行かない。@vercel/og を使わないのはそのため）

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

export interface CardAssets {
  // Zen Maru Gothic Bold（fonts/。OFL）
  font: Buffer
  // ロゴの印（public/logo-mark-on-dark.svg）の data URI
  logo: string
}

// 段の色（画面の側の src/features/tier/tierList.ts の tierColor と同じ式。satori が読める #rrggbb にする）
export function cardTierColor(index: number, count: number): string {
  const step = count > 1 ? Math.min(36, 270 / (count - 1)) : 0
  const h = Math.round(index * step)
  const s = 0.85
  const l = 0.72
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

interface CardNode {
  type: string
  props: Record<string, unknown>
}

function node(type: string, style: Record<string, unknown>, children?: unknown, attrs: Record<string, unknown> = {}): CardNode {
  return { type, props: { ...attrs, style, children } }
}

const CARD_PAD = 56
const PANEL_WIDTH = 600
const LABEL_WIDTH = 136
const CREAM = '#fffaf3'

function cardRow(tier: SharedTier, index: number, count: number, height: number): CardNode {
  const name = [...tier.name]
  const nameSize = Math.round(Math.max(16, Math.min(height * 0.42, 40, 220 / Math.max(name.length, 1))))
  // 作品の数だけ空の枠を並べ、入りきらない分は「+N」
  const boxH = Math.min(height - 18, 88)
  const boxW = Math.round(boxH * 0.7)
  const room = PANEL_WIDTH - LABEL_WIDTH - 24
  const fit = Math.max(1, Math.floor((room + 8) / (boxW + 8)))
  const n = tier.items.length
  const shown = n > fit ? fit - 1 : n
  const boxes: CardNode[] = Array.from({ length: shown }, () =>
    node('div', { width: boxW, height: boxH, borderRadius: 6, background: 'rgba(255,250,243,0.12)', flexShrink: 0 }),
  )
  if (n > shown) {
    boxes.push(node('div', { height: boxH, display: 'flex', alignItems: 'center', paddingLeft: 6, color: 'rgba(255,250,243,0.75)', fontSize: Math.max(18, Math.min(28, Math.round(boxH * 0.4))) }, `+${n - shown}`))
  }
  return node(
    'div',
    { display: 'flex', height, borderTop: index === 0 ? 'none' : '2px solid rgba(255,250,243,0.10)' },
    [
      node(
        'div',
        { width: LABEL_WIDTH, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cardTierColor(index, count), color: '#1c1b1f', fontSize: nameSize, textAlign: 'center', padding: '0 8px', lineHeight: 1.1 },
        tier.name,
      ),
      node('div', { flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }, boxes),
    ],
  )
}

export function cardTree(table: SharedTable, logo: string): CardNode {
  const title = table.title || 'Tier表'
  const len = [...title].length
  // 短い題名は1行に収まる大きさにする（左の列は幅440px。1文字だけ次の行に落ちないように）
  const titleSize = len <= 8 ? Math.min(68, Math.floor(440 / len)) : len <= 16 ? 52 : len <= 30 ? 44 : 40
  const panelH = CARD_HEIGHT - CARD_PAD * 2
  const rowH = Math.floor((panelH - 4) / table.tiers.length)
  return node(
    'div',
    { width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', padding: CARD_PAD, gap: 48, background: 'linear-gradient(160deg, #7d4622 0%, #4a2914 100%)', color: CREAM, fontFamily: 'Zen Maru Gothic' },
    [
      node('div', { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }, [
        node('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
          node('img', { width: 60, height: 60 }, undefined, { src: logo, width: 60, height: 60 }),
          node('div', { fontSize: 44, letterSpacing: 1 }, 'Anipair'),
        ]),
        node('div', { display: 'flex', flexDirection: 'column', gap: 16 }, [
          node('div', { fontSize: 26, color: 'rgba(255,250,243,0.7)' }, 'Tier表'),
          node('div', { fontSize: titleSize, lineHeight: 1.3, lineClamp: 4, wordBreak: 'break-all' }, title),
        ]),
        node('div', { fontSize: 24, color: 'rgba(255,250,243,0.7)' }, 'anipair.com'),
      ]),
      node(
        'div',
        { width: PANEL_WIDTH, height: panelH, display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden', border: '2px solid rgba(255,250,243,0.14)', background: 'rgba(28,16,8,0.35)' },
        table.tiers.map((t, i) => cardRow(t, i, table.tiers.length, rowH)),
      ),
    ],
  )
}

// satori と resvg は描くときだけ読み込む（読み込みで落ちても、表を作る・読むは巻き込まない。
// satori の harfbuzzjs は読み込んだ時点で hb.wasm を読むので、関数に含め忘れると関数ごと起動できなくなった）
type CardLibs = { satori: typeof import('satori').default; Resvg: typeof import('@resvg/resvg-wasm').Resvg }
let cardLibs: Promise<CardLibs> | null = null

function loadCardLibs(): Promise<CardLibs> {
  cardLibs ??= (async () => {
    const [{ default: satori }, { Resvg, initWasm }] = await Promise.all([import('satori'), import('@resvg/resvg-wasm')])
    await initWasm(await readFile(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm')))
    return { satori, Resvg }
  })().catch((e: unknown) => {
    cardLibs = null
    throw e
  })
  return cardLibs
}

export async function renderCard(table: SharedTable, assets: CardAssets): Promise<Uint8Array> {
  const { satori, Resvg } = await loadCardLibs()
  // satori の型は React の要素を求めるが、中身は { type, props } の木で足りる
  const svg = await satori(cardTree(table, assets.logo) as unknown as Parameters<typeof satori>[0], {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: [{ name: 'Zen Maru Gothic', data: assets.font, weight: 700, style: 'normal' }],
  })
  return new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } }).render().asPng()
}

// 書体とロゴ（vercel.json の functions.includeFiles でこの関数に含める）。一度読んだら使い回す
let cardAssets: Promise<CardAssets | null> | null = null

function readCardAssets(): Promise<CardAssets | null> {
  cardAssets ??= Promise.all([
    readFile(join(process.cwd(), 'fonts', 'ZenMaruGothic-Bold.ttf')),
    readFile(join(process.cwd(), 'dist', 'logo-mark-on-dark.svg')),
  ]).then(
    ([font, logo]) => ({ font, logo: `data:image/svg+xml;base64,${logo.toString('base64')}` }),
    () => {
      cardAssets = null
      return null
    },
  )
  return cardAssets
}

export interface TierDeps {
  store: TierStore | null
  template?: () => Promise<string | null>
  card?: () => Promise<CardAssets | null>
  now?: () => number
}

export async function handleTier(request: Request, deps: TierDeps): Promise<Response> {
  const { store } = deps
  const now = deps.now ?? Date.now
  const url = new URL(request.url)
  const q = url.searchParams

  if (request.method === 'GET') {
    // /t/<ID> の HTML。rewrites で来たときの URL の形は環境で違いうるので、page と道筋の両方から ID を読む
    const pageId = q.get('page') ?? /^\/t\/([^/]+)$/.exec(url.pathname)?.[1] ?? null
    if (pageId !== null) {
      const template = await (deps.template ?? readTemplate)()
      if (!template) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
      let table: Stored | null = null
      if (ID_PATTERN.test(pageId) && store) {
        try {
          table = parseStored(await store.get(pageId))
        } catch {
          table = null
        }
      }
      // 画像の URL に更新の時刻を入れ、直したら X などが前の画像を使い回さないようにする
      const image = table ? `${url.origin}/api/tier?image=${pageId}&v=${Date.parse(table.updatedAt).toString(36)}` : undefined
      const html = pageHtml(template, table, `${url.origin}/t/${pageId}`, image)
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': table ? CACHE_READ : 'no-store' } })
    }
    const imageId = q.get('image')
    if (imageId !== null) {
      // v は画像の URL を変えるためだけのもので、中身は見ない
      if (!ID_PATTERN.test(imageId) || [...q.keys()].some((k) => k !== 'image' && k !== 'v')) return fail(400, 'bad_request')
      if (!store) return fail(503, 'not_configured')
      let table: Stored | null
      try {
        table = parseStored(await store.get(imageId))
      } catch {
        return fail(502, 'store_unreachable')
      }
      if (!table) return fail(404, 'not_found')
      const assets = await (deps.card ?? readCardAssets)()
      if (!assets) return fail(500, 'card_unavailable')
      let png: Uint8Array
      try {
        png = await renderCard(table, assets)
      } catch {
        return fail(500, 'card_unavailable')
      }
      return new Response(png as Uint8Array<ArrayBuffer>, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE_READ } })
    }
    const id = q.get('id')
    if (!id || !ID_PATTERN.test(id) || [...q.keys()].length !== 1) return fail(400, 'bad_request')
    if (!store) return fail(503, 'not_configured')
    let stored: Stored | null
    try {
      stored = parseStored(await store.get(id))
    } catch {
      return fail(502, 'store_unreachable')
    }
    if (!stored) return fail(404, 'not_found', CACHE_READ)
    return json(200, { title: stored.title, tiers: stored.tiers, updatedAt: stored.updatedAt }, CACHE_READ)
  }

  if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'DELETE') return fail(405, 'method_not_allowed')
  // このサイトの画面から送られたものだけ受け付ける（ブラウザは POST・PUT・DELETE に Origin を付ける）
  if (request.headers.get('origin') !== url.origin) return fail(403, 'origin_not_allowed')
  if (!store) return fail(503, 'not_configured')

  let table: SharedTable | null = null
  if (request.method !== 'DELETE') {
    try {
      const text = await readLimited(request, MAX_REQUEST_BYTES)
      if (text === null) return fail(413, 'too_large')
      table = parseShared(JSON.parse(text))
    } catch {
      return fail(400, 'bad_request')
    }
    if (!table) return fail(400, 'bad_request')
  }
  const at = new Date(now()).toISOString()

  try {
    if (request.method === 'POST') {
      if ([...q.keys()].length !== 0) return fail(400, 'bad_request')
      const day = at.slice(0, 10)
      // 接続元は、日付と混ぜたハッシュで数える（IP そのものは置かない。数えた記録は2日で消える）
      if ((await store.count('all', day)) > CREATE_PER_DAY) return fail(429, 'daily_limit')
      if ((await store.count(await sha256(`${day}:${clientIp(request)}`), day)) > CREATE_PER_IP) return fail(429, 'daily_limit')
      const key = randomKey()
      const value: Stored = { ...table!, hash: await sha256(key), createdAt: at, updatedAt: at }
      // ID が重なったら作り直す（59ビットなので、まず起きない）
      for (let i = 0; i < 3; i++) {
        const id = randomId()
        if (await store.create(id, JSON.stringify(value))) return json(201, { id, key })
      }
      return fail(500, 'id_collision')
    }

    const id = q.get('id')
    if (!id || !ID_PATTERN.test(id) || [...q.keys()].length !== 1) return fail(400, 'bad_request')
    const key = bearer(request)
    if (!key) return fail(401, 'unauthorized')
    const stored = parseStored(await store.get(id))
    if (!stored) return fail(404, 'not_found')
    if (!sameHash(stored.hash, await sha256(key))) return fail(403, 'forbidden')
    if (request.method === 'DELETE') {
      await store.remove(id)
      return json(200, { ok: true })
    }
    const value: Stored = { ...table!, hash: stored.hash, createdAt: stored.createdAt, updatedAt: at }
    if (!(await store.replace(id, JSON.stringify(value)))) return fail(404, 'not_found')
    return json(200, { ok: true, updatedAt: at })
  } catch {
    return fail(502, 'store_unreachable')
  }
}

const handle = (request: Request) => handleTier(request, { store: storeFromEnv(process.env) })
export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
