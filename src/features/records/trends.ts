import type { RatingState, WorkCredits } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import { bucketOf, mediaKindOf, type MediaKind, type RecordRow, type SeasonKey } from './recordList'

// 記録ページの「傾向」。記録・作品の情報（Shikimori）・声優と監督（Annict）を端末で集計する。すべて純粋な関数

// 4段階の評価を点に（平均を出すため）。良くない 1 〜 とても良い 4
export const RATING_POINT: Record<RatingState, number> = { BAD: 1, AVERAGE: 2, GOOD: 3, GREAT: 4 }
// 世間の点数（Shikimori の10点満点）と比べるときの、4段階のおおよその点
const RATING_AS_TEN: Record<RatingState, number> = { BAD: 4, AVERAGE: 6, GOOD: 7.5, GREAT: 9 }

const ratingOf = (r: RecordRow): RatingState | null => r.review?.ratingOverallState ?? null
const watched = (rows: readonly RecordRow[]) => rows.filter((r) => r.entry.state === 'WATCHED')
const malOf = (r: RecordRow): number | null => {
  const n = Number(r.entry.malAnimeId)
  return Number.isInteger(n) && n > 0 ? n : null
}
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export interface Summary {
  watched: number
  watching: number
  wanna: number
  stopped: number
  rated: number
  // 完走率（見た ÷（見た＋視聴中断））。どちらも無ければ null
  completion: number | null
}

export function summarize(rows: readonly RecordRow[]): Summary {
  const count = (b: ReturnType<typeof bucketOf>) => rows.filter((r) => bucketOf(r.entry.state) === b).length
  const w = count('watched')
  const stopped = count('other')
  return {
    watched: w,
    watching: count('watching'),
    wanna: count('wanna'),
    stopped,
    rated: rows.filter((r) => ratingOf(r)).length,
    completion: w + stopped > 0 ? w / (w + stopped) : null,
  }
}

// 評価の分布（とても良い → 良くない の順）と、見たが評価していない数
export function ratingCounts(rows: readonly RecordRow[]): { counts: Record<RatingState, number>; unrated: number } {
  const counts: Record<RatingState, number> = { GREAT: 0, GOOD: 0, AVERAGE: 0, BAD: 0 }
  let unrated = 0
  for (const r of rows) {
    const rating = ratingOf(r)
    if (rating) counts[rating]++
    else if (r.entry.state === 'WATCHED') unrated++
  }
  return { counts, unrated }
}

// 辛口度: 評価した作品で、自分の評価（10点満点に寄せた点）と世間の点数（Shikimori）の差の平均。
// プラスなら世間より甘口、マイナスなら辛口。比べられる作品が5本未満なら null
export function harshness(rows: readonly RecordRow[], media: ReadonlyMap<number, Media>): { diff: number; n: number; label: string } | null {
  const diffs: number[] = []
  for (const r of rows) {
    const rating = ratingOf(r)
    const mal = malOf(r)
    const score = mal ? media.get(mal)?.score : null
    if (rating && typeof score === 'number') diffs.push(RATING_AS_TEN[rating] - score)
  }
  const d = mean(diffs)
  if (d === null || diffs.length < 5) return null
  const label = d >= 0.5 ? '世間より甘口' : d <= -0.5 ? '世間より辛口' : '世間とほぼ同じ'
  return { diff: d, n: diffs.length, label }
}

export interface GenreAxis {
  name: string
  // 見た本数と、そのうち評価した作品の平均（1〜4。評価が無ければ null）
  count: number
  average: number | null
}

