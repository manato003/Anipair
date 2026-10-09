import { delay, parseRetryAfter } from './retry'
import { createThrottle, type ScheduleOptions } from './throttle'
import { loadSimilar, saveSimilar, type Cover, type SimilarEntry } from './storage'

// 作品データの出どころ（いまは Shikimori）。この1ファイルと、サーバー側の api/shiki.ts だけが出どころを知っていて、
// ほかは下の WorkDataProvider の3つ（fetchMedia = 作品の情報、fetchSimilar = 似た作品、fetchRelated = 関連作品）だけを使う。
// 公式の MyAnimeList API などに切り替えるときは、この2つを差し替える。
//
// Shikimori（https://shikimori.io/）の作品データ。Annict に無いものだけをここから取る:
// ジャンル・テーマ・制作会社・前作・点数・ポスター・「似た作品」。Shikimori の ID は MyAnimeList の ID と同じ。
// 直接ではなく、自分のサイトの中継（api/shiki.ts）を通す。Shikimori の決まり（User-Agent にアプリ名を入れる）を守るためと、
// CDN の控えで同じ作品の問い合わせを全利用者で1回にするため
const ENDPOINT = '/api/shiki'

// Shikimori は 1秒5回・1分90回まで。中継の先で守りきれないので、こちらでも約1.4回/秒に抑える
export const SHIKI_INTERVAL_MS = 700
const schedule = createThrottle(SHIKI_INTERVAL_MS)

const BATCH = 50

// 429 は Retry-After（秒。中継は 5 を返す）だけ待って送り直す。2回まで
const RATE_LIMIT_RETRIES = 2
const RATE_LIMIT_DEFAULT_WAIT_MS = 5_000
const RATE_LIMIT_MAX_WAIT_MS = 30_000

// background: true なら裏の仕事（先読みなど）。画面の問い合わせが待っているあいだは始まらない
export type FetchOptions = ScheduleOptions

export interface MediaTitle {
  native: string | null
  romaji: string | null
  english: string | null
}

// 作品の情報（マッチング・見たいのおすすめ順・傾向・詳細のジャンル・表紙・評価順が使う）
export interface Media {
  idMal: number
  title: MediaTitle
  // TV / MOVIE / OVA / ONA / TV_SPECIAL / SPECIAL / MUSIC / PV / CM。分からなければ null
  format: string | null
  // NOT_YET_RELEASED / RELEASING / FINISHED。分からなければ null
  status: string | null
  isAdult: boolean
  seasonYear: number | null
  // MyAnimeList と同じ分類。ジャンル・テーマ・対象層（少年向けなど）。関連度の数値は無い
  genres: string[]
  themes: string[]
  demographics: string[]
  // 制作会社（名前と、Shikimori の ID。ID は制作会社の作品の一覧を開くのに使う）
  studios: string[]
  studioRefs?: { id: number; name: string }[]
  cover: Cover | null
  // Shikimori の点数（10点満点）。点数の無い作品は null
  score: number | null
  // 前作（MyAnimeList の ID）
  prequels: number[]
  // 関連するアニメ（関係の種類と MyAnimeList の ID）。kind は Shikimori の relationKind（prequel・sequel・side_story など）
  related: { kind: string; malId: number }[]
  // 人気（Shikimori でリストに入れている人の数）。参加作品の一覧の人気順に使う。分からなければ 0
  popularity?: number
  // 点数を付けた人の数（ブラウズの評価順のベイズ平均に使う）。分からなければ undefined
  scoreCount?: number
  // 全話数・放送済みの話数・1話の長さ（分）。分からなければ 0（作品の要点の「全◯話」「放送中」「一気見の目安」に使う）
  episodes?: number
  episodesAired?: number
  duration?: number
}

// 中継が返す、画面が使う項目だけの形（api/shiki.ts の trim と同じ）
interface RawAnime {
  id: number
  name: string | null
  japanese: string | null
  english: string | null
  kind: string | null
  rating: string | null
  status: string | null
  score: number | null
  eps?: number
  aired?: number
  dur?: number
  year: number | null
  poster: { o: string; m: string } | null
  genres: { n: string; k: string }[]
  studios: string[]
  st?: { i: number; n: string }[]
  pop?: number
  sc?: number
  prequels: number[]
  related?: { k: string; id: number }[]
}

