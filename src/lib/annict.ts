import { emitAnnictAuthFailed } from './authEvents'
import { annictImageOf } from './covers'
import { delay, parseRetryAfter } from './retry'
import { createThrottle, type ScheduleOptions } from './throttle'

// Annict GraphQL API。型は annict/annict の rails/app/graphql/beta/schema.graphql が正
const ENDPOINT = 'https://api.annict.com/graphql'

// 同じ IP から1秒4回まで（rails/config/initializers/rack_attack.rb）。余裕を見て約3回に抑える
export const schedule = createThrottle(300)

export type StatusState = 'WANNA_WATCH' | 'WATCHING' | 'WATCHED' | 'ON_HOLD' | 'STOP_WATCHING' | 'NO_STATE'
export type RatingState = 'BAD' | 'AVERAGE' | 'GOOD' | 'GREAT'

export type AnnictErrorKind = 'auth' | 'network' | 'api'

export class AnnictError extends Error {
  readonly kind: AnnictErrorKind
  constructor(message: string, kind: AnnictErrorKind) {
    super(message)
    this.kind = kind
  }
}

export interface AnnictWork {
  id: string
  annictId: number
  title: string
  media: string
  malAnimeId: string | null
  watchersCount: number
  viewerStatusState: StatusState | null
  // Annict の API の画像（公式サイトの横長の画像）。https のものだけ。表紙の決め方は lib/covers.ts
  imageUrl: string | null
}

// 429（回数の制限）で自動で待って送り直す回数。Annict は rack-attack で IP ごとに数えている。
// 制限で断られた要求は処理されていないので、書き込みも送り直してよい
const RATE_LIMIT_RETRIES = 2
const RATE_LIMIT_DEFAULT_WAIT_MS = 2_000
const RATE_LIMIT_MAX_WAIT_MS = 30_000

type GqlOutcome<T> = { data: T } | { retryAfterMs: number }

async function gql<T>(token: string, query: string, variables: Record<string, unknown> = {}, opts: ScheduleOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // 待つあいだは列を握らない（1回ごとに列に並べ直す）。待っている間に、ほかの問い合わせが先に進める
    const outcome = await schedule<GqlOutcome<T>>(async () => {
      let res: Response
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ query, variables }),
        })
      } catch {
        throw new AnnictError('Annict に接続できませんでした。通信を確認してください', 'network')
      }
      if (res.status === 401) {
        // 画面全体に知らせる（帯を出す）。呼び出し元には、今までどおり例外で返す
        emitAnnictAuthFailed(token)
        throw new AnnictError('Annict のトークンが使えません。設定で入れ直してください', 'auth')
      }
      if (res.status === 429) {
        return { retryAfterMs: parseRetryAfter(res.headers.get('Retry-After'), RATE_LIMIT_DEFAULT_WAIT_MS, RATE_LIMIT_MAX_WAIT_MS) }
      }
      if (!res.ok) throw new AnnictError(`Annict がエラーを返しました（HTTP ${res.status}）`, 'api')
      const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
      if (json.errors?.length) throw new AnnictError(`Annict がエラーを返しました: ${json.errors[0].message}`, 'api')
      if (!json.data) throw new AnnictError('Annict の応答が空でした', 'api')
      return { data: json.data }
    }, opts)
    if ('data' in outcome) return outcome.data
    if (attempt >= RATE_LIMIT_RETRIES) {
      throw new AnnictError('Annict の利用制限に達しました。しばらく待ってからもう一度試してください', 'api')
    }
    await delay(outcome.retryAfterMs)
  }
}

export async function fetchViewer(token: string): Promise<{ username: string; name: string }> {
  const data = await gql<{ viewer: { username: string; name: string } }>(token, '{ viewer { username name } }')
  return data.viewer
}

// 自分の Annict での積み重ね（隠し称号の材料。features/achievements）
export interface ViewerStats {
  username: string
  name: string
  avatarUrl: string | null
  createdAt: string
  // エピソードごとの記録の数
  recordsCount: number
  watchedCount: number
  watchingCount: number
  wannaWatchCount: number
  onHoldCount: number
  stopWatchingCount: number
  followersCount: number
  followingsCount: number
}