// ジャンルの好み（レーダーチャートの軸）。見た作品のジャンル・テーマのうち本数の多い順に max 個（2本以上のものだけ）
export function genreAxes(rows: readonly RecordRow[], media: ReadonlyMap<number, Media>, max = 6): GenreAxis[] {
  const acc = new Map<string, { count: number; points: number[] }>()
  for (const r of watched(rows)) {
    const mal = malOf(r)
    const m = mal ? media.get(mal) : undefined
    if (!m) continue
    const rating = ratingOf(r)
    for (const g of new Set([...m.genres, ...m.themes])) {
      const a = acc.get(g) ?? { count: 0, points: [] }
      a.count++
      if (rating) a.points.push(RATING_POINT[rating])
      acc.set(g, a)
    }
  }
  return [...acc]
    .filter(([, a]) => a.count >= 2)
    .sort((x, y) => y[1].count - x[1].count || x[0].localeCompare(y[0]))
    .slice(0, max)
    .map(([name, a]) => ({ name, count: a.count, average: mean(a.points) }))
}

export interface YearBar {
  year: number
  count: number
  average: number | null
}

// 放送年ごとの見た本数（いちばん古い年からいちばん新しい年まで、無い年も0で並べる）
export function byYear(rows: readonly RecordRow[]): YearBar[] {
  const acc = new Map<number, { count: number; points: number[] }>()
  for (const r of watched(rows)) {
    const y = r.entry.seasonYear
    if (!y) continue
    const a = acc.get(y) ?? { count: 0, points: [] }
    a.count++
    const rating = ratingOf(r)
    if (rating) a.points.push(RATING_POINT[rating])
    acc.set(y, a)
  }
  if (acc.size === 0) return []
  const years = [...acc.keys()]
  const out: YearBar[] = []
  for (let y = Math.min(...years); y <= Math.max(...years); y++) {
    const a = acc.get(y)
    out.push({ year: y, count: a?.count ?? 0, average: a ? mean(a.points) : null })
  }
  return out
}

// 黄金期: 続く3年のうち、評価した作品が4本以上あって平均評価がいちばん高いところ。無ければ null
export function goldenPeriod(rows: readonly RecordRow[]): { from: number; to: number; average: number; n: number } | null {
  const points = new Map<number, number[]>()
  for (const r of watched(rows)) {
    const rating = ratingOf(r)
    const y = r.entry.seasonYear
    if (!rating || !y) continue
    points.set(y, [...(points.get(y) ?? []), RATING_POINT[rating]])
  }
  let best: { from: number; to: number; average: number; n: number } | null = null
  for (const y of points.keys()) {
    const xs = [y, y + 1, y + 2].flatMap((k) => points.get(k) ?? [])
    const avg = mean(xs)
    if (avg === null || xs.length < 4) continue
    if (!best || avg > best.average || (avg === best.average && xs.length > best.n)) best = { from: y, to: y + 2, average: avg, n: xs.length }
  }
  return best
}

