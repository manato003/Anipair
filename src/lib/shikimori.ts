import { delay, parseRetryAfter } from './retry'
import { noteEnglishTitle } from './englishTitles'
import { createThrottle, type ScheduleOptions } from './throttle'
import { loadSimilar, saveSimilar, type Cover, type SimilarEntry } from './storage'
import { t, tx, type Text } from './i18n'

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
const SHIKI_INTERVAL_MS = 700
const schedule = createThrottle(SHIKI_INTERVAL_MS)

// 1回の問い合わせの作品数。中継（api/shiki.ts の MAX_IDS）の上限と同じにする（増やすと中継に断られる）
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

// 中継の応答の形が違うとき
function badResponse(): Error {
  return new Error(t('Shikimoriの応答を読めませんでした', 'Could not read Shikimori’s response.'))
}

async function call(query: string, opts: FetchOptions = {}): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    // 待つあいだは列を握らない（1回ごとに列に並べ直す）。待っている間に、画面の問い合わせが先に進める
    const outcome = await schedule<{ body: unknown } | { retryAfterMs: number }>(async () => {
      let res: Response
      try {
        res = await fetch(`${ENDPOINT}?${query}`)
      } catch {
        throw new Error(t('Shikimoriに接続できませんでした。通信を確認してください', 'Could not connect to Shikimori. Check your connection.'))
      }
      if (res.status === 429) {
        return { retryAfterMs: parseRetryAfter(res.headers.get('Retry-After'), RATE_LIMIT_DEFAULT_WAIT_MS, RATE_LIMIT_MAX_WAIT_MS) }
      }
      let body: unknown
      try {
        body = await res.json()
      } catch {
        // 中継が無い（関数の動かない環境）と、JSON でない 404 が返る
        throw new Error(
          t(
            'Shikimoriへの中継が動いていません。ローカルでは「npm run dev」か「vercel dev」で起動してください',
            'The Shikimori relay isn’t running. Locally, start the app with “npm run dev” or “vercel dev”.',
          ),
        )
      }
      if (!res.ok) {
        const code = body && typeof body === 'object' ? (body as { error?: unknown }).error : null
        const what = typeof code === 'string' ? code : `HTTP ${res.status}`
        throw new Error(t(`Shikimoriから読めませんでした（${what}）`, `Could not load from Shikimori (${what}).`))
      }
      return { body }
    }, opts)
    if ('body' in outcome) return outcome.body
    if (attempt >= RATE_LIMIT_RETRIES) throw new Error(t('Shikimoriの利用制限に達しました。1分ほど待ってからもう一度試してください', 'Shikimori’s rate limit was reached. Please wait about a minute and try again.'))
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
    if (!body || !Array.isArray(body.animes)) throw badResponse()
    for (const id of chunk) mediaCache.set(id, null)
    for (const raw of body.animes) {
      const m = normalize(raw)
      if (m) mediaCache.set(m.idMal, m)
      // 英語の画面の作品名に使う公式の英題を覚える（lib/englishTitles.ts）
      if (m) noteEnglishTitle(m.idMal, m.title.english)
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
  return name.normalize('NFKC').replace(/[\s・=＝]/g, '').toLowerCase() // i18n-ok: 日本語の名前の照合用（画面には出さない）
}

const castCache = new Map<number, Promise<Map<string, string>>>()

// Shikimori のキャラクターの日本語名から、Annict の名前と照合する鍵を作る。
// Shikimori は「漢 羅半」（姓 名）や「響迂 / 趙迂」（別名）と書き、Annict は「羅半」「趙迂」と名だけのことがある。
// 全体・別名ごと・別名ごとの名（空白の後ろ）を鍵にする（先に入れた主役の名前が優先）
export function castKeys(ja: string): string[] {
  const keys = [personKey(ja)]
  for (const alt of ja.split(/[/／]/).map((s) => s.trim()).filter(Boolean)) { // i18n-ok: 全角の斜線で別名を分ける（照合用）
    keys.push(personKey(alt))
    const parts = alt.split(/\s+/)
    if (parts.length > 1) keys.push(personKey(parts[parts.length - 1]))
  }
  return [...new Set(keys)].filter(Boolean)
}

