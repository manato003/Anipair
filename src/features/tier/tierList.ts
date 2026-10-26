import type { LibraryEntry, RatingState, StatusState } from '../../lib/annict'
import { seasonOfWork, type Season, type SeasonName } from '../../lib/season'
import type { RecordRow } from '../records/recordList'

// 記録の「まとめ ▸ Tier表」の中身。すべて純粋な関数。
// 表は Annict の評価で仮に並べてから、利用者が並べ直す。Annict には書き戻さない（Tier は範囲の中の相対評価で、Annict の評価とは別のもの）。
// 作品は Annict の作品 ID で持つ（共有のリンクに出すときだけ MyAnimeList の ID に直す）

// 範囲。最初の表は見た作品すべて（all）。2つ目からは自分で選んだ作品（picked。作品は TierTable.works）。
// クール・年・期間（period: 放送年の「から〜まで」と季節）は、前の版で作った表を読むために残している
export type TierScope =
  | { kind: 'cour'; year: number; name: SeasonName }
  | { kind: 'year'; year: number }
  | { kind: 'period'; from: number | null; to: number | null; seasons: SeasonName[] }
  | { kind: 'all' }
  | { kind: 'picked' }

// 選んだ表に足した作品。記録に無い作品も出せるよう、題名・表紙・共有に要る分を控える
export interface TierWork {
  annictId: number
  // Annict の作品の ID（詳細を開くのに使う）
  workId: string
  title: string
  titleEn?: string | null
  malAnimeId: string | null
  seasonYear: number | null
  seasonName: string | null
  imageUrl?: string | null
}

export interface Tier {
  name: string
  // 並び順の作品（Annict の作品 ID）
  items: number[]
}

export interface TierTable {
  id: string
  title: string
  scope: TierScope
  // 視聴中断（一時中断・視聴中止）の作品も入れるか
  includeDropped: boolean
  // 選んだ表（scope が picked）の作品。足した順
  works?: TierWork[]
  tiers: Tier[]
  // 自分で「段から外す」で戻した作品（評価があっても自動で段に置かない）
  held?: number[]
  // 「表に入れない」にした作品（この表だけ。段にも「まだ置いていない」にも出さず、共有のリンクにも入れない）
  excluded?: number[]
  // 「全部自分で置く」で作った表（評価のある作品も自動で段に置かない）
  manual?: true
  // 最後に変えた日時（端末どうしで合わせるとき、新しい方を採る）
  updatedAt: string
  // 共有のリンク（作ったときだけ）。key は編集の鍵で、作った人の端末とその人の GitHub（private）にだけ置く。at はリンクの中身を送った日時
  share?: TierShare
}

export interface TierShare {
  id: string
  key: string
  at: string
}

export const TIER_MIN = 2
export const TIER_MAX = 10
export const TIER_DEFAULT = 5
export const TABLE_MAX = 5
export const TIER_NAME_MAX = 12
export const TITLE_MAX = 40
export const WORKS_MAX = 500

// 段の既定の名前（上から）
const LETTERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const

export const defaultTierName = (index: number): string => LETTERS[index] ?? String(index + 1)

// 段の色（上から赤・橙・黄・緑…）。段が多いほど青・紫まで広げる。画面と共有のカードの画像で同じ色にする
export function tierColor(index: number, count: number): string {
  const step = count > 1 ? Math.min(36, 270 / (count - 1)) : 0
  return `hsl(${Math.round(index * step)} 85% 72%)`
}

// 良い順
const RATING_RANK: Record<RatingState, number> = { GREAT: 0, GOOD: 1, AVERAGE: 2, BAD: 3 }

// 放送の季節（1年の中の順）
const SEASONS: readonly SeasonName[] = ['winter', 'spring', 'summer', 'autumn']

const WATCHED_STATES: readonly StatusState[] = ['WATCHED', 'WATCHING']
const DROPPED_STATES: readonly StatusState[] = ['ON_HOLD', 'STOP_WATCHING']

