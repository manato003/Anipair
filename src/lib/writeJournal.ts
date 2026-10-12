import type { RatingState, StatusState } from './annict'
import type { ReviewContent } from './reviewOps'
import type { MediaTitle } from './shikimori'
import { loadWriteJournalRaw, saveWriteJournalRaw } from './storage'

// Annict に送る前・送れなかった書き込みの控え（端末に置く）。送信の列はメモリの中だけなので、送り終える前にアプリを閉じたり、
// 失敗したまま閉じたりすると消える。そこで、頼んだ時点で「最終的にどうしたいか」を書いておき、成功したら消す。
// 次に開いたとき残っていれば、送るかどうかを利用者に聞き、Annict の今の状態と比べて足りない分だけ書く（lib/reconcile.ts）。
// 中身は手順ではなく行き先なので、何度送っても同じ結果になる。
// 同じ作品の同じ項目は、あとから頼んだものだけを残す。項目は書き込みの種類ではなく、Annict のどの値を書くか（状態・総合評価・感想の中身・話の記録）で見る
// （2026-10-12 のレビュー: 感想の保存は総合評価も書くので、失敗した古い感想を送り直すと、あとで総合評価だけ変えた分を古い値に戻していた）。
// 作品は Annict の ID と MyAnimeList の ID の両方で見る（マッチングの答えは MyAnimeList の ID しか知らない）

export type WriteIntent =
  // 状態（NO_STATE は記録から外す）。idMal は分かるときだけ（マッチングの答えと同じ作品かを見分ける）
  | { kind: 'status'; workId: string; state: StatusState; idMal?: number }
  // 総合評価（null は外す。ほかの項目と本文はそのまま）
  | { kind: 'rating'; workId: string; annictId: number; rating: RatingState | null; idMal?: number }
  // 感想の中身（項目と本文。content の総合評価も書く）。keepOverall: 総合評価はあとから頼み直されたので、Annict の今の値のまま書く
  | { kind: 'review'; workId: string; annictId: number; content: ReviewContent; idMal?: number; keepOverall?: true }
  // 話の記録（recorded: false は取り消し）。since は記録を頼んだ時刻（それより新しい記録を探す）
  | { kind: 'episode'; episodeId: string; recorded: boolean; rating: RatingState | null; since: number; comment?: string }
  // 話の記録に付ける感想（since は記録を頼んだ時刻。それより新しい自分の記録に付ける）
  | { kind: 'episodeComment'; episodeId: string; comment: string; rating: RatingState | null; since: number }
  // マッチングの答え（Annict の作品は送るときに探す）。rating が無ければ評価は触らない、null は外す。
  // keepState: 状態はあとから頼み直されたので書かない
  | { kind: 'match'; idMal: number; title: MediaTitle; state: StatusState; rating?: RatingState | null; keepState?: true }