export async function fetchViewerStats(token: string): Promise<ViewerStats> {
  const data = await gql<{ viewer: ViewerStats }>(
    token,
    '{ viewer { username name avatarUrl createdAt recordsCount watchedCount watchingCount wannaWatchCount onHoldCount stopWatchingCount followersCount followingsCount } }',
  )
  return data.viewer
}

// 1回の問い合わせでまとめて読むクールの数（別名を付けて並べる。16 で 0.3 秒ほど。2026-10-04 実測）
export const SEASON_TOPS_BATCH = 16

// クールごとの、視聴者の多い順の作品の ID（評価画面のクールの山と同じ並び・同じ数）。進み具合の分母に使う。
// 裏の仕事として並べる（画面の問い合わせを遅らせない）
export async function fetchSeasonTops(token: string, seasonSlugs: readonly string[], limit = 30): Promise<Map<string, number[]>> {
  if (seasonSlugs.length === 0) return new Map()
  const fields = seasonSlugs
    .map((_, i) => `s${i}: searchWorks(seasons: [$s${i}], first: $first, orderBy: {field: WATCHERS_COUNT, direction: DESC}) { nodes { annictId } }`)
    .join(' ')
  const params = seasonSlugs.map((_, i) => `$s${i}: String!`).join(', ')
  const variables: Record<string, unknown> = { first: limit }
  seasonSlugs.forEach((slug, i) => (variables[`s${i}`] = slug))
  const data = await gql<Record<string, { nodes: { annictId: number }[] }>>(token, `query(${params}, $first: Int) { ${fields} }`, variables, { background: true })
  return new Map(seasonSlugs.map((slug, i) => [slug, (data[`s${i}`]?.nodes ?? []).map((n) => n.annictId)]))
}

interface RawWork {
  id: string
  annictId: number
  title: string
  media: string
  malAnimeId: string | null
  watchersCount: number
  viewerStatusState: StatusState | null
  image: { recommendedImageUrl: string | null; facebookOgImageUrl: string | null } | null
}

// そのクールの作品を、視聴者の多い順に取る
export async function fetchSeasonWorks(token: string, seasonSlug: string, limit = 30): Promise<AnnictWork[]> {
  const data = await gql<{ searchWorks: { nodes: RawWork[] } }>(
    token,
    `query($seasons: [String!], $first: Int) {
      searchWorks(seasons: $seasons, first: $first, orderBy: {field: WATCHERS_COUNT, direction: DESC}) {
        nodes {
          id annictId title media malAnimeId watchersCount viewerStatusState
          image { recommendedImageUrl facebookOgImageUrl }
        }
      }
    }`,
    { seasons: [seasonSlug], first: limit },
  )
  return data.searchWorks.nodes.map((w) => ({
    id: w.id,
    annictId: w.annictId,
    title: w.title,
    media: w.media,
    malAnimeId: w.malAnimeId,
    watchersCount: w.watchersCount,
    viewerStatusState: w.viewerStatusState,
    imageUrl: annictImageOf(w.image),
  }))
}

export async function updateStatus(token: string, workId: string, state: StatusState): Promise<void> {
  await gql(
    token,
    `mutation($workId: ID!, $state: StatusState!) {
      updateStatus(input: {workId: $workId, state: $state}) { work { id } }
    }`,
    { workId, state },
  )
}

// 作品の声優と監督（傾向の「よく見る声優・監督」に使う）。人物は Annict の ID と正式な名前
export interface WorkCredits {
  casts: { annictId: number; name: string }[]
  directors: { annictId: number; name: string }[]
}

// 監督とみなす役職（作画監督・音響監督などは含めない）
const DIRECTOR_ROLES = new Set(['監督', '総監督', 'シリーズ監督', 'チーフディレクター'])
const CREDIT_WORKS_PER_QUERY = 10

