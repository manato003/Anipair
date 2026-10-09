import { compareSeasons, sameSeason, seasonOf, type Season, type SeasonName } from '../../lib/season'
import { loadStillWatchingRaw, saveStillWatchingRaw } from '../../lib/storage'

// 評価の画面の「見てる」の山に、いつ作品を出すか。
// この山は「見終わりましたか」を聞くためのもの。放送中に聞いても答えはほぼ「まだ見てる」なので、
// - 放送中（と、まだ始まっていない）クールの作品は出さない。放送のクールが終わってから聞く
// - 「まだ見てる」と答えたら、答えたクールが終わるまで出さない（分割2クールの作品や昔の作品の見返しでも、聞くのはクールの変わり目に1回）
// - このクールに「見てる」にした作品も、そのクールが終わるまで出さない（評価の画面で昔の作品に「見てる」を押すと、すぐ山に戻ってきて押し直しになっていた）
// 「まだ見てる」は何も送らない答えなので、端末に覚えておく（Annict の状態は「見てる」のまま）。キーは Annict の作品 ID、値は答えた時刻

type StillWatching = Map<number, number>

function load(): StillWatching {
  const raw = loadStillWatchingRaw()
  const out: StillWatching = new Map()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k)
    if (Number.isInteger(id) && id > 0 && typeof v === 'number' && Number.isFinite(v)) out.set(id, v)
  }
  return out
}

const sameCour = (at: number, now: number) => sameSeason(seasonOf(new Date(at)), seasonOf(new Date(now)))

// 前のクールに答えたものは捨てて保存する（見終えた作品の分が溜まらないように）
function save(map: StillWatching, now: number): void {
  const kept = [...map].filter(([, at]) => sameCour(at, now))
  saveStillWatchingRaw(kept.length > 0 ? Object.fromEntries(kept.map(([id, at]) => [String(id), at])) : null)
}

export function markStillWatching(annictId: number, now = Date.now()): void {
  const map = load()
  map.set(annictId, now)
  save(map, now)
}

// 「ひとつ戻る」で取り消した
export function unmarkStillWatching(annictId: number, now = Date.now()): void {
  const map = load()
  map.delete(annictId)
  save(map, now)
}

// 「まだ見てる」と答えて、そのクールがまだ終わっていない作品
export function snoozedWatching(now = Date.now()): Set<number> {
  const out = new Set<number>()
  for (const [id, at] of load()) if (sameCour(at, now)) out.add(id)
  return out
}

const NAMES: Record<string, SeasonName> = { WINTER: 'winter', SPRING: 'spring', SUMMER: 'summer', AUTUMN: 'autumn' }

// 作品の放送クール（Annict の seasonYear と seasonName）。分からなければ null
export function workSeason(w: { seasonYear?: number | null; seasonName?: string | null }): Season | null {
  const name = w.seasonName ? NAMES[w.seasonName.toUpperCase()] : undefined
  return typeof w.seasonYear === 'number' && name ? { year: w.seasonYear, name } : null
}

// 放送中か、まだ始まっていないクールの作品（「見てる」の山に出さない）
export function stillAiring(w: { seasonYear?: number | null; seasonName?: string | null }, now = Date.now()): boolean {
  const s = workSeason(w)
  return s !== null && compareSeasons(s, seasonOf(new Date(now))) >= 0
}

// このクールに「見てる」にした作品（昔のクールの作品を、いま見始めたなど）。見始めたばかりで「見終わりましたか」とは聞かない。
// 「まだ見てる」と同じく、そのクールが終わってから聞く
export function startedThisCour(e: { stateAt?: string | null }, now = Date.now()): boolean {
  const at = e.stateAt ? Date.parse(e.stateAt) : NaN
  return !Number.isNaN(at) && sameCour(at, now)
}

// 「見てる」の山に出す作品だけを残す
export function askableWatching<T extends { annictId: number; seasonYear?: number | null; seasonName?: string | null; stateAt?: string | null }>(entries: T[], now = Date.now()): T[] {
  const snoozed = snoozedWatching(now)
  return entries.filter((e) => !stillAiring(e, now) && !snoozed.has(e.annictId) && !startedThisCour(e, now))
}