export function inScope(row: RecordRow, scope: TierScope, includeDropped: boolean): boolean {
  if (scope.kind === 'picked') return false
  const state = row.entry.state
  if (!WATCHED_STATES.includes(state) && !(includeDropped && DROPPED_STATES.includes(state))) return false
  if (scope.kind === 'all') return true
  const season: Season | null = seasonOfWork(row.entry)
  if (!season) return false
  if (scope.kind === 'period') {
    return (scope.from === null || season.year >= scope.from) && (scope.to === null || season.year <= scope.to) && (scope.seasons.length === 0 || scope.seasons.includes(season.name))
  }
  return scope.kind === 'year' ? season.year === scope.year : season.year === scope.year && season.name === scope.name
}

// 放送年の「から〜まで」と季節から範囲を作る。年が逆なら入れ替え、季節は冬・春・夏・秋の順にそろえる。
// 1つのクール・1つの年・すべてになる期間は、その形にする（題名や説明の文がそれぞれの言い方になる）
export function periodScope(from: number | null, to: number | null, seasons: readonly SeasonName[]): TierScope {
  if (from !== null && to !== null && from > to) [from, to] = [to, from]
  const names = SEASONS.filter((n) => seasons.includes(n))
  if (from === null && to === null && names.length === 0) return { kind: 'all' }
  if (from !== null && from === to && names.length === 0) return { kind: 'year', year: from }
  if (from !== null && from === to && names.length === 1) return { kind: 'cour', year: from, name: names[0] }
  return { kind: 'period', from, to, seasons: names }
}

// 範囲に入る作品（その状態にした日の新しい順）。選んだ表は足した順で、記録にある作品は記録の行、無い作品は控えから作った行
export function candidates(rows: readonly RecordRow[], table: Pick<TierTable, 'scope' | 'includeDropped' | 'works'>): RecordRow[] {
  if (table.scope.kind === 'picked') {
    const byId = new Map(rows.map((r) => [r.entry.annictId, r]))
    return (table.works ?? []).map((w) => byId.get(w.annictId) ?? pickedRow(w))
  }
  return rows.filter((r) => inScope(r, table.scope, table.includeDropped)).sort((a, b) => (b.entry.stateAt ?? '').localeCompare(a.entry.stateAt ?? ''))
}

// 記録に無い作品の行（表紙は画面が読んで足す）
export function pickedRow(w: TierWork): RecordRow {
  const entry: LibraryEntry = {
    workId: w.workId,
    annictId: w.annictId,
    title: w.title,
    titleEn: w.titleEn ?? null,
    malAnimeId: w.malAnimeId,
    state: 'NO_STATE',
    stateAt: null,
    seasonYear: w.seasonYear,
    seasonName: w.seasonName,
    imageUrl: w.imageUrl ?? null,
  }
  return { entry, review: null, cover: null }
}

// 空の選んだ表。作品はあとから足す（評価で仮に置かないので manual）
export function createPickedTable(opts: { id: string; title: string; count?: number }, now: Date = new Date()): TierTable {
  const count = clampCount(opts.count ?? TIER_DEFAULT)
  const tiers: Tier[] = Array.from({ length: count }, (_, i) => ({ name: defaultTierName(i), items: [] }))
  return { id: opts.id, title: cleanTitle(opts.title, ''), scope: { kind: 'picked' }, includeDropped: false, works: [], tiers, manual: true, updatedAt: now.toISOString() }
}

// 作品を足す（「まだ置いていない」に入る）。足してある作品と、上限を超えた分は足さない
export function addWorks(table: TierTable, works: readonly TierWork[], now: Date = new Date()): TierTable {
  const have = new Set((table.works ?? []).map((w) => w.annictId))
  const next = [...(table.works ?? [])]
  for (const w of works) {
    if (have.has(w.annictId) || next.length >= WORKS_MAX) continue
    have.add(w.annictId)
    next.push(w)
  }
  return next.length === (table.works ?? []).length ? table : { ...table, works: next, updatedAt: now.toISOString() }
}