// 作品ごとの声優（主な10人）と監督。作品の ID（node の ID）ごと。裏の優先度で読む（傾向のシートのため）
export async function fetchCredits(token: string, workIds: readonly string[], opts: ScheduleOptions = {}): Promise<Map<string, WorkCredits>> {
  const out = new Map<string, WorkCredits>()
  const unique = [...new Set(workIds)]
  for (let i = 0; i < unique.length; i += CREDIT_WORKS_PER_QUERY) {
    const chunk = unique.slice(i, i + CREDIT_WORKS_PER_QUERY)
    const data = await gql<{
      nodes: ({
        id: string
        casts: { nodes: { person: { annictId: number; name: string } | null }[] }
        staffs: { nodes: { roleText: string; resource: { __typename?: string; annictId?: number; name?: string } | null }[] }
      } | null)[]
    }>(
      token,
      `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Work { id
        casts(first: 10, orderBy: {field: SORT_NUMBER, direction: ASC}) { nodes { person { annictId name } } }
        staffs(first: 50, orderBy: {field: SORT_NUMBER, direction: ASC}) { nodes { roleText resource { __typename ... on Person { annictId name } } } }
      } } }`,
      { ids: chunk },
      opts,
    )
    for (const n of data.nodes) {
      if (!n) continue
      const casts = n.casts.nodes.flatMap((c) => (c.person ? [{ annictId: c.person.annictId, name: c.person.name }] : []))
      const directors = n.staffs.nodes.flatMap((st) =>
        DIRECTOR_ROLES.has(st.roleText) && st.resource?.__typename === 'Person' && typeof st.resource.annictId === 'number' && st.resource.name
          ? [{ annictId: st.resource.annictId, name: st.resource.name }]
          : [],
      )
      out.set(n.id, { casts, directors })
    }
  }
  return out
}

// エピソード（話）。記録ページの「見てる」で、話ごとに記録するのに使う
export interface Episode {
  id: string
  annictId: number
  number: number | null
  // 「第6話」「#6」など、Annict の表記（無ければ null）
  numberText: string | null
  title: string | null
  // 自分が記録したか（記録した回数）
  viewerDidTrack: boolean
  viewerRecordsCount: number
}

export interface WorkEpisodes {
  workId: string
  // 話数の無い作品（劇場版など）は true
  noEpisodes: boolean
  episodes: Episode[]
}

const EPISODE_FIELDS = 'id annictId number numberText title viewerDidTrack viewerRecordsCount'
// 1回の問い合わせでまとめて読む作品の数と、1作品あたり1回に読む話数（長い作品は続きを読む）
const EPISODE_WORKS_PER_QUERY = 10
const EPISODES_PER_PAGE = 100
// 1作品の話数の上限（長寿番組で読み続けないため）
const MAX_EPISODES = 2000

type EpisodePage = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Episode[] }

// 作品ごとの話の一覧（放送順）。作品の ID（node の ID）ごと
export async function fetchEpisodes(token: string, workIds: readonly string[]): Promise<Map<string, WorkEpisodes>> {
  const out = new Map<string, WorkEpisodes>()
  const unique = [...new Set(workIds)]
  for (let i = 0; i < unique.length; i += EPISODE_WORKS_PER_QUERY) {
    const chunk = unique.slice(i, i + EPISODE_WORKS_PER_QUERY)
    const data = await gql<{ nodes: ({ id: string; noEpisodes: boolean; episodes: EpisodePage } | null)[] }>(
      token,
      `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Work { id noEpisodes
        episodes(first: ${EPISODES_PER_PAGE}, orderBy: {field: SORT_NUMBER, direction: ASC}) { pageInfo { hasNextPage endCursor } nodes { ${EPISODE_FIELDS} } }
      } } }`,
      { ids: chunk },
    )
    for (const n of data.nodes) {
      if (!n) continue
      const episodes = [...n.episodes.nodes]
      let page = n.episodes.pageInfo
      // 長い作品は、続きを1作品ずつ読む
      while (page.hasNextPage && page.endCursor && episodes.length < MAX_EPISODES) {
        const more = await gql<{ node: { episodes: EpisodePage } | null }>(
          token,
          `query($id: ID!, $after: String) { node(id: $id) { ... on Work {
            episodes(first: ${EPISODES_PER_PAGE}, after: $after, orderBy: {field: SORT_NUMBER, direction: ASC}) { pageInfo { hasNextPage endCursor } nodes { ${EPISODE_FIELDS} } }
          } } }`,
          { id: n.id, after: page.endCursor },
        )
        if (!more.node) break
        episodes.push(...more.node.episodes.nodes)
        page = more.node.episodes.pageInfo
      }
      out.set(n.id, { workId: n.id, noEpisodes: n.noEpisodes, episodes })
    }
  }
  return out
}

