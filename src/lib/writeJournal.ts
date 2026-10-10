import type { RatingState, StatusState } from './annict'
import type { ReviewContent } from './reviewOps'
import type { MediaTitle } from './shikimori'
import { loadWriteJournalRaw, saveWriteJournalRaw } from './storage'

// Annict に送る前・送れなかった書き込みの控え（端末に置く）。送信の列はメモリの中だけなので、送り終える前にアプリを閉じたり、
// 失敗したまま閉じたりすると消える。そこで、頼んだ時点で「最終的にどうしたいか」を書いておき、成功したら消す。
// 次に開いたとき残っていれば、送るかどうかを利用者に聞き、Annict の今の状態と比べて足りない分だけ書く（lib/reconcile.ts）。
// 中身は手順ではなく行き先なので、何度送っても同じ結果になる。同じ作品の同じ項目は、あとから頼んだものだけを残す

export type WriteIntent =
  // 状態（NO_STATE は記録から外す）
  | { kind: 'status'; workId: string; state: StatusState }
  // 総合評価（null は外す。ほかの項目と本文はそのまま）
  | { kind: 'rating'; workId: string; annictId: number; rating: RatingState | null }
  // 感想の中身（項目と本文）
  | { kind: 'review'; workId: string; annictId: number; content: ReviewContent }
  // 話の記録（recorded: false は取り消し）。since は記録を頼んだ時刻（それより新しい記録を探す）
  | { kind: 'episode'; episodeId: string; recorded: boolean; rating: RatingState | null; since: number; comment?: string }
  // 話の記録に付ける感想（since は記録を頼んだ時刻。それより新しい自分の記録に付ける）
  | { kind: 'episodeComment'; episodeId: string; comment: string; rating: RatingState | null; since: number }
  // マッチングの答え（Annict の作品は送るときに探す）。rating が無ければ評価は触らない、null は外す
  | { kind: 'match'; idMal: number; title: MediaTitle; state: StatusState; rating?: RatingState | null }

export interface JournalEntry {
  key: string
  label: string
  intent: WriteIntent
  at: number
  seq: number
  // 書いたときのページの読み込み（開き直したら別になる。前回の分を見分ける）
  session: string
}

export type JournalTicket = readonly { key: string; seq: number }[]

const SESSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function keyOf(intent: WriteIntent): string {
  switch (intent.kind) {
    case 'status':
    case 'rating':
    case 'review':
      return `${intent.kind}:${intent.workId}`
    case 'episode':
      return `episode:${intent.episodeId}`
    case 'episodeComment':
      return `episodeComment:${intent.episodeId}`
    case 'match':
      return `match:${intent.idMal}`
  }
}

// 端末の控えは、壊れていたり古い版のものだったりしうる。送る前に、種類ごとに項目の型と値を確かめる（足りない・おかしいものは捨てる）
const STATUSES: readonly unknown[] = ['WANNA_WATCH', 'WATCHING', 'WATCHED', 'ON_HOLD', 'STOP_WATCHING', 'NO_STATE']
const RATINGS: readonly unknown[] = ['BAD', 'AVERAGE', 'GOOD', 'GREAT']
const AXES = ['ratingOverallState', 'ratingStoryState', 'ratingAnimationState', 'ratingMusicState', 'ratingCharacterState'] as const

const text = (v: unknown): v is string => typeof v === 'string' && v !== ''
const id = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const rating = (v: unknown): boolean => v === null || RATINGS.includes(v)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const optionalText = (v: unknown): boolean => v === null || typeof v === 'string'

function isIntent(v: unknown): v is WriteIntent {
  if (!record(v)) return false
  switch (v.kind) {
    case 'status':
      return text(v.workId) && STATUSES.includes(v.state)
    case 'rating':
      return text(v.workId) && id(v.annictId) && rating(v.rating)
    case 'review': {
      const c = v.content
      return text(v.workId) && id(v.annictId) && record(c) && typeof c.body === 'string' && record(c.axes) && AXES.every((k) => rating((c.axes as Record<string, unknown>)[k]))
    }
    case 'episode':
      return text(v.episodeId) && typeof v.recorded === 'boolean' && rating(v.rating) && typeof v.since === 'number' && (v.comment === undefined || typeof v.comment === 'string')
    case 'episodeComment':
      return text(v.episodeId) && typeof v.comment === 'string' && rating(v.rating) && typeof v.since === 'number'
    case 'match': {
      const t = v.title
      return id(v.idMal) && record(t) && optionalText(t.native) && optionalText(t.romaji) && optionalText(t.english) && STATUSES.includes(v.state) && (v.rating === undefined || rating(v.rating))
    }
    default:
      return false
  }
}

function isEntry(v: unknown): v is JournalEntry {
  if (!record(v)) return false
  return (
    typeof v.key === 'string' &&
    typeof v.label === 'string' &&
    typeof v.at === 'number' &&
    typeof v.seq === 'number' &&
    typeof v.session === 'string' &&
    isIntent(v.intent) &&
    keyOf(v.intent) === v.key
  )
}

function load(): JournalEntry[] {
  const raw = loadWriteJournalRaw()
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { entries?: unknown }).entries)) return []
  return (raw as { entries: unknown[] }).entries.filter(isEntry)
}

function save(entries: JournalEntry[]): void {
  saveWriteJournalRaw(entries.length > 0 ? { v: 1, entries } : null)
}

let lastSeq = 0

// 書き込みを頼んだ。行き先を控えに書き、成功したときに消すための札を返す
export function journalPut(label: string, intents: readonly WriteIntent[], now = Date.now()): JournalTicket {
  if (intents.length === 0) return []
  const entries = load()
  const keys = intents.map(keyOf)
  lastSeq = Math.max(lastSeq, ...entries.map((e) => e.seq)) + 1
  const seq = lastSeq
  const added = intents.map((intent, i): JournalEntry => ({ key: keys[i], label, intent, at: now, seq, session: SESSION }))
  save([...entries.filter((e) => !keys.includes(e.key)), ...added])
  return added.map((e) => ({ key: e.key, seq: e.seq }))
}

// 送り終えた（または利用者が送らないことにした）。あとから同じ項目を頼んでいれば、そちらは残す
export function journalDone(ticket: JournalTicket): void {
  if (ticket.length === 0) return
  const entries = load()
  const next = entries.filter((e) => !ticket.some((t) => t.key === e.key && t.seq === e.seq))
  if (next.length !== entries.length) save(next)
}

// 前回までに開いたときの、送れていない書き込み（頼んだ順）
export function leftoverEntries(): JournalEntry[] {
  return load()
    .filter((e) => e.session !== SESSION)
    .sort((a, b) => a.seq - b.seq)
}

// まだ控えにそのまま残っているか（そのあとで同じ項目を頼み直していれば false。古い行き先で上書きしない）
export function isStillPending(entry: JournalEntry): boolean {
  return load().some((e) => e.key === entry.key && e.seq === entry.seq)
}