// 形式の割合（見た作品）
export function formatShare(rows: readonly RecordRow[]): { kind: MediaKind; count: number }[] {
  const order: MediaKind[] = ['tv', 'movie', 'ova', 'other']
  const counts = new Map<MediaKind, number>(order.map((k) => [k, 0]))
  for (const r of watched(rows)) {
    const k = mediaKindOf(r.entry.media)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return order.map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
}

// 季節ごとの見た本数
export function seasonCounts(rows: readonly RecordRow[]): Record<SeasonKey, number> {
  const out: Record<SeasonKey, number> = { WINTER: 0, SPRING: 0, SUMMER: 0, AUTUMN: 0 }
  for (const r of watched(rows)) {
    const s = r.entry.seasonName as SeasonKey | null | undefined
    if (s && s in out) out[s]++
  }
  return out
}

export interface Contrast {
  row: RecordRow
  rating: RatingState
  score: number
}

// 世間との比較。gems: 自分は「良い」以上なのに世間の点数が低い順。overrated: 世間の点数が高いのに自分は「普通」以下、点数の高い順
export function contrasts(rows: readonly RecordRow[], media: ReadonlyMap<number, Media>, max = 3): { gems: Contrast[]; overrated: Contrast[] } {
  const list: Contrast[] = []
  for (const r of rows) {
    const rating = ratingOf(r)
    const mal = malOf(r)
    const score = mal ? media.get(mal)?.score : null
    if (rating && typeof score === 'number') list.push({ row: r, rating, score })
  }
  const gems = list
    .filter((c) => RATING_POINT[c.rating] >= 3)
    .sort((a, b) => RATING_AS_TEN[b.rating] - b.score - (RATING_AS_TEN[a.rating] - a.score) || a.score - b.score)
    .filter((c) => RATING_AS_TEN[c.rating] - c.score >= 1)
    .slice(0, max)
  const overrated = list
    .filter((c) => RATING_POINT[c.rating] <= 2 && c.score >= 7.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
  return { gems, overrated }
}

// 王道派か発掘派か: 見た作品の、Annict で記録した人の数の中央値
export function mainstream(rows: readonly RecordRow[]): { median: number; label: string; n: number } | null {
  const xs = watched(rows)
    .map((r) => r.entry.watchersCount)
    .filter((n): n is number => typeof n === 'number' && n > 0)
    .sort((a, b) => a - b)
  if (xs.length < 5) return null
  const mid = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2
  const label = mid >= 8000 ? '王道派' : mid <= 2000 ? '発掘派' : 'バランス派'
  return { median: Math.round(mid), label, n: xs.length }
}

export interface Ranked {
  key: string
  name: string
  count: number
  average: number | null
}

function rank(entries: readonly { key: string; name: string; rating: RatingState | null }[], max: number): Ranked[] {
  const acc = new Map<string, { name: string; count: number; points: number[] }>()
  for (const e of entries) {
    const a = acc.get(e.key) ?? { name: e.name, count: 0, points: [] }
    a.count++
    if (e.rating) a.points.push(RATING_POINT[e.rating])
    acc.set(e.key, a)
  }
  return [...acc]
    .filter(([, a]) => a.count >= 2)
    .sort((x, y) => y[1].count - x[1].count || (mean(y[1].points) ?? 0) - (mean(x[1].points) ?? 0) || x[1].name.localeCompare(y[1].name))
    .slice(0, max)
    .map(([key, a]) => ({ key, name: a.name, count: a.count, average: mean(a.points) }))
}

// よく見る声優・監督（Annict の声優と監督）・制作会社（Shikimori）。見た作品で2本以上のもの、多い順に max 人（社）
export function topPeople(
  rows: readonly RecordRow[],
  credits: ReadonlyMap<string, WorkCredits> | null,
  media: ReadonlyMap<number, Media>,
  max = 5,
): { casts: Ranked[] | null; directors: Ranked[] | null; studios: Ranked[] } {
  const w = watched(rows)
  const studios = rank(
    w.flatMap((r) => {
      const mal = malOf(r)
      const m = mal ? media.get(mal) : undefined
      return m ? [...new Set(m.studios)].map((name) => ({ key: name, name, rating: ratingOf(r) })) : []
    }),
    max,
  )
  if (!credits) return { casts: null, directors: null, studios }
  const casts = rank(
    w.flatMap((r) => (credits.get(r.entry.workId)?.casts ?? []).map((p) => ({ key: String(p.annictId), name: p.name, rating: ratingOf(r) }))),
    max,
  )
  const directors = rank(
    w.flatMap((r) => (credits.get(r.entry.workId)?.directors ?? []).map((p) => ({ key: String(p.annictId), name: p.name, rating: ratingOf(r) }))),
    max,
  )
  return { casts, directors, studios }
}

export interface Affinity {
  key: string
  // 同じ作品群にだけ出ている声優は1行にまとめる（「緒方恵美・山口由里子」）
  name: string
  // 相性の点（10点満点の差。プラスは世間より高く、マイナスは低く評価している）
  score: number
  // 比べられた作品（評価した・世間の点数がある）の数と、そのシリーズの数
  n: number
  series: number
  // 相性をいちばんよく表す作品（プラスなら差のいちばん大きい作品）
  example: { title: string; rating: RatingState; world: number } | null
}

// 題名の頭（シリーズをまとめる手がかり）。「劇場版」・空白・記号を除いた先頭5文字
export function titleHead(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/劇場版|映画/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .slice(0, 5)
}

// 作品をシリーズにまとめる。作品の ID → シリーズの代表の ID。比べる作品の中だけでたどる。
// 手がかりは Shikimori の関連作品・前作のつながりと、題名の頭が同じこと（分割クールは関連作品でつながっていないことがある）
function seriesOf(works: readonly { mal: number; title: string }[], media: ReadonlyMap<number, Media>): Map<number, number> {
  const parent = new Map(works.map((w) => [w.mal, w.mal]))
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const join = (x: number, y: number) => {
    const a = find(x)
    const b = find(y)
    if (a !== b) parent.set(a, b)
  }
  const byHead = new Map<string, number>()
  for (const w of works) {
    const m = media.get(w.mal)
    for (const other of [...(m?.prequels ?? []), ...(m?.related ?? []).map((x) => x.malId)]) if (parent.has(other)) join(w.mal, other)
    const head = titleHead(w.title)
    if (head.length < 3) continue
    const first = byHead.get(head)
    if (first === undefined) byHead.set(head, w.mal)
    else join(w.mal, first)
  }
  return new Map(works.map((w) => [w.mal, find(w.mal)]))
}

// 声優との相性。出演本数の多さではなく「その声優の作品を、世間よりどれだけ高く（低く）評価したか」で並べる（隠れ推しを掘り出す）。
// 1. 評価した作品ごとに、自分の評価（10点満点に寄せた点）− 世間の点数（Shikimori）
// 2. その人の甘口・辛口のくせ（全作品の差の平均）を引く
// 3. 声優ごとに、シリーズの中は平均して1つにし（シリーズが好きなだけの分を数えすぎない）、シリーズの値を足して（シリーズ数 + prior）で割る。
//    シリーズが少ないうちは0に寄せる。よく出る声優でも、評価が世間並みなら0に近い
// 2つ以上のシリーズ（minSeries）に出ている声優だけを出す。同じ作品群にだけ出ている声優どうしは1行にまとめる。
// 比べられる作品が5本未満なら null（くせを測れない）。liked は threshold 以上の高い順、unliked は -threshold 以下の低い順
export function castAffinity(
  rows: readonly RecordRow[],
  credits: ReadonlyMap<string, WorkCredits>,
  media: ReadonlyMap<number, Media>,
  opts: { max?: number; maxUnliked?: number; minSeries?: number; prior?: number; threshold?: number } = {},
): { liked: Affinity[]; unliked: Affinity[]; n: number } | null {
  const { max = 5, maxUnliked = 3, minSeries = 2, prior = 2, threshold = 0.3 } = opts
  const compared: { row: RecordRow; mal: number; rating: RatingState; world: number; diff: number }[] = []
  for (const r of watched(rows)) {
    const rating = ratingOf(r)
    const mal = malOf(r)
    const world = mal ? media.get(mal)?.score : null
    if (mal && rating && typeof world === 'number' && world > 0) compared.push({ row: r, mal, rating, world, diff: RATING_AS_TEN[rating] - world })
  }
  if (compared.length < 5) return null
  const bias = mean(compared.map((c) => c.diff)) ?? 0
  const series = seriesOf(
    compared.map((c) => ({ mal: c.mal, title: c.row.entry.title })),
    media,
  )
  type Item = { c: (typeof compared)[number]; residual: number }
  const acc = new Map<string, { names: string[]; items: Item[] }>()
  for (const c of compared) {
    for (const p of credits.get(c.row.entry.workId)?.casts ?? []) {
      const key = String(p.annictId)
      const a = acc.get(key) ?? { names: [p.name], items: [] }
      // 同じ作品に同じ声優が2役でも1本と数える
      if (!a.items.some((it) => it.c === c)) a.items.push({ c, residual: c.diff - bias })
      acc.set(key, a)
    }
  }
  // 同じ作品群にだけ出ている声優をまとめる（点も例も同じになるので、別の行にしても情報が増えない）
  const groups = new Map<string, { key: string; names: string[]; items: Item[] }>()
  for (const [key, a] of acc) {
    const works = a.items
      .map((it) => it.c.row.entry.workId)
      .sort()
      .join(',')
    const g = groups.get(works)
    if (g) g.names.push(...a.names)
    else groups.set(works, { key, names: [...a.names], items: a.items })
  }
  const all: Affinity[] = []
  for (const g of groups.values()) {
    const bySeries = new Map<number, number[]>()
    for (const it of g.items) {
      const k = series.get(it.c.mal) ?? it.c.mal
      bySeries.set(k, [...(bySeries.get(k) ?? []), it.residual])
    }
    if (bySeries.size < minSeries) continue
    const score = [...bySeries.values()].reduce((x, rs) => x + (mean(rs) ?? 0), 0) / (bySeries.size + prior)
    const best = [...g.items].sort((x, y) => (score >= 0 ? y.residual - x.residual : x.residual - y.residual))[0]
    const name = g.names.length > 3 ? `${g.names.slice(0, 3).join('・')} ほか` : g.names.join('・')
    all.push({ key: g.key, name, score, n: g.items.length, series: bySeries.size, example: best ? { title: best.c.row.entry.title, rating: best.c.rating, world: best.c.world } : null })
  }
  const liked = all
    .filter((x) => x.score >= threshold)
    .sort((x, y) => y.score - x.score || y.series - x.series || x.name.localeCompare(y.name))
    .slice(0, max)
  const unliked = all
    .filter((x) => x.score <= -threshold)
    .sort((x, y) => x.score - y.score || y.series - x.series || x.name.localeCompare(y.name))
    .slice(0, maxUnliked)
  return { liked, unliked, n: compared.length }
}

export interface AxisWeight {
  key: 'ratingAnimationState' | 'ratingCharacterState' | 'ratingStoryState' | 'ratingMusicState'
  // その項目を付けた作品の数と、平均（1〜4）
  n: number
  average: number
  // 総合評価との連動（相関係数 -1〜1）。作品が min 本未満か、どちらかが全部同じ評価なら null
  link: number | null
}

const AXIS_ORDER = ['ratingAnimationState', 'ratingCharacterState', 'ratingStoryState', 'ratingMusicState'] as const

function correlation(xs: readonly number[], ys: readonly number[]): number | null {
  const mx = mean(xs)
  const my = mean(ys)
  if (mx === null || my === null) return null
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my)
    sxx += (x - mx) ** 2
    syy += (ys[i] - my) ** 2
  })
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