// 作品を表から外す（段・「まだ置いていない」・「表に入れない」のどこからも消える）
export function removeWork(table: TierTable, id: number, now: Date = new Date()): TierTable {
  if (!(table.works ?? []).some((w) => w.annictId === id)) return table
  const held = (table.held ?? []).filter((x) => x !== id)
  const excluded = (table.excluded ?? []).filter((x) => x !== id)
  const next = withIds(withIds({ ...table, works: (table.works ?? []).filter((w) => w.annictId !== id) }, 'held', held), 'excluded', excluded)
  return touch(next, without(table.tiers, id), now)
}

// 4段階の評価を、段の数に均等に散らす（5段: S・A・C・D、7段: S・B・D・F）
export function tierForRating(rating: RatingState, count: number): number {
  return Math.round((RATING_RANK[rating] * (count - 1)) / 3)
}

const clampCount = (n: number) => Math.min(TIER_MAX, Math.max(TIER_MIN, Math.round(n)))

export function cleanTierName(name: string, index: number): string {
  const s = [...name.trim()].slice(0, TIER_NAME_MAX).join('')
  return s || defaultTierName(index)
}

export function cleanTitle(title: string, fallback: string): string {
  const s = [...title.trim()].slice(0, TITLE_MAX).join('')
  return s || fallback
}

// 新しい表。範囲に入る作品を、Annict の総合の評価で仮に置く（評価の無い作品は「まだ置いていない」）。
// 4段なら Annict の4段階そのまま、5段・7段なら間に空の段をはさんで広げる。manual なら何も置かない
export function createTable(
  rows: readonly RecordRow[],
  opts: { id: string; title: string; scope: TierScope; includeDropped: boolean; count?: number; manual?: boolean },
  now: Date = new Date(),
): TierTable {
  const count = clampCount(opts.count ?? TIER_DEFAULT)
  const tiers: Tier[] = Array.from({ length: count }, (_, i) => ({ name: defaultTierName(i), items: [] }))
  const table: TierTable = { id: opts.id, title: cleanTitle(opts.title, ''), scope: opts.scope, includeDropped: opts.includeDropped, tiers, updatedAt: now.toISOString() }
  return opts.manual ? { ...table, manual: true } : settle(table, rows, now)
}

// 評価のある作品で、段に無く自分で外してもいないもの（あとから見た・あとで評価した作品）を、評価どおりの段の最後へ置く。
// 評価があるのに「まだ置いていない」にあるのは間違いなので、表を開くたびにかける。変わらなければ同じ表を返す
export function settle(table: TierTable, rows: readonly RecordRow[], now: Date = new Date()): TierTable {
  if (table.manual) return table
  const placed = new Set(table.tiers.flatMap((t) => t.items))
  const held = new Set([...(table.held ?? []), ...(table.excluded ?? [])])
  let tiers: Tier[] | null = null
  for (const row of candidates(rows, table)) {
    const id = row.entry.annictId
    const rating = row.review?.ratingOverallState ?? null
    if (!rating || placed.has(id) || held.has(id)) continue
    tiers ??= table.tiers.map((t) => ({ ...t, items: [...t.items] }))
    tiers[tierForRating(rating, tiers.length)].items.push(id)
  }
  return tiers ? touch(table, tiers, now) : table
}

export interface TierView {
  tiers: { name: string; rows: RecordRow[] }[]
  unplaced: RecordRow[]
  excluded: RecordRow[]
}

// 画面に出す形。範囲から外れた作品（状態を変えた・記録から外した）は出さないが、表からは消さない（戻したら元の段に出る）
export function viewOf(table: TierTable, rows: readonly RecordRow[]): TierView {
  const pool = candidates(rows, table)
  const byId = new Map(pool.map((r) => [r.entry.annictId, r]))
  const placed = new Set<number>()
  const tiers = table.tiers.map((tier) => ({
    name: tier.name,
    rows: tier.items.flatMap((id) => {
      const r = byId.get(id)
      if (!r || placed.has(id)) return []
      placed.add(id)
      return [r]
    }),
  }))
  const out = new Set(table.excluded ?? [])
  const rest = pool.filter((r) => !placed.has(r.entry.annictId))
  return { tiers, unplaced: rest.filter((r) => !out.has(r.entry.annictId)), excluded: rest.filter((r) => out.has(r.entry.annictId)) }
}

