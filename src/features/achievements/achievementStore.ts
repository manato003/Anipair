import { loadFeatsRaw, loadSeasonTopsRaw, loadTitlesRaw, saveFeatsRaw, saveSeasonTopsRaw, saveTitlesRaw } from '../../lib/storage'
import { compareSeasons, nextSeason, parseSlug, seasonOf, toSlug } from '../../lib/season'
import { OLDEST_SEASON } from '../rate/queue'
import type { Feats } from './titles'

// ── クールごとの人気作の ID の控え ──
// だれのものでも同じで、ゆっくりしか変わらない。直近1年のクールは7日、それより前は90日で読み直す

export interface SeasonTop {
  at: number
  ids: number[]
}

const DAY = 24 * 60 * 60 * 1000
const RECENT_TTL = 7 * DAY
const OLD_TTL = 90 * DAY

export function parseSeasonTops(value: unknown): Map<string, SeasonTop> {
  const out = new Map<string, SeasonTop>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [slug, v] of Object.entries(value as Record<string, unknown>)) {
    if (!parseSlug(slug) || !v || typeof v !== 'object') continue
    const { at, ids } = v as { at?: unknown; ids?: unknown }
    if (typeof at !== 'number' || !Array.isArray(ids) || !ids.every((n) => Number.isInteger(n))) continue
    out.set(slug, { at, ids: ids as number[] })
  }
  return out
}

export function loadSeasonTops(): Map<string, SeasonTop> {
  return parseSeasonTops(loadSeasonTopsRaw())
}

export function saveSeasonTops(tops: ReadonlyMap<string, SeasonTop>): void {
  saveSeasonTopsRaw(Object.fromEntries(tops))
}

// 評価画面でクールの山を読んだときに、その一覧も控える（読み直しの手間を省く）
export function rememberSeasonTop(slug: string, ids: number[], now: number = Date.now()): void {
  const tops = loadSeasonTops()
  tops.set(slug, { at: now, ids })
  saveSeasonTops(tops)
}

// 数えるクール（いちばん古いクールから今のクールまで）
export function allSeasonSlugs(now: Date): string[] {
  const out: string[] = []
  const last = seasonOf(now)
  for (let s = OLDEST_SEASON; compareSeasons(s, last) <= 0; s = nextSeason(s)) out.push(toSlug(s))
  return out
}

export function isStale(slug: string, top: SeasonTop | undefined, now: Date): boolean {
  if (!top) return true
  const season = parseSlug(slug)
  const recent = season !== null && season.year >= now.getFullYear() - 1
  return now.getTime() - top.at > (recent ? RECENT_TTL : OLD_TTL)
}

// ── 称号の状態（装備・見たもの・初回の覚醒） ──

export interface TitlesState {
  equipped: string | null
  // 見たことのある解放済みの称号（NEW の印を外すため）
  seen: string[]
  // 初回の「覚醒」を見たか
  awakened: boolean
}

export function parseTitlesState(value: unknown): TitlesState {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return {
    equipped: typeof v.equipped === 'string' ? v.equipped : null,
    seen: Array.isArray(v.seen) ? v.seen.filter((s): s is string => typeof s === 'string') : [],
    awakened: v.awakened === true,
  }
}

export function loadTitlesState(): TitlesState {
  return parseTitlesState(loadTitlesRaw())
}

export function saveTitlesState(state: TitlesState): void {
  saveTitlesRaw(state)
}

// ── Anipair の中での出来事 ──

export function parseFeats(value: unknown): Feats {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const out: Feats = {}
  if (typeof v.lateNight === 'string') out.lateNight = v.lateNight
  if (typeof v.oneNightCastle === 'string') out.oneNightCastle = v.oneNightCastle
  if (typeof v.earlyMorning === 'string') out.earlyMorning = v.earlyMorning
  if (typeof v.newYear === 'string') out.newYear = v.newYear
  return out
}

export function loadFeats(): Feats {
  return parseFeats(loadFeatsRaw())
}

// 初めてのときだけ日時を残す
export function recordFeat(name: keyof Feats, now: Date = new Date()): void {
  const feats = loadFeats()
  if (feats[name]) return
  saveFeatsRaw({ ...feats, [name]: now.toISOString() })
}

// 深夜2時から4時のあいだか（端末の時刻で）
export function isLateNight(now: Date): boolean {
  const h = now.getHours()
  return h >= 2 && h < 4
}

// 朝5時から7時のあいだか
export function isEarlyMorning(now: Date): boolean {
  const h = now.getHours()
  return h >= 5 && h < 7
}

// 元日か
export function isNewYearsDay(now: Date): boolean {
  return now.getMonth() === 0 && now.getDate() === 1
}

// 答えた時刻で付く出来事をまとめて記録する（深夜・朝・元日）
export function recordTimeFeats(now: Date = new Date()): void {
  if (isLateNight(now)) recordFeat('lateNight', now)
  if (isEarlyMorning(now)) recordFeat('earlyMorning', now)
  if (isNewYearsDay(now)) recordFeat('newYear', now)
}