const FORMATS: Record<string, string> = {
  tv: 'TV',
  movie: 'MOVIE',
  ova: 'OVA',
  ona: 'ONA',
  tv_special: 'TV_SPECIAL',
  special: 'SPECIAL',
  music: 'MUSIC',
  pv: 'PV',
  cm: 'CM',
}

const STATUSES: Record<string, string> = { released: 'FINISHED', ongoing: 'RELEASING', anons: 'NOT_YET_RELEASED' }

// 成人向け: Shikimori の年齢区分が rx（ヘンタイ）か、ジャンルが Hentai / Erotica。
// r_plus（軽い裸の表現。お色気のある一般の作品も多い）は成人向けとしない。前の版（成人向けの旗だけを見ていた）と同じ扱い
const ADULT_GENRES = new Set(['Hentai', 'Erotica'])

const positive = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0)

export function normalize(raw: RawAnime): Media | null {
  if (!raw || !Number.isInteger(raw.id) || raw.id <= 0) return null
  const genres = Array.isArray(raw.genres) ? raw.genres : []
  const names = (kind: string) => genres.filter((g) => g.k === kind).map((g) => g.n)
  const poster = raw.poster
  return {
    idMal: raw.id,
    title: { native: raw.japanese ?? null, romaji: raw.name ?? null, english: raw.english ?? null },
    format: raw.kind ? (FORMATS[raw.kind] ?? null) : null,
    status: raw.status ? (STATUSES[raw.status] ?? null) : null,
    isAdult: raw.rating === 'rx' || genres.some((g) => ADULT_GENRES.has(g.n)),
    seasonYear: raw.year ?? null,
    genres: names('genre'),
    themes: names('theme'),
    demographics: names('demographic'),
    studios: Array.isArray(raw.studios) ? raw.studios : [],
    popularity: typeof raw.pop === 'number' && raw.pop > 0 ? raw.pop : 0,
    scoreCount: typeof raw.sc === 'number' && raw.sc > 0 ? raw.sc : undefined,
    episodes: positive(raw.eps),
    episodesAired: positive(raw.aired),
    duration: positive(raw.dur),
    studioRefs: Array.isArray(raw.st) ? raw.st.flatMap((x) => (x && Number.isInteger(x.i) && x.i > 0 && typeof x.n === 'string' ? [{ id: x.i, name: x.n }] : [])) : [],
    cover: poster ? { url: poster.o, thumb: poster.m, landscape: false } : null,
    score: typeof raw.score === 'number' && raw.score > 0 ? raw.score : null,
    prequels: Array.isArray(raw.prequels) ? raw.prequels : [],
    related: Array.isArray(raw.related)
      ? raw.related.flatMap((r) => (r && typeof r.k === 'string' && Number.isInteger(r.id) && r.id > 0 ? [{ kind: r.k, malId: r.id }] : []))
      : [],
  }
}

export function shikimoriUrl(malId: number): string {
  return `https://shikimori.io/animes/${malId}`
}

async function call(query: string, opts: FetchOptions = {}): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    // 待つあいだは列を握らない（1回ごとに列に並べ直す）。待っている間に、画面の問い合わせが先に進める
    const outcome = await schedule<{ body: unknown } | { retryAfterMs: number }>(async () => {
      let res: Response
      try {
        res = await fetch(`${ENDPOINT}?${query}`)
      } catch {
        throw new Error('Shikimori に接続できませんでした。通信を確認してください')
      }
      if (res.status === 429) {
        return { retryAfterMs: parseRetryAfter(res.headers.get('Retry-After'), RATE_LIMIT_DEFAULT_WAIT_MS, RATE_LIMIT_MAX_WAIT_MS) }
      }
      let body: unknown
      try {
        body = await res.json()
      } catch {
        // 中継が無い（関数の動かない環境）と、JSON でない 404 が返る
        throw new Error('Shikimori への中継が動いていません。ローカルでは npm run dev か vercel dev で起動してください')
      }
      if (!res.ok) {
        const code = body && typeof body === 'object' ? (body as { error?: unknown }).error : null
        throw new Error(`Shikimori から読めませんでした（${typeof code === 'string' ? code : `HTTP ${res.status}`}）`)
      }
      return { body }
    }, opts)
    if ('body' in outcome) return outcome.body
    if (attempt >= RATE_LIMIT_RETRIES) throw new Error('Shikimori の利用制限に達しました。1分ほど待ってからもう一度試してください')
    await delay(outcome.retryAfterMs)
  }
}