const touch = (table: TierTable, tiers: Tier[], now: Date): TierTable => ({ ...table, tiers, updatedAt: now.toISOString() })

const without = (tiers: readonly Tier[], id: number): Tier[] => tiers.map((t) => ({ ...t, items: t.items.filter((x) => x !== id) }))

// 作品を段の before の作品の前（null か見つからなければ段の最後）に入れる。
// tier が null なら「まだ置いていない」へ戻し、評価があっても自動で置かないよう控える。「表に入れない」にした作品も表に戻す
export function insert(table: TierTable, id: number, tier: number | null, before: number | null, now: Date = new Date()): TierTable {
  const tiers = without(table.tiers, id)
  const held = (table.held ?? []).filter((x) => x !== id)
  const excluded = (table.excluded ?? []).filter((x) => x !== id)
  if (tier === null) held.push(id)
  else if (tiers[tier]) {
    const items = [...tiers[tier].items]
    const at = before === null ? -1 : items.indexOf(before)
    items.splice(at < 0 ? items.length : at, 0, id)
    tiers[tier] = { ...tiers[tier], items }
  }
  return touch(withIds(withIds(table, 'held', held), 'excluded', excluded), tiers, now)
}

// 作品を段の最後に置く。tier が null なら「まだ置いていない」へ戻す
export function place(table: TierTable, id: number, tier: number | null, now: Date = new Date()): TierTable {
  return insert(table, id, tier, null, now)
}

// 作品をこの表に入れない（段からも「まだ置いていない」からも外す）。戻すときは place で「まだ置いていない」へ
export function exclude(table: TierTable, id: number, now: Date = new Date()): TierTable {
  const held = (table.held ?? []).filter((x) => x !== id)
  const excluded = [...(table.excluded ?? []).filter((x) => x !== id), id]
  return touch(withIds(withIds(table, 'held', held), 'excluded', excluded), without(table.tiers, id), now)
}

// 段の並びと外した作品だけを前の表（from）に戻す（「ひとつ戻る」）。日時は新しくする（古い日時に戻すと、端末どうしで合わせたときに戻す前の表が採られる）
export function restorePlacement(table: TierTable, from: TierTable, now: Date = new Date()): TierTable {
  return touch(withIds(withIds(table, 'held', [...(from.held ?? [])]), 'excluded', [...(from.excluded ?? [])]), from.tiers, now)
}

// 外した作品が無ければ held・excluded を持たない（古い形の表と同じ形にする）
const withIds = (table: TierTable, key: 'held' | 'excluded', ids: number[]): TierTable => {
  const next = { ...table }
  delete next[key]
  return ids.length > 0 ? { ...next, [key]: ids } : next
}

// 段の中で左（-1）・右（+1）へ1つ動かす。visible は画面に出ている並び（範囲から外れた作品を飛ばして隣と入れ替えるため）
export function shift(table: TierTable, id: number, delta: -1 | 1, visible: readonly number[], now: Date = new Date()): TierTable {
  const ti = table.tiers.findIndex((t) => t.items.includes(id))
  if (ti < 0) return table
  const vi = visible.indexOf(id)
  const neighbor = visible[vi + delta]
  if (vi < 0 || neighbor === undefined) return table
  const items = [...table.tiers[ti].items]
  const a = items.indexOf(id)
  const b = items.indexOf(neighbor)
  if (b < 0) return table
  ;[items[a], items[b]] = [items[b], items[a]]
  const tiers = table.tiers.map((t, i) => (i === ti ? { ...t, items } : t))
  return touch(table, tiers, now)
}

// 段を1つ下に足す
export function addTier(table: TierTable, now: Date = new Date()): TierTable {
  if (table.tiers.length >= TIER_MAX) return table
  return touch(table, [...table.tiers, { name: defaultTierName(table.tiers.length), items: [] }], now)
}

