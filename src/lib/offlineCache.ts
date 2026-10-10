import type { AnnictWork, LibraryEntry, StatusState } from './annict'
import { loadSeasonWorksRaw, loadStoredLibraryRaw, saveSeasonWorksRaw, saveStoredLibraryRaw } from './storage'

// Annict から最後に読んだ内容（自分のライブラリと、評価の画面のクールの作品）を端末にとっておく。
// 起動したらまずこれで画面を出し、裏で Annict から読み直して差し替える（Annict が重い日でも数秒で出す。2026-10-06）。
// 状態を変える書き込みが成功したら、とっておいた内容も同じように直す（patchStoredStatus。直さないと、
// この端末で答えた作品が次の起動でまた出てきて、二重に記録されるおそれがある）。
// 今のトークンの持ち主のもので、トークンが変わったら storage.saveAnnictToken が消す

export interface Stored<T> {
  // Annict から読んだ日時
  at: string
  value: T
}

// とっておくクールの数（新しく読んだ順）
const SEASONS_MAX = 12

const STATES: readonly string[] = ['WANNA_WATCH', 'WATCHING', 'WATCHED', 'ON_HOLD', 'STOP_WATCHING', 'NO_STATE']
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function parseEntry(v: unknown): LibraryEntry | null {
  if (!v || typeof v !== 'object') return null
  const e = v as Record<string, unknown>
  if (typeof e.workId !== 'string' || !Number.isInteger(e.annictId) || typeof e.title !== 'string' || typeof e.state !== 'string' || !STATES.includes(e.state)) return null
  const next = e.nextEpisode as Record<string, unknown> | null | undefined
  return {
    workId: e.workId,
    annictId: e.annictId as number,
    title: e.title,
    malAnimeId: str(e.malAnimeId),
    state: e.state as StatusState,
    stateAt: str(e.stateAt),
    seasonYear: num(e.seasonYear),
    seasonName: str(e.seasonName),
    media: str(e.media),
    watchersCount: num(e.watchersCount) ?? undefined,
    imageUrl: str(e.imageUrl),
    nextEpisode: next && typeof next === 'object' ? { number: num(next.number), numberText: str(next.numberText), title: str(next.title) } : null,
    episodesCount: num(e.episodesCount),
    note: str(e.note),
  }
}

function parseWork(v: unknown): AnnictWork | null {
  if (!v || typeof v !== 'object') return null
  const w = v as Record<string, unknown>
  if (typeof w.id !== 'string' || !Number.isInteger(w.annictId) || typeof w.title !== 'string') return null
  const state = typeof w.viewerStatusState === 'string' && STATES.includes(w.viewerStatusState) ? (w.viewerStatusState as StatusState) : null
  return {
    id: w.id,
    annictId: w.annictId as number,
    title: w.title,
    media: str(w.media) ?? '',
    malAnimeId: str(w.malAnimeId),
    watchersCount: num(w.watchersCount) ?? 0,
    viewerStatusState: state,
    imageUrl: str(w.imageUrl),
  }
}

// 壊れた項目は捨てる（一覧が少し欠けても、読み直せば戻る）
export function parseStoredLibrary(value: unknown): Stored<LibraryEntry[]> | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.v !== 1 || !isIso(v.at) || !Array.isArray(v.entries)) return null
  return { at: v.at, value: v.entries.flatMap((e) => parseEntry(e) ?? []) }
}

export function loadStoredLibrary(): Stored<LibraryEntry[]> | null {
  return parseStoredLibrary(loadStoredLibraryRaw())
}

export function saveStoredLibrary(entries: readonly LibraryEntry[], now = new Date()): void {
  saveStoredLibraryRaw({ v: 1, at: now.toISOString(), entries })
}

function parseSeasons(value: unknown): Map<string, Stored<AnnictWork[]>> {
  const out = new Map<string, Stored<AnnictWork[]>>()
  if (!value || typeof value !== 'object') return out
  const v = value as Record<string, unknown>
  if (v.v !== 1 || !v.seasons || typeof v.seasons !== 'object') return out
  for (const [slug, s] of Object.entries(v.seasons as Record<string, unknown>)) {
    const item = s as Record<string, unknown> | null
    if (!item || !isIso(item.at) || !Array.isArray(item.works)) continue
    out.set(slug, { at: item.at, value: item.works.flatMap((w) => parseWork(w) ?? []) })
  }
  return out
}

function saveSeasons(map: Map<string, Stored<AnnictWork[]>>): void {
  const newest = [...map].sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, SEASONS_MAX)
  saveSeasonWorksRaw({ v: 1, seasons: Object.fromEntries(newest.map(([slug, s]) => [slug, { at: s.at, works: s.value }])) })
}

export function loadStoredSeasonWorks(slug: string): Stored<AnnictWork[]> | null {
  return parseSeasons(loadSeasonWorksRaw()).get(slug) ?? null
}

export function saveStoredSeasonWorks(slug: string, works: readonly AnnictWork[], now = new Date()): void {
  const map = parseSeasons(loadSeasonWorksRaw())
  map.set(slug, { at: now.toISOString(), value: [...works] })
  saveSeasons(map)
}

// 状態を変える書き込みが成功したあとに、とっておいた内容も直す。
// ライブラリに無い作品（新しく記録した）は、作品の情報が手元に無いので足さない（次に読み直したときに入る）
export function patchStoredStatus(workId: string, state: StatusState, now = new Date()): void {
  const lib = loadStoredLibrary()
  if (lib && lib.value.some((e) => e.workId === workId)) {
    const entries = lib.value.flatMap((e) => (e.workId !== workId ? [e] : state === 'NO_STATE' ? [] : [{ ...e, state, stateAt: now.toISOString() }]))
    saveStoredLibraryRaw({ v: 1, at: lib.at, entries })
  }
  const seasons = parseSeasons(loadSeasonWorksRaw())
  let changed = false
  for (const s of seasons.values()) {
    for (const w of s.value) {
      if (w.id === workId) {
        w.viewerStatusState = state
        changed = true
      }
    }
  }
  if (changed) saveSeasons(seasons)
}

// 「前回の内容」の日時（10/6 12:30）
export function storedAtLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