// 1回の起動の中では取り直さない。null は「問い合わせたが返ってこなかった」（何度も問い合わせない）
const mediaCache = new Map<number, Media | null>()

// 取り込み済みの作品の情報（問い合わせない）。無ければ undefined
export function peekMedia(malId: number): Media | null | undefined {
  return mediaCache.get(malId)
}

// MyAnimeList の ID から作品の情報を引く。50件ずつまとめて1回の問い合わせにする。
// 失敗したら例外（呼び出し側が、使えるところまで使うか止めるかを決める）
export async function fetchMedia(malIds: readonly number[], opts: FetchOptions = {}): Promise<Map<number, Media>> {
  const missing = [...new Set(malIds)].filter((id) => Number.isInteger(id) && id > 0 && !mediaCache.has(id)).sort((a, b) => a - b)
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH)
    // v=6: 中継の応答に点数を付けた人の数（sc）が加わった版（v=5 は話数など、v=4 は人気 pop）。
    // CDN に1週間残る前の形の控えを使わないよう、問い合わせの URL を変える
    const body = (await call(`op=animes&ids=${chunk.join(',')}&v=6`, opts)) as { animes?: RawAnime[] }
    if (!body || !Array.isArray(body.animes)) throw new Error('Shikimori の応答を読めませんでした')
    for (const id of chunk) mediaCache.set(id, null)
    for (const raw of body.animes) {
      const m = normalize(raw)
      if (m) mediaCache.set(m.idMal, m)
    }
  }
  const out = new Map<number, Media>()
  for (const id of malIds) {
    const m = mediaCache.get(id)
    if (m) out.set(id, m)
  }
  return out
}

// 名前の照合に使う形（全角・半角をそろえ、空白と中黒・イコールを除く）。Annict の「上坂すみれ」と Shikimori の「上坂 すみれ」を同じにする
export function personKey(name: string): string {
  return name.normalize('NFKC').replace(/[\s・=＝]/g, '').toLowerCase()
}

export interface ShikimoriPerson {
  id: number
  name: string | null
  japanese: string | null
}

// 名前（日本語）で人物を探し、日本語名が一致する人を返す。見つからなければ null。
// 同じ名前の人が複数いるときは、Shikimori の検索の先頭に近い人（よく知られた人）
export async function findPerson(name: string, opts: FetchOptions = {}): Promise<ShikimoriPerson | null> {
  const key = personKey(name)
  if (!key) return null
  const body = (await call(`op=people&q=${encodeURIComponent(name.trim())}`, opts)) as { people?: unknown }
  if (!body || !Array.isArray(body.people)) throw new Error('Shikimori の応答を読めませんでした')
  for (const raw of body.people as ShikimoriPerson[]) {
    if (raw && Number.isInteger(raw.id) && typeof raw.japanese === 'string' && personKey(raw.japanese) === key) return raw
  }
  return null
}