// 作品のキャラクターの、日本語名（personKey の形）→ ローマ字の名前（英語の画面で Annict のキャラクター名を英語にする）。
// 1回の起動の中では作品ごとに1回だけ読む。失敗したら空の表（日本語のまま出す）
export function fetchCastNames(malId: number, opts: FetchOptions = {}): Promise<Map<string, string>> {
  let p = castCache.get(malId)
  if (!p) {
    p = call(`op=cast&id=${malId}`, opts)
      .then((body) => {
        const chars = (body as { chars?: { n?: unknown; ja?: unknown }[] } | null)?.chars
        const out = new Map<string, string>()
        for (const c of Array.isArray(chars) ? chars : []) {
          if (typeof c?.n !== 'string' || typeof c.ja !== 'string') continue
          for (const key of castKeys(c.ja)) if (!out.has(key)) out.set(key, c.n)
        }
        return out
      })
      .catch(() => {
        castCache.delete(malId)
        return new Map<string, string>()
      })
    castCache.set(malId, p)
  }
  return p
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
  if (!body || !Array.isArray(body.people)) throw badResponse()
  for (const raw of body.people as ShikimoriPerson[]) {
    if (raw && Number.isInteger(raw.id) && typeof raw.japanese === 'string' && personKey(raw.japanese) === key) return raw
  }
  return null
}

export interface TitleHit {
  malId: number
  // 日本語の題名（Shikimori に無い作品は null）
  japanese: string | null
}

const titleCache = new Map<string, Promise<TitleHit[]>>()

// 英語・ローマ字の題名で作品を探す（Annict の検索は日本語の題名にしか当たらないので、日本語の題名に置き換えて引き直すため）。
// 1回の起動の中では同じ語を1回だけ聞く（ブラウズの「もっと見る」のたびに聞き直さない）。失敗は控えない
export function searchTitles(query: string, opts: FetchOptions = {}): Promise<TitleHit[]> {
  // 大文字と小文字は区別せずに当たるので、小文字にそろえて CDN の控えを使い回す
  const key = query.trim().toLowerCase()
  let p = titleCache.get(key)
  if (!p) {
    p = call(`op=search&q=${encodeURIComponent(key)}`, opts).then((body) => {
      const list = (body as { animes?: unknown } | null)?.animes
      if (!Array.isArray(list)) throw badResponse()
      return (list as { id?: unknown; japanese?: unknown }[]).flatMap((a) =>
        typeof a?.id === 'number' && Number.isInteger(a.id) && a.id > 0 ? [{ malId: a.id, japanese: typeof a.japanese === 'string' && a.japanese ? a.japanese : null }] : [],
      )
    })
    p.catch(() => titleCache.delete(key))
    titleCache.set(key, p)
  }
  return p
}