// 重視する観点: 項目別の評価（映像・キャラクター・ストーリー・音楽）が、総合評価とどれだけ連動しているか。
// 連動が強い項目ほど、その人の総合評価を左右している（＝重視している）と読む。総合評価と項目の両方がある感想だけを使う。
// top: 連動がいちばん強い項目（0.3 以上のときだけ）
export function axisWeights(rows: readonly RecordRow[], min = 5): { axes: AxisWeight[]; top: AxisWeight | null } {
  const axes = AXIS_ORDER.map((key) => {
    const pairs = rows.flatMap((r) => {
      const o = r.review?.ratingOverallState
      const a = r.review?.[key]
      return o && a ? [[RATING_POINT[a], RATING_POINT[o]] as const] : []
    })
    const link = pairs.length >= min ? correlation(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null
    return { key, n: pairs.length, average: mean(pairs.map((p) => p[0])) ?? 0, link }
  }).filter((a) => a.n > 0)
  const ranked = axes.filter((a) => a.link !== null).sort((a, b) => b.link! - a.link!)
  return { axes, top: ranked[0] && ranked[0].link! >= 0.3 ? ranked[0] : null }
}

export interface YearReview {
  year: number
  watched: number
  rated: number
  // 評価した作品の平均（1〜4）
  average: number | null
  // 1月〜12月の本数
  months: number[]
  // いちばん多く見た月（1〜12）。同じなら早い月。1本も無ければ null
  busiest: { month: number; count: number } | null
  // いちばん良かった作品（とても良い → 良い、同じ評価の中は見た日の新しい順）
  best: RecordRow[]
  genres: { name: string; count: number }[]
  casts: { name: string; count: number }[]
}

const yearOf = (iso: string | null): number | null => {
  const t = iso ? new Date(iso) : null
  return t && !Number.isNaN(t.getTime()) ? t.getFullYear() : null
}

// ふり返りのできる年（見たにした日がある年。新しい順）
export function reviewYears(rows: readonly RecordRow[]): number[] {
  return [...new Set(watched(rows).map((r) => yearOf(r.entry.stateAt)).filter((y): y is number => y !== null))].sort((a, b) => b - a)
}

// 年間のふり返り。その年に Annict で「見た」にした作品で数える（まとめて記録した作品は、記録した日の年に入る）
export function yearReview(rows: readonly RecordRow[], year: number, media: ReadonlyMap<number, Media>, credits: ReadonlyMap<string, WorkCredits> | null, max = 3): YearReview {
  const inYear = watched(rows).filter((r) => yearOf(r.entry.stateAt) === year)
  const months = Array.from({ length: 12 }, () => 0)
  for (const r of inYear) months[new Date(r.entry.stateAt!).getMonth()]++
  const top = Math.max(...months)
  const points = inYear.flatMap((r) => (ratingOf(r) ? [RATING_POINT[ratingOf(r)!]] : []))
  const best = inYear
    .filter((r) => {
      const rt = ratingOf(r)
      return rt === 'GREAT' || rt === 'GOOD'
    })
    .sort((a, b) => RATING_POINT[ratingOf(b)!] - RATING_POINT[ratingOf(a)!] || Date.parse(b.entry.stateAt!) - Date.parse(a.entry.stateAt!))
    .slice(0, 5)
  const count = (names: string[][]) => {
    const acc = new Map<string, number>()
    for (const list of names) for (const n of new Set(list)) acc.set(n, (acc.get(n) ?? 0) + 1)
    return [...acc]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([name, c]) => ({ name, count: c }))
  }
  const genres = count(
    inYear.map((r) => {
      const mal = malOf(r)
      const m = mal ? media.get(mal) : undefined
      return m ? [...m.genres, ...m.themes] : []
    }),
  )
  const casts = credits ? count(inYear.map((r) => (credits.get(r.entry.workId)?.casts ?? []).map((c) => c.name))) : []
  return {
    year,
    watched: inYear.length,
    rated: points.length,
    average: mean(points),
    months,
    busiest: top > 0 ? { month: months.indexOf(top) + 1, count: top } : null,
    best,
    genres,
    casts,
  }
}

// 記録のペース: 直近 months か月の、月ごとに「見た」にした本数（古い月から）
export function monthlyPace(rows: readonly RecordRow[], now: Date, months = 12): { label: string; count: number }[] {
  const out: { key: string; label: string; count: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${d.getMonth() + 1}月`, count: 0 })
  }
  for (const r of watched(rows)) {
    const t = r.entry.stateAt ? new Date(r.entry.stateAt) : null
    if (!t || Number.isNaN(t.getTime())) continue
    const slot = out.find((o) => o.key === `${t.getFullYear()}-${t.getMonth()}`)
    if (slot) slot.count++
  }
  return out.map(({ label, count }) => ({ label, count }))
}