// Shikimori のスタッフの役割（ロシア語）を日本語に。よく出るものだけ。知らないものは null（画面では「スタッフ」）
const ROLE_JA: Record<string, string> = {
  'Исполнение гл. муз. темы': '主題歌',
  'Исполнение муз. темы': '主題歌',
  'Музыкальное сопровождение': '挿入歌',
  'Композитор гл. муз. темы': '主題歌の作曲',
  'Лирика гл. муз. темы': '主題歌の作詞',
  'Аранжировка гл. муз. темы': '主題歌の編曲',
  Музыка: '音楽',
  Режиссёр: '監督',
  'Главный режиссёр': '総監督',
  'Режиссёр эпизодов': '演出',
  'Автор оригинала': '原作',
  Автор: '原作',
  Сюжет: 'ストーリー',
  Сценарий: '脚本',
  'Компоновка серий': 'シリーズ構成',
  Раскадровка: '絵コンテ',
  'Дизайн персонажей': 'キャラクターデザイン',
  'Оригинал. дизайн персонажей': 'キャラクター原案',
  'Режиссёр анимации': '作画監督',
  'Главный режиссёр анимации': '総作画監督',
  'Помощник режиссёра анимации': '作画監督補佐',
  'Ключевая анимация': '原画',
  'Второстепен. анимация': '第二原画',
  'Фоновая рисовка': '背景',
  'Арт-директор': '美術監督',
  'Дизайн макетов': 'レイアウト',
  Вёрстка: 'レイアウト',
  Монтаж: '編集',
  Звукорежиссёр: '音響監督',
  'Звуковые эффекты': '効果',
  Планирование: '企画',
  Продюсер: 'プロデューサー',
  'Исполнительн. продюсер': '製作総指揮',
  'Продюсер планирования': '企画プロデューサー',
  'Директор по производству': '制作',
}

export function roleJa(role: string): string | null {
  return ROLE_JA[role] ?? null
}

// 人物の参加作品（MyAnimeList の ID）。cast は声の出演、staff はスタッフとしての作品と役割（日本語。知らない役割は「スタッフ」）
export async function fetchPersonWorks(
  id: number,
  opts: FetchOptions = {},
): Promise<{ cast: { id: number; characters: { id: number; name: string | null }[] }[]; staff: { id: number; roles: string[] }[] }> {
  // v=2: スタッフに役割が加わった版。v=4: 声の出演に演じたキャラクター（ID とローマ字の名前）が加わった版。日本語名は fetchCharacterNames で引く
  const body = (await call(`op=person&id=${id}&v=4`, opts)) as { cast?: unknown; staff?: unknown }
  const castRaw = Array.isArray(body?.cast) ? (body.cast as { id?: unknown; ch?: unknown }[]) : null
  const staffRaw = Array.isArray(body?.staff) ? (body.staff as { id?: unknown; r?: unknown }[]) : null
  if (!castRaw || !staffRaw) throw new Error('Shikimori の応答を読めませんでした')
  const cast = castRaw.flatMap((x) => {
    if (!x || !Number.isInteger(x.id) || (x.id as number) <= 0) return []
    const characters = (Array.isArray(x.ch) ? (x.ch as { i?: unknown; n?: unknown }[]) : []).flatMap((c) =>
      c && Number.isInteger(c.i) && (c.i as number) > 0 ? [{ id: c.i as number, name: typeof c.n === 'string' && c.n ? c.n : null }] : [],
    )
    return [{ id: x.id as number, characters }]
  })
  const staff = staffRaw.flatMap((x) => {
    if (!x || !Number.isInteger(x.id) || (x.id as number) <= 0) return []
    const roles = [...new Set((Array.isArray(x.r) ? x.r : []).filter((r): r is string => typeof r === 'string').map((r) => roleJa(r) ?? 'スタッフ'))]
    return [{ id: x.id as number, roles: roles.length > 0 ? roles : ['スタッフ'] }]
  })
  return { cast, staff }
}

// キャラクターの日本語名（起動中はメモリに控える。日本語名の無いキャラクターも「無い」と控えて、問い合わせ直さない）
const characterCache = new Map<number, string | null>()

// キャラクターの日本語名を50人ずつ引く。引けなかった分は返さない（呼ぶ側はローマ字の名前を使う）
export async function fetchCharacterNames(ids: readonly number[], opts: FetchOptions = {}): Promise<Map<number, string>> {
  const missing = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0 && !characterCache.has(id)).sort((a, b) => a - b)
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH)
    const body = (await call(`op=characters&ids=${chunk.join(',')}`, opts)) as { characters?: { id?: unknown; ja?: unknown }[] }
    if (!body || !Array.isArray(body.characters)) throw new Error('Shikimori の応答を読めませんでした')
    for (const id of chunk) characterCache.set(id, null)
    for (const c of body.characters) if (Number.isInteger(c?.id) && typeof c.ja === 'string' && c.ja) characterCache.set(c.id as number, c.ja)
  }
  const out = new Map<number, string>()
  for (const id of ids) {
    const name = characterCache.get(id)
    if (name) out.set(id, name)
  }
  return out
}