export interface JournalEntry {
  key: string
  label: string
  intent: WriteIntent
  at: number
  seq: number
  // 書いたときのページの読み込み（開き直したら別になる。前回の分を見分ける）
  session: string
  // あとから頼み直されて、もう書かない項目（残りの項目だけ送る。narrowIntent）
  dropped?: Field[]
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

// 書き込みが Annict のどの値を書くか（項目）と、その値の呼び名（作品の Annict の ID と MyAnimeList の ID の両方）。
// 2つの書き込みの項目の呼び名が1つでも重なれば、同じ値を書いている
export type Field = 'status' | 'overall' | 'review' | 'episode' | 'episodeComment'
const FIELDS: readonly unknown[] = ['status', 'overall', 'review', 'episode', 'episodeComment']

export function fieldsOf(intent: WriteIntent): { name: Field; aliases: string[] }[] {
  const work = (name: Field, workId: string, idMal?: number) => ({ name, aliases: [`${name}:${workId}`, ...(idMal ? [`${name}:mal${idMal}`] : [])] })
  switch (intent.kind) {
    case 'status':
      return [work('status', intent.workId, intent.idMal)]
    case 'rating':
      return [work('overall', intent.workId, intent.idMal)]
    case 'review':
      return [...(intent.keepOverall ? [] : [work('overall', intent.workId, intent.idMal)]), work('review', intent.workId, intent.idMal)]
    case 'episode':
      return [{ name: 'episode', aliases: [`episode:${intent.episodeId}`] }]
    case 'episodeComment':
      return [{ name: 'episodeComment', aliases: [`episodeComment:${intent.episodeId}`] }]
    case 'match':
      return [
        ...(intent.keepState ? [] : [{ name: 'status' as const, aliases: [`status:mal${intent.idMal}`] }]),
        ...(intent.rating === undefined ? [] : [{ name: 'overall' as const, aliases: [`overall:mal${intent.idMal}`] }]),
      ]
  }
}

// 頼み直された項目（dropped）を除いた、まだ書くべき行き先。書くものが残らなければ null。何も除かないときは同じものを返す
export function narrowIntent(intent: WriteIntent, dropped: ReadonlySet<Field>): WriteIntent | null {
  const touched = fieldsOf(intent).filter((f) => dropped.has(f.name))
  if (touched.length === 0) return intent
  switch (intent.kind) {
    case 'review': {
      const reviewGone = dropped.has('review')
      const overallGone = intent.keepOverall === true || dropped.has('overall')
      if (reviewGone && overallGone) return null
      // 感想の中身はあとから書き直された。総合評価だけ、この書き込みの値を書く
      if (reviewGone) {
        return { kind: 'rating', workId: intent.workId, annictId: intent.annictId, rating: intent.content.axes.ratingOverallState, ...(intent.idMal ? { idMal: intent.idMal } : {}) }
      }
      return { ...intent, keepOverall: true }
    }
    case 'match': {
      const stateGone = intent.keepState === true || dropped.has('status')
      const ratingGone = intent.rating === undefined || dropped.has('overall')
      if (stateGone && ratingGone) return null
      const { rating, ...rest } = intent
      return { ...rest, ...(stateGone ? { keepState: true as const } : {}), ...(ratingGone ? {} : { rating }) }
    }
    default:
      return null
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
const optionalId = (v: unknown): boolean => v === undefined || id(v)
const optionalTrue = (v: unknown): boolean => v === undefined || v === true

function isIntent(v: unknown): v is WriteIntent {
  if (!record(v)) return false
  switch (v.kind) {
    case 'status':
      return text(v.workId) && STATUSES.includes(v.state) && optionalId(v.idMal)
    case 'rating':
      return text(v.workId) && id(v.annictId) && rating(v.rating) && optionalId(v.idMal)
    case 'review': {
      const c = v.content
      return (
        text(v.workId) &&
        id(v.annictId) &&
        record(c) &&
        typeof c.body === 'string' &&
        record(c.axes) &&
        AXES.every((k) => rating((c.axes as Record<string, unknown>)[k])) &&
        optionalId(v.idMal) &&
        optionalTrue(v.keepOverall)
      )
    }
    case 'episode':
      return text(v.episodeId) && typeof v.recorded === 'boolean' && rating(v.rating) && typeof v.since === 'number' && (v.comment === undefined || typeof v.comment === 'string')
    case 'episodeComment':
      return text(v.episodeId) && typeof v.comment === 'string' && rating(v.rating) && typeof v.since === 'number'
    case 'match': {
      const t = v.title
      return (
        id(v.idMal) &&
        record(t) &&
        optionalText(t.native) &&
        optionalText(t.romaji) &&
        optionalText(t.english) &&
        STATUSES.includes(v.state) &&
        (v.rating === undefined || rating(v.rating)) &&
        optionalTrue(v.keepState)
      )
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
    keyOf(v.intent) === v.key &&
    (v.dropped === undefined || (Array.isArray(v.dropped) && v.dropped.every((f) => FIELDS.includes(f))))
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

// 書き込みを頼んだ。行き先を控えに書き、成功したときに消すための札を返す。
// 前からある控えのうち、今回と同じ項目は「もう書かない」にする（すべての項目がそうなった控えは消す）
export function journalPut(label: string, intents: readonly WriteIntent[], now = Date.now()): JournalTicket {
  if (intents.length === 0) return []
  const entries = load()
  const fresh = new Set(intents.flatMap((i) => fieldsOf(i).flatMap((f) => f.aliases)))
  const kept: JournalEntry[] = []
  for (const e of entries) {
    const dropped = new Set<Field>(e.dropped ?? [])
    for (const f of fieldsOf(e.intent)) if (f.aliases.some((a) => fresh.has(a))) dropped.add(f.name)
    if (narrowIntent(e.intent, dropped) === null) continue
    kept.push(dropped.size > 0 ? { ...e, dropped: [...dropped] } : e)
  }
  lastSeq = Math.max(lastSeq, ...entries.map((e) => e.seq)) + 1
  const seq = lastSeq
  const added = intents.map((intent): JournalEntry => ({ key: keyOf(intent), label, intent, at: now, seq, session: SESSION }))
  save([...kept, ...added])
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

// 控えの今の中身のうち、まだ書くべき行き先（そのあとで同じ項目を頼み直していれば、その項目を除く。何も残らなければ null）。
// 古い行き先で、あとから頼んだ値を上書きしない
export function pendingIntent(entry: JournalEntry): WriteIntent | null {
  const now = load().find((e) => e.key === entry.key && e.seq === entry.seq)
  return now ? narrowIntent(now.intent, new Set(now.dropped ?? [])) : null
}

// 画面の作品の MyAnimeList の ID（Annict の malAnimeId は文字列）。無い・おかしいときは undefined
export function idMalOf(malAnimeId: string | null | undefined): number | undefined {
  const n = Number(malAnimeId)
  return malAnimeId && Number.isInteger(n) && n > 0 ? n : undefined
}