// Shikimori のスタッフの役割（ロシア語）を日本語と英語に。よく出るものだけ。知らないものは null（画面では「スタッフ」）
const ROLES: Record<string, Text> = {
  'Исполнение гл. муз. темы': { ja: '主題歌', en: 'Theme song' },
  'Исполнение муз. темы': { ja: '主題歌', en: 'Theme song' },
  'Музыкальное сопровождение': { ja: '挿入歌', en: 'Insert song' },
  'Композитор гл. муз. темы': { ja: '主題歌の作曲', en: 'Theme song composer' },
  'Лирика гл. муз. темы': { ja: '主題歌の作詞', en: 'Theme song lyrics' },
  'Аранжировка гл. муз. темы': { ja: '主題歌の編曲', en: 'Theme song arrangement' },
  Музыка: { ja: '音楽', en: 'Music' },
  Режиссёр: { ja: '監督', en: 'Director' },
  'Главный режиссёр': { ja: '総監督', en: 'Chief director' },
  'Режиссёр эпизодов': { ja: '演出', en: 'Episode director' },
  'Автор оригинала': { ja: '原作', en: 'Original work' },
  Автор: { ja: '原作', en: 'Original work' },
  Сюжет: { ja: 'ストーリー', en: 'Story' },
  Сценарий: { ja: '脚本', en: 'Screenplay' },
  'Компоновка серий': { ja: 'シリーズ構成', en: 'Series composition' },
  Раскадровка: { ja: '絵コンテ', en: 'Storyboard' },
  'Дизайн персонажей': { ja: 'キャラクターデザイン', en: 'Character design' },
  'Оригинал. дизайн персонажей': { ja: 'キャラクター原案', en: 'Original character design' },
  'Режиссёр анимации': { ja: '作画監督', en: 'Animation director' },
  'Главный режиссёр анимации': { ja: '総作画監督', en: 'Chief animation director' },
  'Помощник режиссёра анимации': { ja: '作画監督補佐', en: 'Assistant animation director' },
  'Ключевая анимация': { ja: '原画', en: 'Key animation' },
  'Второстепен. анимация': { ja: '第二原画', en: 'Second key animation' },
  'Фоновая рисовка': { ja: '背景', en: 'Background art' },
  'Арт-директор': { ja: '美術監督', en: 'Art director' },
  'Дизайн макетов': { ja: 'レイアウト', en: 'Layout' },
  Вёрстка: { ja: 'レイアウト', en: 'Layout' },
  Монтаж: { ja: '編集', en: 'Editing' },
  Звукорежиссёр: { ja: '音響監督', en: 'Sound director' },
  'Звуковые эффекты': { ja: '効果', en: 'Sound effects' },
  Планирование: { ja: '企画', en: 'Planning' },
  Продюсер: { ja: 'プロデューサー', en: 'Producer' },
  'Исполнительн. продюсер': { ja: '製作総指揮', en: 'Executive producer' },
  'Продюсер планирования': { ja: '企画プロデューサー', en: 'Planning producer' },
  'Директор по производству': { ja: '制作', en: 'Production' },
}

