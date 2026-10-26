import { t } from './i18n'
import { persistedMap } from './persistedMap'

// 作品の外のページ（日本語版 Wikipedia の記事・公式サイト・X）を、MyAnimeList の ID から Wikidata（データは CC0）で引く。
// Annict に入れない人が開く、共有の Tier表の作品カードで使う（Annict の詳細の wikipediaUrl・officialSiteUrl・twitterUsername の代わり）。
// Wikidata のアニメの項目は「MyAnimeList のアニメの ID」（P4086）を持つ。項目は期（1期・2期）ごとのことがあり、日本語版の記事が
// シリーズ（P179）や原作（P144）の項目にだけ付いていることもあるので、2段までたどる（2026-10-26 に フリーレン・呪術廻戦 1期で確かめた）。
// 公式の API（wbgetentities）を使い、SPARQL の窓口は使わない（障害のときは1分1回まで絞られる。2026-10-26）
const API = 'https://www.wikidata.org/w/api.php'
// 1つの作品に引く項目の数の上限（MyAnimeList の ID が同じ項目と、たどる先のそれぞれ）
const MAX_ITEMS = 4

export interface WorkLinks {
  // 日本語版 Wikipedia の記事の URL（作品・シリーズ・原作の順。あらすじはこの順に探す）
  wikipedia: string[]
  official: string | null
  // X のユーザー名
  x: string | null
}

export interface Entity {
  sitelinks?: Record<string, { title?: unknown }>
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, format: 'json', origin: '*' })
  const res = await fetch(`${API}?${q.toString()}`, { credentials: 'omit' })
  if (!res.ok) throw new Error(t(`Wikidataを読めませんでした（HTTP ${res.status}）`, `Could not load Wikidata (HTTP ${res.status}).`))
  return (await res.json()) as T
}

const values = (e: Entity, prop: string) => (e.claims?.[prop] ?? []).map((c) => c.mainsnak?.datavalue?.value)
const itemIds = (e: Entity, prop: string) =>
  values(e, prop).flatMap((v) => (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? [(v as { id: string }).id] : []))
const strings = (e: Entity, prop: string) => values(e, prop).filter((v): v is string => typeof v === 'string')

const jaArticle = (e: Entity) => {
  const title = e.sitelinks?.jawiki?.title
  return typeof title === 'string' && title ? `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null
}
const httpUrl = (s: string) => {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

// たどる先の項目（シリーズを先に、次に原作。同じ作品の項目どうしは除く）
export function parentIds(own: readonly { id: string; entity: Entity }[]): string[] {
  const mine = new Set(own.map((o) => o.id))
  const ids = [...own.flatMap((o) => itemIds(o.entity, 'P179')), ...own.flatMap((o) => itemIds(o.entity, 'P144'))]
  return [...new Set(ids)].filter((id) => !mine.has(id)).slice(0, MAX_ITEMS)
}

// 作品の項目と、たどった先の項目から。公式サイトと X は、作品の項目に無いときだけたどった先のものを使う。公式サイトは https を先に
export function linksFrom(own: readonly Entity[], parents: readonly Entity[]): WorkLinks {
  const pick = (list: readonly Entity[], prop: string, ok: (s: string) => string | null) => {
    const all = list.flatMap((e) => strings(e, prop)).flatMap((s) => ok(s) ?? [])
    return all.find((s) => s.startsWith('https:')) ?? all[0] ?? null
  }
  const site = (list: readonly Entity[]) => pick(list, 'P856', httpUrl)
  const x = (list: readonly Entity[]) => pick(list, 'P2002', (s) => (/^\w{1,15}$/.test(s) ? s : null))
  return {
    wikipedia: [...new Set([...own, ...parents].flatMap((e) => jaArticle(e) ?? []))],
    official: site(own) ?? site(parents),
    x: x(own) ?? x(parents),
  }
}

async function entities(ids: readonly string[]): Promise<{ id: string; entity: Entity }[]> {
  if (ids.length === 0) return []
  const r = await call<{ entities?: Record<string, Entity> }>({ action: 'wbgetentities', ids: ids.join('|'), props: 'sitelinks|claims', sitefilter: 'jawiki' })
  return ids.flatMap((id) => (r.entities?.[id] ? [{ id, entity: r.entities[id] }] : []))
}

async function lookup(malId: number): Promise<WorkLinks> {
  const found = await call<{ query?: { search?: { title: string }[] } }>({ action: 'query', list: 'search', srsearch: `haswbstatement:P4086=${malId}`, srlimit: String(MAX_ITEMS) })
  const own = await entities((found.query?.search ?? []).map((s) => s.title).filter((id) => /^Q\d+$/.test(id)))
  const parents = await entities(parentIds(own))
  // もう1段（期の項目 → アニメ全体 → 原作の漫画。あらすじの節は原作の記事にだけあることが多い）
  const grand = await entities(parentIds([...own, ...parents]))
  return linksFrom(
    own.map((o) => o.entity),
    [...parents, ...grand].map((p) => p.entity),
  )
}

// 引いた結果は端末にも残す（Wikipedia のあらすじと同じく、だれのものでもない控え）。何か見つかった作品は30日、何も無かった作品は7日で引き直す
const FOUND_MS = 30 * 86_400_000
const MISSING_MS = 7 * 86_400_000
interface StoredLinks {
  at: string
  v: WorkLinks
}
const stored = persistedMap<StoredLinks>('workLinks', 200, parseStoredLinks)

// 端末に残した形を確かめる。記事は日本語版 Wikipedia のもの、公式サイトは http(s) のものだけ通す
export function parseStoredLinks(value: unknown): StoredLinks | null {
  if (!value || typeof value !== 'object') return null
  const { at, v } = value as Record<string, unknown>
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at)) || !v || typeof v !== 'object') return null
  const w = v as Record<string, unknown>
  const wikipedia = Array.isArray(w.wikipedia) ? w.wikipedia.filter((u): u is string => typeof u === 'string' && u.startsWith('https://ja.wikipedia.org/wiki/')) : []
  const official = typeof w.official === 'string' ? httpUrl(w.official) : null
  const x = typeof w.x === 'string' && /^\w{1,15}$/.test(w.x) ? w.x : null
  return { at, v: { wikipedia, official, x } }
}

const isEmpty = (l: WorkLinks) => l.wikipedia.length === 0 && !l.official && !l.x
const cache = new Map<number, Promise<WorkLinks>>()

// 作品ごとに1回だけ引く。読めなかった（通信の失敗）ときは覚えない（次に開いたときにもう一度）
export function fetchWorkLinks(malId: number, now = Date.now()): Promise<WorkLinks> {
  let p = cache.get(malId)
  if (p) return p
  const kept = stored.get(String(malId))
  if (kept && now - Date.parse(kept.at) < (isEmpty(kept.v) ? MISSING_MS : FOUND_MS)) {
    p = Promise.resolve(kept.v)
  } else {
    p = lookup(malId).then((v) => {
      stored.set(String(malId), { at: new Date().toISOString(), v })
      return v
    })
    p.catch(() => cache.delete(malId))
  }
  cache.set(malId, p)
  return p
}
