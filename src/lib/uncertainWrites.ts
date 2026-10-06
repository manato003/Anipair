import { AnnictError, createRecord, deleteRecord, deleteReview, fetchRecentActivity, updateRecord, type MyReview, type RatingState } from './annict'
import { loadUncertainWritesRaw, saveUncertainWritesRaw } from './storage'

// 「届いたか分からない」作成の後始末。Annict が不調のときの 502 は、手前の Cloudflare が「返事が来なかった」と返すもので、
// 本体では処理が済んでいることがある。そのまま送り直すと、感想や話の記録が2つできる（状態の変更は何度送っても同じなので要らない）。
// そこで、作成が 5xx・つながらないで失敗したら印を残し、次にその作品（話）を書くときに、最近の自分のアクティビティを1回読んで、
// 前回の作成が届いていたかを確かめてから進める。印は端末に置く（閉じて開き直したあとの送り直しでも効くように）

export type UncertainMark =
  // 感想の作成（oldId があれば、作ってから古い感想を消す「置き換え」の途中だった）
  | { kind: 'review'; workId: string; at: number; oldId: string | null }
  | { kind: 'record'; episodeId: string; at: number }

// 端末と Annict の時計のずれを見込んで、印の時刻より少し前から探す
export const MARGIN_MS = 10 * 60_000

// 書き込みの失敗のうち、Annict に届いていたかもしれないもの。
// 5xx とつながらない（送ったあとに切れたかもしれない）、応答を読み終える前に壊れたもの（AnnictError でない例外）。
// 401・404・GraphQL のエラー・回数の制限は、処理されずに断られたので「届いていない」
export function isUncertainFailure(e: unknown): boolean {
  if (e instanceof AnnictError) return e.kind === 'network' || (e.kind === 'api' && (e.status ?? 0) >= 500)
  return true
}

const sameTarget = (a: UncertainMark, b: UncertainMark) =>
  a.kind === 'review' && b.kind === 'review' ? a.workId === b.workId : a.kind === 'record' && b.kind === 'record' && a.episodeId === b.episodeId

function parse(value: unknown): UncertainMark[] {
  if (!Array.isArray(value)) return []
  return value.filter((m): m is UncertainMark => {
    if (!m || typeof m !== 'object' || typeof (m as UncertainMark).at !== 'number') return false
    const x = m as Record<string, unknown>
    if (x.kind === 'review') return typeof x.workId === 'string' && (x.oldId === null || typeof x.oldId === 'string')
    return x.kind === 'record' && typeof x.episodeId === 'string'
  })
}

function load(): UncertainMark[] {
  return parse(loadUncertainWritesRaw())
}

function save(list: UncertainMark[]): void {
  saveUncertainWritesRaw(list.length > 0 ? list : null)
}

// 同じ作品（話）の印は1つにする。置き換えの古い感想は、前の印から引き継ぐ（まだ消せていないかもしれない）
export function markUncertain(mark: UncertainMark): void {
  const list = load()
  const prev = list.find((m) => sameTarget(m, mark))
  const merged = mark.kind === 'review' && prev?.kind === 'review' ? { ...mark, at: Math.min(prev.at, mark.at), oldId: mark.oldId ?? prev.oldId } : mark
  save([...list.filter((m) => !sameTarget(m, mark)), merged])
}

function take(target: UncertainMark): UncertainMark | null {
  return load().find((m) => sameTarget(m, target)) ?? null
}

function clear(target: UncertainMark): void {
  save(load().filter((m) => !sameTarget(m, target)))
}

export function hasUncertainReview(workId: string): boolean {
  return take({ kind: 'review', workId, at: 0, oldId: null }) !== null
}

// 消したいものが既に無ければ、消せたのと同じ（届いたか分からない削除の送り直しで、404 を失敗にしない）
export async function deleteReviewIfExists(token: string, reviewId: string): Promise<void> {
  try {
    await deleteReview(token, reviewId)
  } catch (e) {
    if (!(e instanceof AnnictError && e.kind === 'notFound')) throw e
  }
}

export async function deleteRecordIfExists(token: string, recordId: string): Promise<void> {
  try {
    await deleteRecord(token, recordId)
  } catch (e) {
    if (!(e instanceof AnnictError && e.kind === 'notFound')) throw e
  }
}

// 感想を書く前に、その作品に印があれば片付ける。前回の作成が届いていたら、それを今の感想として返す
// （置き換えの途中だったなら、古い方を消して置き換えを終わらせる）。届いていなければ current のまま。
// 確かめる読み込みに失敗したら例外のまま（印は残す。次の送り直しで確かめ直す）
export async function settleUncertainReview(token: string, workId: string, current: MyReview | null): Promise<MyReview | null> {
  const mark = take({ kind: 'review', workId, at: 0, oldId: null })
  if (!mark || mark.kind !== 'review') return current
  const { reviews } = await fetchRecentActivity(token, mark.at - MARGIN_MS)
  // 新しい順に並んでいる
  const found = reviews.find((r) => r.workId === workId)
  let result = current
  if (found && found.review.id !== current?.id) {
    if (mark.oldId && mark.oldId !== found.review.id) await deleteReviewIfExists(token, mark.oldId)
    result = found.review
  }
  clear(mark)
  return result
}

// 話を記録する。前回の記録が届いていたかもしれない話なら、まず確かめる（届いていれば、その記録の ID を返して作らない）
export async function createRecordGuarded(token: string, episodeId: string, rating: RatingState | null, comment?: string): Promise<string> {
  const found = await resolveUncertainRecord(token, episodeId)
  if (found) {
    // 届いていた記録に、感想を付け直す（前回の送信で感想が付いたかは分からない）
    if (comment) await updateRecord(token, found, comment, rating)
    return found
  }
  const at = Date.now()
  try {
    return await createRecord(token, episodeId, rating, comment)
  } catch (e) {
    if (isUncertainFailure(e)) markUncertain({ kind: 'record', episodeId, at })
    throw e
  }
}

// 話の記録を頼んだあと（since 以降）に作られた自分の記録の ID。無ければ null（最近のアクティビティを読む）
export async function findMyRecord(token: string, episodeId: string, since: number): Promise<string | null> {
  const { records } = await fetchRecentActivity(token, since - MARGIN_MS)
  return records.find((r) => r.episodeId === episodeId)?.id ?? null
}

// 届いたか分からない話の記録が、実は届いていたなら、その ID を返す（取り消しで消すため）。印が無い・届いていなければ null
export async function resolveUncertainRecord(token: string, episodeId: string): Promise<string | null> {
  const mark = take({ kind: 'record', episodeId, at: 0 })
  if (!mark) return null
  const { records } = await fetchRecentActivity(token, mark.at - MARGIN_MS)
  clear(mark)
  return records.find((r) => r.episodeId === episodeId)?.id ?? null
}