// 話を記録する（4段階の評価つき。感想の文は付けない）。戻り値は記録の ID（すぐ後の取り消しに使う）
export async function createRecord(token: string, episodeId: string, rating: RatingState | null): Promise<string> {
  const data = await gql<{ createRecord: { record: { id: string } } }>(
    token,
    `mutation($episodeId: ID!, $ratingState: RatingState) {
      createRecord(input: {episodeId: $episodeId, ratingState: $ratingState}) { record { id } }
    }`,
    { episodeId, ratingState: rating },
  )
  return data.createRecord.record.id
}

export async function deleteRecord(token: string, recordId: string): Promise<void> {
  await gql(token, `mutation($recordId: ID!) { deleteRecord(input: {recordId: $recordId}) { clientMutationId } }`, { recordId })
}

// 評価は「総合」だけを、本文なしの感想として送る（本文が空でも通ることは 2026-09-29 に確認済み）。
// 評価を付け直すときは、Annict のサイトで書かれていた本文を body で引き継ぐ
export async function createReview(token: string, workId: string, rating: RatingState, body = ''): Promise<string> {
  const data = await gql<{ createReview: { review: { id: string } } }>(
    token,
    `mutation($workId: ID!, $rating: RatingState, $body: String!) {
      createReview(input: {workId: $workId, body: $body, ratingOverallState: $rating}) { review { id } }
    }`,
    { workId, rating, body },
  )
  return data.createReview.review.id
}

export interface ReviewAxes {
  ratingOverallState: RatingState | null
  ratingStoryState: RatingState | null
  ratingAnimationState: RatingState | null
  ratingMusicState: RatingState | null
  ratingCharacterState: RatingState | null
}

// updateReview は5項目すべての評価が必須（UpdateReviewInput）。5項目そろった感想にしか使えない
export async function updateReview(token: string, reviewId: string, body: string, axes: { [K in keyof ReviewAxes]: RatingState }): Promise<void> {
  await gql(
    token,
    `mutation($reviewId: ID!, $body: String!, $o: RatingState!, $s: RatingState!, $a: RatingState!, $m: RatingState!, $c: RatingState!) {
      updateReview(input: {reviewId: $reviewId, body: $body, ratingOverallState: $o, ratingStoryState: $s,
        ratingAnimationState: $a, ratingMusicState: $m, ratingCharacterState: $c}) { review { id } }
    }`,
    {
      reviewId,
      body,
      o: axes.ratingOverallState,
      s: axes.ratingStoryState,
      a: axes.ratingAnimationState,
      m: axes.ratingMusicState,
      c: axes.ratingCharacterState,
    },
  )
}

export async function deleteReview(token: string, reviewId: string): Promise<void> {
  await gql(
    token,
    `mutation($reviewId: ID!) { deleteReview(input: {reviewId: $reviewId}) { work { id } } }`,
    { reviewId },
  )
}

export function annictWorkUrl(annictId: number): string {
  return `https://annict.com/works/${annictId}`
}

export function annictSearchUrl(title: string): string {
  return `https://annict.com/search?q=${encodeURIComponent(title)}`
}

export interface LibraryEntry {
  workId: string
  annictId: number
  title: string
  malAnimeId: string | null
  state: StatusState
  // その状態にした日時
  stateAt: string | null
  // 放送時期（記録ページの「新しい順」に使う。分からなければ null）
  seasonYear?: number | null
  seasonName?: string | null
  // 形式（Annict の Media: TV / OVA / MOVIE / WEB / OTHER）。記録ページの絞り込みに使う
  media?: string | null
  // Annict でこの作品を記録した人の数（傾向の「王道派か発掘派か」に使う）
  watchersCount?: number
  // Annict の API の画像（https のものだけ）。表紙に使う
  imageUrl?: string | null
}

// 最後に読んだ自分のライブラリ（起動中だけ）。参加作品の一覧に、自分の記録の印を付けるのに使う（そのためだけに読み直さない）
let lastLibrary: LibraryEntry[] | null = null