// 役割の名前（いまの言語で）。知らない役割は null
function roleLabel(role: string): string | null {
  const text = ROLES[role]
  return text ? tx(text) : null
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
  if (!castRaw || !staffRaw) throw badResponse()
  const cast = castRaw.flatMap((x) => {
    if (!x || !Number.isInteger(x.id) || (x.id as number) <= 0) return []
    const characters = (Array.isArray(x.ch) ? (x.ch as { i?: unknown; n?: unknown }[]) : []).flatMap((c) =>
      c && Number.isInteger(c.i) && (c.i as number) > 0 ? [{ id: c.i as number, name: typeof c.n === 'string' && c.n ? c.n : null }] : [],
    )
    return [{ id: x.id as number, characters }]
  })
  const staff = staffRaw.flatMap((x) => {
    if (!x || !Number.isInteger(x.id) || (x.id as number) <= 0) return []
    const roles = [...new Set((Array.isArray(x.r) ? x.r : []).filter((r): r is string => typeof r === 'string').map((r) => roleLabel(r) ?? t('スタッフ', 'Staff')))]
    return [{ id: x.id as number, roles: roles.length > 0 ? roles : [t('スタッフ', 'Staff')] }]
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
    if (!body || !Array.isArray(body.characters)) throw badResponse()
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

// 中継（api/shiki.ts の MAX_LIST_PAGE）の上限と同じにする
const LIST_PAGES = 4

// 制作会社の作品（新しい順。50件ずつ、最大4ページ）。作品の情報は控えにも入れる（一覧から詳細を開くときに読み直さない）
export async function fetchStudioWorks(id: number, opts: FetchOptions = {}): Promise<Media[]> {
  return (await fetchStudioLinked(id, opts)).medias
}

// 制作会社の作品と、中継が覚えている Annict の作品 ID（確かめていない。使う側が Annict で引き直す。features/browse/annictLinks.ts）
export function fetchStudioLinked(id: number, opts: FetchOptions = {}): Promise<{ medias: Media[]; annict: Map<number, number> }> {
  return fetchList('studio', id, opts)
}

// ジャンル・テーマの Shikimori の ID（英語名から。2026-10-27 に genres(entryType: Anime) で確かめた）。成人向けと対象層（少年・青年など）は入れない
const GENRE_IDS: Record<string, number> = {
  Action: 1, Adventure: 2, Racing: 3, Comedy: 4, 'Avant Garde': 5, Mythology: 6, Mystery: 7, Drama: 8, Ecchi: 9, Fantasy: 10,
  'Strategy Game': 11, Historical: 13, 'Martial Arts': 17, Mecha: 18, Music: 19, Parody: 20, Samurai: 21, Romance: 22, School: 23,
  'Sci-Fi': 24, Space: 29, Sports: 30, 'Super Power': 31, Vampire: 32, Yaoi: 33, Yuri: 34, Harem: 35, 'Slice of Life': 36,
  Supernatural: 37, Military: 38, Detective: 39, Psychological: 40, 'Team Sports': 102, 'Video Game': 103, 'Adult Cast': 104,
  Gore: 105, Reincarnation: 106, 'Love Polygon': 107, 'Visual Arts': 108, 'Time Travel': 111, 'Gag Humor': 112, 'Award Winning': 114,
  Suspense: 117, 'Combat Sports': 118, CGDCT: 119, 'Mahou Shoujo': 124, 'Reverse Harem': 125, 'Girls Love': 129, Isekai: 130,
  Delinquents: 131, 'Boys Love': 133, Childcare: 134, 'Magical Sex Shift': 135, Showbiz: 136, 'Otaku Culture': 137,
  'Organized Crime': 138, Workplace: 139, Iyashikei: 140, Survival: 141, 'Performing Arts': 142, Anthropomorphic: 143,
  Crossdressing: 144, 'Idols (Female)': 145, 'High Stakes Game': 146, Medical: 147, Pets: 148, Educational: 149,
  'Idols (Male)': 150, 'Love Status Quo': 151, 'Urban Fantasy': 197, Villainess: 198, Gourmet: 543,
}

export function genreId(name: string): number | null {
  return Object.hasOwn(GENRE_IDS, name) ? GENRE_IDS[name] : null
}

// ジャンルの作品（人気順。50件ずつ、最大4ページ）
export async function fetchGenreWorks(id: number, opts: FetchOptions = {}): Promise<Media[]> {
  return (await fetchList('genre', id, opts)).medias
}

// 制作会社は v=7（応答に対応が付く）、ジャンルは v=6
async function fetchList(op: 'studio' | 'genre', id: number, opts: FetchOptions): Promise<{ medias: Media[]; annict: Map<number, number> }> {
  const medias: Media[] = []
  const annict = new Map<number, number>()
  for (let page = 1; page <= LIST_PAGES; page++) {
    const body = (await call(`op=${op}&id=${id}&page=${page}&v=${op === 'studio' ? 7 : 6}`, opts)) as { animes?: RawAnime[]; annict?: unknown }
    if (!body || !Array.isArray(body.animes)) throw badResponse()
    for (const raw of body.animes) {
      const m = normalize(raw)
      if (!m) continue
      mediaCache.set(m.idMal, m)
      noteEnglishTitle(m.idMal, m.title.english)
      medias.push(m)
    }
    for (const [mal, aid] of linksOf(body.annict)) annict.set(mal, aid)
    if (body.animes.length < BATCH) break
  }
  return { medias, annict }
}

// 応答の annict（MyAnimeList の ID → Annict の作品 ID）。形の合わないものは捨てる
function linksOf(raw: unknown): Map<number, number> {
  const out = new Map<number, number>()
  if (!raw || typeof raw !== 'object') return out
  for (const [mal, id] of Object.entries(raw as Record<string, unknown>)) {
    if (Number.isInteger(Number(mal)) && Number(mal) > 0 && typeof id === 'number' && Number.isInteger(id) && id > 0) out.set(Number(mal), id)
  }
  return out
}

// 期間の作品を、ジャンル（すべてを持つ）と制作会社（1社）で探す条件。期間は Annict の書き方（2022-spring）
export interface FindCondition {
  genres: readonly number[]
  studio: number | null
  from: string
  to: string
  order: 'popularity' | 'aired_on'
}

// 期間・ジャンル・制作会社で探す（50件ずつ、中継の上限の4ページまで）。annict は中継が覚えている Annict の作品 ID（確かめていない。使う側が Annict で引き直す）。
// full: 1ページぶん返った（続きがあるかもしれない）
export async function findWorks(c: FindCondition, page: number, opts: FetchOptions = {}): Promise<{ medias: Media[]; annict: Map<number, number>; full: boolean }> {
  const genres = [...new Set(c.genres)].sort((a, b) => a - b)
  const query = [
    'op=find',
    ...(genres.length > 0 ? [`genre=${genres.join(',')}`] : []),
    ...(c.studio !== null ? [`studio=${c.studio}`] : []),
    `from=${c.from}`,
    `to=${c.to}`,
    `order=${c.order}`,
    `page=${page}`,
    'v=1',
  ].join('&')
  const body = (await call(query, opts)) as { animes?: RawAnime[]; annict?: unknown }
  if (!body || !Array.isArray(body.animes)) throw badResponse()
  const medias: Media[] = []
  for (const raw of body.animes) {
    const m = normalize(raw)
    if (!m) continue
    mediaCache.set(m.idMal, m)
    noteEnglishTitle(m.idMal, m.title.english)
    medias.push(m)
  }
  return { medias, annict: linksOf(body.annict), full: body.animes.length >= BATCH }
}

// 題名で結び付けた MyAnimeList の ID → Annict の作品 ID を中継に覚えてもらう（次の人は題名で探さずに済む）。
// 失敗しても困らないので、待たず・知らせない。Shikimori には届かないので、問い合わせの列にも並べない
export function linkAnnict(pairs: readonly (readonly [number, number])[]): void {
  for (let i = 0; i < pairs.length; i += BATCH) {
    fetch(`${ENDPOINT}?op=link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs: pairs.slice(i, i + BATCH) }) }).catch(() => undefined)
  }
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
  if (!body || !Array.isArray(body.ids) || !body.ids.every((n) => Number.isInteger(n) && n > 0)) throw badResponse()
  const ids = body.ids as number[]
  store().set(malId, { at: Date.now(), ids })
  saveSimilar(store())
  return ids
}

// 端末に無い作品の似た作品を、中継の控え（Upstash）から50件ずつまとめて受け取り、端末に控える。
// 中継は控えにある分だけを返し、Shikimori には聞かない（無い分は、このあと1件ずつ聞く）。
// 初回のマッチングで70件ほどを0.7秒おきに1件ずつ頼んでいたのを、控えのある分は数回で済ませる。
// 読めなくても、1件ずつ聞く今までの道に戻るだけ
async function prefetchSimilar(malIds: readonly number[], opts: FetchOptions): Promise<void> {
  const missing = malIds.filter((id) => !store().has(id))
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH).sort((a, b) => a - b)
    let body: { found?: unknown }
    try {
      body = (await call(`op=similar&ids=${chunk.join(',')}`, opts)) as { found?: unknown }
    } catch {
      return
    }
    const found = body && typeof body.found === 'object' && body.found !== null ? (body.found as Record<string, unknown>) : {}
    let added = false
    for (const id of chunk) {
      const ids = found[id]
      if (Array.isArray(ids) && ids.every((n) => Number.isInteger(n) && n > 0)) {
        store().set(id, { at: Date.now(), ids: ids as number[] })
        added = true
      }
    }
    if (added) saveSimilar(store())
  }
}

// 複数の作品の似た作品を集める。まず中継の控えからまとめて受け取り、残りを1作品ずつ聞く（初めての作品が多いと時間がかかる）。
// opts.background は先読み用（画面の問い合わせを遅らせない）。
// 1つ失敗したらそこで止めて例外にする（端末に控えた分は次に使える）
export async function fetchSimilarMany(
  malIds: readonly number[],
  onProgress?: (done: number, total: number, malId: number) => void,
  opts: FetchOptions = {},
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>()
  const unique = [...new Set(malIds)]
  await prefetchSimilar(unique, opts)
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
  titleCache.clear()
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