// いちばん下の段を外す。その段の作品は「まだ置いていない」へ戻る（評価があっても自動では置き直さない）
export function removeTier(table: TierTable, now: Date = new Date()): TierTable {
  if (table.tiers.length <= TIER_MIN) return table
  const dropped = table.tiers[table.tiers.length - 1].items
  const held = [...(table.held ?? []).filter((x) => !dropped.includes(x)), ...dropped]
  return touch(withIds(table, 'held', held), table.tiers.slice(0, -1), now)
}

export function renameTier(table: TierTable, index: number, name: string, now: Date = new Date()): TierTable {
  if (!table.tiers[index]) return table
  const tiers = table.tiers.map((t, i) => (i === index ? { ...t, name: cleanTierName(name, i) } : t))
  return touch(table, tiers, now)
}

export function renameTable(table: TierTable, title: string, now: Date = new Date()): TierTable {
  return { ...table, title: cleanTitle(title, table.title), updatedAt: now.toISOString() }
}

// ── 保存と同期の形 ──
// 端末の控えと GitHub の tiers.json は同じ形。消した表は印（removed）を残す（消すと、他の端末の控えと合わせたときに復活する）

export interface TierStore {
  tables: TierTable[]
  // 消した表の ID と日時
  removed: { id: string; at: string }[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isYear = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1900 && (v as number) <= 2200

function parseScope(v: unknown): TierScope | null {
  if (!isObj(v)) return null
  if (v.kind === 'all') return { kind: 'all' }
  if (v.kind === 'picked') return { kind: 'picked' }
  if (v.kind === 'year' && isYear(v.year)) return { kind: 'year', year: v.year }
  if (v.kind === 'cour' && isYear(v.year) && SEASONS.includes(v.name as SeasonName)) return { kind: 'cour', year: v.year, name: v.name as SeasonName }
  if (v.kind === 'period' && (v.from === null || isYear(v.from)) && (v.to === null || isYear(v.to)) && Array.isArray(v.seasons) && v.seasons.every((n) => SEASONS.includes(n as SeasonName))) {
    return periodScope(v.from as number | null, v.to as number | null, v.seasons as SeasonName[])
  }
  return null
}

// 1つの表を確かめる。壊れていたら null（壊れた表だけを捨てる）
export function parseTable(v: unknown): TierTable | null {
  if (!isObj(v) || typeof v.id !== 'string' || !/^[\w-]{1,40}$/.test(v.id) || !isDate(v.updatedAt)) return null
  const scope = parseScope(v.scope)
  if (!scope || !Array.isArray(v.tiers)) return null
  if (v.tiers.length < TIER_MIN || v.tiers.length > TIER_MAX) return null
  const seen = new Set<number>()
  const tiers: Tier[] = v.tiers.map((t, i) => {
    const o = isObj(t) ? t : {}
    const items: number[] = []
    for (const x of Array.isArray(o.items) ? o.items : []) {
      if (typeof x !== 'number' || !Number.isInteger(x) || x <= 0 || seen.has(x)) continue
      seen.add(x)
      items.push(x)
    }
    return { name: cleanTierName(typeof o.name === 'string' ? o.name : '', i), items }
  })
  const ids = (list: unknown): number[] => {
    const out: number[] = []
    for (const x of Array.isArray(list) ? list : []) {
      if (typeof x !== 'number' || !Number.isInteger(x) || x <= 0 || seen.has(x)) continue
      seen.add(x)
      out.push(x)
    }
    return out
  }
  const held = ids(v.held)
  const excluded = ids(v.excluded)
  const table: TierTable = withIds(
    withIds({ id: v.id, title: cleanTitle(typeof v.title === 'string' ? v.title : '', ''), scope, includeDropped: v.includeDropped === true, tiers, updatedAt: v.updatedAt }, 'held', held),
    'excluded',
    excluded,
  )
  const share = parseShare(v.share)
  const picked: TierTable = scope.kind === 'picked' ? { ...table, works: parseWorks(v.works) } : table
  const marked: TierTable = v.manual === true ? { ...picked, manual: true } : picked
  return share ? { ...marked, share } : marked
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

// 選んだ表の作品。壊れた作品だけを捨てる
function parseWorks(v: unknown): TierWork[] {
  const out: TierWork[] = []
  const seen = new Set<number>()
  for (const w of Array.isArray(v) ? v : []) {
    if (!isObj(w) || typeof w.annictId !== 'number' || !Number.isInteger(w.annictId) || w.annictId <= 0 || seen.has(w.annictId)) continue
    if (!isText(w.workId, 100) || !isText(w.title, 300) || out.length >= WORKS_MAX) continue
    seen.add(w.annictId)
    const work: TierWork = {
      annictId: w.annictId,
      workId: w.workId,
      title: w.title,
      malAnimeId: typeof w.malAnimeId === 'string' && /^\d{1,9}$/.test(w.malAnimeId) ? w.malAnimeId : null,
      seasonYear: isYear(w.seasonYear) ? w.seasonYear : null,
      seasonName: typeof w.seasonName === 'string' && /^(WINTER|SPRING|SUMMER|AUTUMN)$/.test(w.seasonName) ? w.seasonName : null,
    }
    if (isText(w.titleEn, 300)) work.titleEn = w.titleEn
    if (typeof w.imageUrl === 'string' && w.imageUrl.startsWith('https://') && w.imageUrl.length <= 2000) work.imageUrl = w.imageUrl
    out.push(work)
  }
  return out
}

function parseShare(v: unknown): TierShare | null {
  if (!isObj(v) || typeof v.id !== 'string' || !/^[0-9A-Za-z]{10}$/.test(v.id)) return null
  if (typeof v.key !== 'string' || !/^[\w-]{20,100}$/.test(v.key) || !isDate(v.at)) return null
  return { id: v.id, key: v.key, at: v.at }
}

export function parseTierStore(value: unknown): TierStore {
  const out: TierStore = { tables: [], removed: [] }
  if (!isObj(value)) return out
  const ids = new Set<string>()
  for (const t of Array.isArray(value.tables) ? value.tables : []) {
    const table = parseTable(t)
    if (table && !ids.has(table.id)) {
      ids.add(table.id)
      out.tables.push(table)
    }
  }
  for (const r of Array.isArray(value.removed) ? value.removed : []) {
    if (isObj(r) && typeof r.id === 'string' && isDate(r.at)) out.removed.push({ id: r.id, at: r.at })
  }
  return out
}

export function serializeTierStore(store: TierStore): { version: 1; tables: TierTable[]; removed: TierStore['removed'] } {
  return { version: 1, tables: store.tables, removed: store.removed }
}

// 2つの控えを合わせる。同じ表は新しく変えた方、消した印は表より新しければ表を消す。作った順（古い順）に並べる
export function mergeTierStores(a: TierStore, b: TierStore): TierStore {
  const removed = new Map<string, string>()
  for (const r of [...a.removed, ...b.removed]) {
    const cur = removed.get(r.id)
    if (!cur || Date.parse(r.at) > Date.parse(cur)) removed.set(r.id, r.at)
  }
  const tables = new Map<string, TierTable>()
  for (const t of [...a.tables, ...b.tables]) {
    const cur = tables.get(t.id)
    if (!cur || Date.parse(t.updatedAt) > Date.parse(cur.updatedAt)) tables.set(t.id, t)
  }
  const alive = [...tables.values()].filter((t) => {
    const at = removed.get(t.id)
    return !at || Date.parse(t.updatedAt) > Date.parse(at)
  })
  const order = [...a.tables, ...b.tables].map((t) => t.id)
  alive.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id))
  return { tables: alive, removed: [...removed].map(([id, at]) => ({ id, at })).sort((x, y) => x.id.localeCompare(y.id)) }
}

export function sameTierStores(a: TierStore, b: TierStore): boolean {
  return JSON.stringify(serializeTierStore(a)) === JSON.stringify(serializeTierStore(b))
}