export function peekLibrary(): readonly LibraryEntry[] | null {
  return lastLibrary
}

// 自分のライブラリ。状態が消えている（未設定に戻した）項目は含めない
export async function fetchLibrary(token: string): Promise<LibraryEntry[]> {
  const out: LibraryEntry[] = []
  let after: string | null = null
  for (;;) {
    const data: {
      viewer: {
        libraryEntries: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          nodes: {
            status: { state: StatusState; createdAt: string | null } | null
            work: {
              id: string
              annictId: number
              title: string
              malAnimeId: string | null
              seasonYear: number | null
              seasonName: string | null
              media: string | null
              watchersCount: number
              image: { recommendedImageUrl: string | null; facebookOgImageUrl: string | null } | null
            }
          }[]
        }
      }
    } = await gql(
      token,
      `query($after: String) { viewer { libraryEntries(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { status { state createdAt } work { id annictId title malAnimeId seasonYear seasonName media watchersCount image { recommendedImageUrl facebookOgImageUrl } } }
      } } }`,
      { after },
    )
    const conn = data.viewer.libraryEntries
    for (const n of conn.nodes) {
      const state = n.status?.state
      if (!state || state === 'NO_STATE') continue
      out.push({
        workId: n.work.id,
        annictId: n.work.annictId,
        title: n.work.title,
        malAnimeId: n.work.malAnimeId,
        state,
        stateAt: n.status?.createdAt ?? null,
        seasonYear: n.work.seasonYear ?? null,
        seasonName: n.work.seasonName ?? null,
        media: n.work.media ?? null,
        watchersCount: n.work.watchersCount,
        imageUrl: annictImageOf(n.work.image),
      })
    }
    if (!conn.pageInfo.hasNextPage) {
      lastLibrary = out
      return out
    }
    after = conn.pageInfo.endCursor
  }
}

export interface MyReview extends ReviewAxes {
  id: string
  body: string
  createdAt: string
}

interface RawReviewItem extends Partial<ReviewAxes> {
  __typename: string
  id?: string
  body?: string
  createdAt?: string
  work?: { annictId: number }
}

// アクティビティの読み取りの結果
export interface ReviewScan {
  // 読んだ範囲にあった感想（作品の annictId → 感想）。同じ作品に複数あれば新しいものを採る
  reviews: Map<number, MyReview>
  // 読んだ範囲で一番新しいアクティビティの日時（種類は問わない）。1件も無ければ null
  newest: string | null
}

// 自分の感想はアクティビティから辿る。アクティビティは状態の変更やエピソードの記録も含み、感想よりずっと多いので、
// 新しい順（2026-10-03 に実測。既定は古い順）に読み、stopBefore より古い項目に来たらそこで止める。
// stopBefore が無ければ最後まで読む。
// 注意: 感想のアクティビティは作ったときだけ増える。Annict のサイトで感想を直した・消した変更は、差分の読み込みでは見えない
export async function scanMyReviews(token: string, opts: { stopBefore?: string | null } = {}): Promise<ReviewScan> {
  const stopAt = opts.stopBefore ? Date.parse(opts.stopBefore) : null
  const latest = new Map<number, MyReview>()
  let newest: string | null = null
  let after: string | null = null
  for (;;) {
    const data: {
      viewer: {
        activities: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
          edges: { item: RawReviewItem | null }[]
        }
      }
    } = await gql(
      token,
      `query($after: String) { viewer { activities(first: 100, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        edges { item { __typename
          ... on Review {
            id body createdAt work { annictId }
            ratingOverallState ratingStoryState ratingAnimationState ratingMusicState ratingCharacterState
          }
          ... on Status { createdAt }
          ... on Record { createdAt }
          ... on MultipleRecord { createdAt }
        } }
      } } }`,
      { after },
    )
    const conn = data.viewer.activities
    let reachedOld = false
    for (const { item } of conn.edges) {
      const at = item?.createdAt
      if (at && (!newest || Date.parse(at) > Date.parse(newest))) newest = at
      // 新しい順なので、これより後ろはすべて古い
      if (at && stopAt !== null && Date.parse(at) < stopAt) {
        reachedOld = true
        break
      }
      if (item?.__typename !== 'Review' || !item.id || !item.work || !item.createdAt) continue
      const prev = latest.get(item.work.annictId)
      if (prev && prev.createdAt >= item.createdAt) continue
      latest.set(item.work.annictId, {
        id: item.id,
        body: item.body ?? '',
        createdAt: item.createdAt,
        ratingOverallState: item.ratingOverallState ?? null,
        ratingStoryState: item.ratingStoryState ?? null,
        ratingAnimationState: item.ratingAnimationState ?? null,
        ratingMusicState: item.ratingMusicState ?? null,
        ratingCharacterState: item.ratingCharacterState ?? null,
      })
    }
    if (reachedOld || !conn.pageInfo.hasNextPage) break
    after = conn.pageInfo.endCursor
  }
  return { reviews: latest, newest }
}