const STUDIO_PAGES = 4

// 制作会社の作品（新しい順。50件ずつ、最大4ページ）。作品の情報は控えにも入れる（一覧から詳細を開くときに読み直さない）
export async function fetchStudioWorks(id: number, opts: FetchOptions = {}): Promise<Media[]> {
  const out: Media[] = []
  for (let page = 1; page <= STUDIO_PAGES; page++) {
    const body = (await call(`op=studio&id=${id}&page=${page}&v=6`, opts)) as { animes?: RawAnime[] }
    if (!body || !Array.isArray(body.animes)) throw new Error('Shikimori の応答を読めませんでした')
    for (const raw of body.animes) {
      const m = normalize(raw)
      if (!m) continue
      mediaCache.set(m.idMal, m)
      out.push(m)
    }
    if (body.animes.length < BATCH) break
  }
  return out
}

// 似た作品の一覧（似ている順の MyAnimeList の ID）。端末に30日、起動中はメモリに控える
let similarStore: Map<number, SimilarEntry> | null = null

function store(): Map<number, SimilarEntry> {
  return (similarStore ??= loadSimilar())
}

// その作品の似た作品が端末に控えてあるか（控えていない作品が多いときに、待ち時間の案内を出すのに使う）
export function isSimilarCached(malId: number): boolean {
  return store().has(malId)
}

export async function fetchSimilar(malId: number, opts: FetchOptions = {}): Promise<number[]> {
  const hit = store().get(malId)
  if (hit) return hit.ids
  const body = (await call(`op=similar&id=${malId}`, opts)) as { ids?: unknown }
  if (!body || !Array.isArray(body.ids) || !body.ids.every((n) => Number.isInteger(n) && n > 0)) throw new Error('Shikimori の応答を読めませんでした')
  const ids = body.ids as number[]
  store().set(malId, { at: Date.now(), ids })
  saveSimilar(store())
  return ids
}

// 複数の作品の似た作品を順に集める（1作品ずつ並べて問い合わせるので、初めてのときは時間がかかる）。
// opts.background は先読み用（画面の問い合わせを遅らせない）。
// 1つ失敗したらそこで止めて例外にする（端末に控えた分は次に使える）
export async function fetchSimilarMany(
  malIds: readonly number[],
  onProgress?: (done: number, total: number, malId: number) => void,
  opts: FetchOptions = {},
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>()
  const unique = [...new Set(malIds)]
  let done = 0
  for (const id of unique) {
    out.set(id, await fetchSimilar(id, opts))
    onProgress?.(++done, unique.length, id)
  }
  return out
}

// テスト用: 起動中の控えを捨てる
export function resetShikimoriMemory(): void {
  mediaCache.clear()
  characterCache.clear()
  similarStore = null
}

// 関連作品（いまは前作だけ）。作品の情報の問い合わせに含まれているので、追加の通信は要らない
export async function fetchRelated(malId: number): Promise<{ prequels: number[] }> {
  const m = (await fetchMedia([malId])).get(malId)
  return { prequels: m?.prequels ?? [] }
}

// 出どころを差し替えるときの境目。返すのは、この画面の側の正規化した型（Media・MyAnimeList の ID）だけ
export interface WorkDataProvider {
  fetchMedia: (malIds: readonly number[], opts?: FetchOptions) => Promise<Map<number, Media>>
  fetchSimilar: (malId: number, opts?: FetchOptions) => Promise<number[]>
  fetchRelated: (malId: number) => Promise<{ prequels: number[] }>
}

export const workData: WorkDataProvider = { fetchMedia, fetchSimilar, fetchRelated }