export interface BrowseWork {
  id: string
  annictId: number
  title: string
  media: string
  seasonYear: number | null
  seasonName: string | null
  malAnimeId: string | null
  watchersCount: number
  viewerStatusState: StatusState | null
  // Annict の API の画像（https のものだけ）
  imageUrl?: string | null
  // Annict の満足度（0〜100。計算されていない作品は null。最近の作品はほとんど null）
  satisfactionRate?: number | null
}

export interface BrowsePage {
  works: BrowseWork[]
  endCursor: string | null
  hasNext: boolean
}

export type BrowseOrder = 'WATCHERS_COUNT' | 'SEASON'

// ブラウズの一覧。タイトル検索かクール指定のどちらか。並びは視聴者の多い順か、新しい順（放送時期の降順）
// titles と seasons を両方渡すと、両方に当てはまる作品（タイトルに含み、どれかのクールに放送）。seasons はいくつでも並べられる
export async function browseWorks(
  token: string,
  filter: { titles?: string[]; seasons?: string[] },
  opts: { after?: string | null; first?: number; order?: BrowseOrder } = {},
): Promise<BrowsePage> {
  const { after = null, first = 30, order = 'WATCHERS_COUNT' } = opts
  const data = await gql<{
    searchWorks: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
      nodes: (Omit<BrowseWork, 'imageUrl'> & { image: { recommendedImageUrl: string | null; facebookOgImageUrl: string | null } | null })[]
    }
  }>(
    token,
    `query($titles: [String!], $seasons: [String!], $after: String, $first: Int, $order: WorkOrderField!) {
      searchWorks(titles: $titles, seasons: $seasons, first: $first, after: $after, orderBy: {field: $order, direction: DESC}) {
        pageInfo { hasNextPage endCursor }
        nodes { id annictId title media seasonYear seasonName malAnimeId watchersCount viewerStatusState satisfactionRate image { recommendedImageUrl facebookOgImageUrl } }
      }
    }`,
    { titles: filter.titles ?? null, seasons: filter.seasons ?? null, after, first, order },
  )
  const conn = data.searchWorks
  const works = conn.nodes.map(({ image, ...w }) => ({ ...w, imageUrl: annictImageOf(image) }))
  return { works, endCursor: conn.pageInfo.endCursor, hasNext: conn.pageInfo.hasNextPage }
}

export interface WorkDetail extends BrowseWork {
  titleKana: string | null
  episodesCount: number
  officialSiteUrl: string | null
  wikipediaUrl: string | null
  twitterUsername: string | null
  // 作品の権利表記（Annict の画像の著作権。例: ©山田鐘人・アベツカサ／小学館／「葬送のフリーレン」製作委員会）
  copyright: string | null
  // name は作品のクレジットの表記。person / ref は Annict の人物・団体（参加作品の一覧を開くのに使う。無ければ null）
  casts: { character: string; name: string; person: Credit | null }[]
  staffs: { role: string; name: string; ref: Credit | null }[]
  // 作品が入っている Annict のシリーズ（利用者が整理したもの。無い作品もある）。作品は放送時期の順
  series: AnnictSeries[]
}

// キャスト・スタッフの人物か団体（制作会社など）。name は Annict の正式な名前（クレジットの表記と違うことがある）
export interface Credit {
  kind: 'person' | 'org'
  annictId: number
  name: string
  // 団体の英語名（Shikimori の制作会社と照合するのに使う）
  nameEn?: string | null
}

export interface SeriesWork {
  id: string
  annictId: number
  title: string
  seasonYear: number | null
  seasonName: string | null
  media: string
  malAnimeId: string | null
  viewerStatusState: StatusState | null
  // シリーズの中での位置づけ（「第2期」「劇場版」など。利用者が書いた短い説明。無いこともある）
  summary: string | null
}

export interface AnnictSeries {
  name: string
  works: SeriesWork[]
}

function creditOf(r: { __typename?: string; annictId?: number; name?: string; nameEn?: string } | null): Credit | null {
  if (!r || typeof r.annictId !== 'number' || !r.name) return null
  if (r.__typename === 'Person') return { kind: 'person', annictId: r.annictId, name: r.name }
  if (r.__typename === 'Organization') return { kind: 'org', annictId: r.annictId, name: r.name, nameEn: r.nameEn || null }
  return null
}

// Annict の人物・団体のページ（参加作品を Shikimori で見つけられなかったときの、行き先を名前に書いたリンク）
export function annictCreditUrl(c: Credit): string {
  return `https://annict.com/${c.kind === 'person' ? 'people' : 'organizations'}/${c.annictId}`
}

// 作品の詳細。Staff.roleOther はスキーマ上 null にならないはずだが実際は null を返し、
// 取るとスタッフ一覧ごと失敗する（2026-09-30 に確認）ので取らない
export async function fetchWorkDetail(token: string, workId: string): Promise<WorkDetail> {
  const data = await gql<{
    node: Omit<WorkDetail, 'casts' | 'staffs' | 'copyright' | 'series'> & {
      image: { copyright: string | null } | null
      seriesList: { nodes: { name: string; works: { edges: { summary: string | null; item: Omit<SeriesWork, 'summary'> }[] } }[] } | null
      casts: { nodes: { name: string; character: { name: string }; person: { annictId: number; name: string } | null }[] }
      staffs: { nodes: { name: string; roleText: string; resource: { __typename?: string; annictId?: number; name?: string; nameEn?: string } | null }[] }
    }
  }>(
    token,
    `query($id: ID!) { node(id: $id) { ... on Work {
      id annictId title titleKana media seasonYear seasonName malAnimeId watchersCount viewerStatusState
      episodesCount officialSiteUrl wikipediaUrl twitterUsername image { copyright }
      casts(first: 12, orderBy: {field: SORT_NUMBER, direction: ASC}) { nodes { name character { name } person { annictId name } } }
      staffs(first: 50, orderBy: {field: SORT_NUMBER, direction: ASC}) { nodes { name roleText
        resource { __typename ... on Person { annictId name } ... on Organization { annictId name nameEn } } } }
      seriesList(first: 5) { nodes { name works(first: 50, orderBy: {field: SEASON, direction: ASC}) {
        edges { summary item { id annictId title seasonYear seasonName media malAnimeId viewerStatusState } }
      } } }
    } } }`,
    { id: workId },
  )
  const { image, seriesList, ...n } = data.node
  return {
    ...n,
    series: (seriesList?.nodes ?? []).map((s) => ({
      name: s.name,
      works: s.works.edges.map((e) => ({ ...e.item, summary: e.summary?.trim() || null })),
    })),
    copyright: image?.copyright?.trim() || null,
    casts: n.casts.nodes.map((c) => ({
      character: c.character.name,
      name: c.name,
      person: c.person ? { kind: 'person' as const, annictId: c.person.annictId, name: c.person.name } : null,
    })),
    staffs: n.staffs.nodes.map((st) => ({ role: st.roleText, name: st.name, ref: creditOf(st.resource) })),
  }
}

export interface WorkRef {
  id: string
  annictId: number
  title: string
  malAnimeId: string | null
}

export async function searchWorksByTitle(token: string, title: string): Promise<WorkRef[]> {
  const data = await gql<{ searchWorks: { nodes: WorkRef[] } }>(
    token,
    `query($titles: [String!]) { searchWorks(titles: $titles, first: 30) { nodes { id annictId title malAnimeId } } }`,
    { titles: [title] },
  )
  return data.searchWorks.nodes
}
