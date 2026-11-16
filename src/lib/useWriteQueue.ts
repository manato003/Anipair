import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnictError } from './annict'
import { isFrozen, loadAnnictToken } from './storage'
import { fieldsOf, journalDone, journalPut, narrowIntent, ticketDropped, type Field, type JournalTicket, type WriteIntent } from './writeJournal'
import { t } from './i18n'

// 列に並べる書き込み。unsent は、頼んだときに上書きした書き込みのうち、送り始める時点でまだ届いていないものの行き先
// （上書きした項目の分だけ。古い順）。「書く前の値」を覚えて取り消しで戻す書き込みは、Annict から読んだ値の代わりにこれを使う。
// 届いていない取り消しを上書きした答えが Annict から読むと、その取り消しが消すはずだった前の答えを「書く前の値」として覚え、
// 取り消したときにそれへ戻してしまう（2026-11-13 のレビュー O4）
export type WriteTask = (unsent: readonly WriteIntent[]) => Promise<void>

export interface FailedWrite {
  label: string
  message: string
  // 自動で直せないときに、利用者が手で直せる場所（Annict の検索ページ・フォーラムなど）
  links?: readonly { href: string; text: string }[]
  task: WriteTask
  intents?: readonly WriteIntent[]
  // 端末の控え（lib/writeJournal.ts）の札。送らないことにしたら控えからも消す
  ticket?: JournalTicket
  // intents を頼んだときの番号。あとから同じ項目を頼み直したかを見分ける
  stamp?: number
  // 頼みの札（送り直しても同じもの）。頼んだ側が送る前に取りやめたら、この行を一覧から外す
  ask?: Ask
}

// 行き先のある頼み。頼んだ側が、送る前に取りやめられる（enqueue の戻り値）。「もう一度」で同じ task を送り直しても同じ札を使う
interface Ask {
  label: string
  intents: readonly WriteIntent[]
  // いちばん新しく頼んだときの番号
  stamp: number
  ticket: JournalTicket
  // 届いた・取りやめた・送らないことにした（この頼みの行き先は、もう誰も送らなくてよい）
  over: boolean
  // 送る前に取りやめた（task は何も書かない。このあとの失敗は一覧に出さない）
  withdrawn: boolean
  // 「もう一度」で、行き先をそのまま書く送り直し（reconcile）に回した。頼んだ側の task を通らないので、頼んだ側は書かれたかを知らない
  resent: boolean
  // この頼みを上書きした頼みが取りやめられ、この頼みの行き先が、列の側で頼み直された（頼んだ側の task とは別に書かれる）
  reasked: boolean
  // この頼みが上書きした、まだ届いていなかった頼みと、その上書きした分の行き先。
  // 取りやめるときは、頼まなかったことにするので、届いていない分を頼み直す
  covered: { ask: Ask; intents: readonly WriteIntent[] }[]
}

// 送信待ち・送信中か、失敗して一覧にある頼み（新しい頼みが上書きする相手）。起動中だけ持つ
const openAsks = new Set<Ask>()
// 失敗の一覧にある頼みの札に印を付ける（一覧はフックの ref が持つので、フックの中では書き換えず、ここを通す）
// 送らないことにした
function giveUp(ask: Ask): void {
  ask.over = true
  openAsks.delete(ask)
}
// 行き先をそのまま書く送り直しに回した
function handOver(ask: Ask): void {
  ask.resent = true
  openAsks.delete(ask)
}

// 同じ項目（作品の状態・総合評価・感想の中身、話の記録など。writeJournal の fieldsOf の呼び名）について、いちばん新しく頼んだ書き込みの番号。起動中だけ持つ。
// 失敗した書き込みを「もう一度」送るとき、そのあとで利用者が同じ項目を付け直した・取り消した分まで古い答えで上書きしないために使う
// （2026-10-06 の点検で見つけた: 評価の送信が失敗 → 別の評価に付け直して成功 → 「もう一度」で古い評価に戻っていた。
// 2026-10-12 のレビュー: 感想の保存は総合評価も書くので、種類ごとに見ていると、あとで総合評価だけ変えた分を古い感想で戻していた）
const latestByAlias = new Map<string, number>()
let lastAsk = 0
function stamp(intents: readonly WriteIntent[] | undefined): number | undefined {
  if (!intents) return undefined
  const n = ++lastAsk
  for (const intent of intents) for (const f of fieldsOf(intent)) for (const a of f.aliases) latestByAlias.set(a, n)
  return n
}
// まだ上書きされていない行き先だけ（一部の項目が頼み直されていれば、残りの項目だけの行き先にする）。
// shared: 端末の控えで頼み直された項目（ticketDropped。行き先の順。null はすべての項目）。起動中の番号はこのタブで頼んだ分しか知らないので、送り直す前に足して見る
function liveIntents(f: Pick<FailedWrite, 'intents' | 'stamp'>, shared?: readonly (readonly Field[] | null)[]): readonly WriteIntent[] | undefined {
  if (!f.intents || f.stamp === undefined) return f.intents
  const n = f.stamp
  return f.intents.flatMap((intent, i) => {
    if (shared?.[i] === null) return []
    const dropped = new Set<Field>(shared?.[i] ?? [])
    for (const x of fieldsOf(intent)) if (x.aliases.some((a) => (latestByAlias.get(a) ?? 0) > n)) dropped.add(x.name)
    const live = narrowIntent(intent, dropped)
    return live ? [live] : []
  })
}
// これから頼む intents が上書きする、まだ届いていない頼みと、その上書きされる分（番号を進める前に呼ぶ）。
// すでにほかの頼みで上書きされた項目は入れない（そちらの頼みが引き受けている）
function coveredBy(intents: readonly WriteIntent[], self: Ask | undefined): Ask['covered'] {
  const fresh = new Set(intents.flatMap((i) => fieldsOf(i).flatMap((f) => f.aliases)))
  const covered: Ask['covered'] = []
  for (const ask of openAsks) {
    if (ask === self) continue
    const part = ask.intents.flatMap((intent) => {
      const fields = fieldsOf(intent)
      const hit = new Set(fields.filter((f) => f.aliases.every((a) => (latestByAlias.get(a) ?? 0) <= ask.stamp) && f.aliases.some((a) => fresh.has(a))).map((f) => f.name))
      if (hit.size === 0) return []
      const rest = narrowIntent(intent, new Set(fields.map((f) => f.name).filter((name) => !hit.has(name))))
      return rest ? [rest] : []
    })
    if (part.length > 0) covered.push({ ask, intents: part })
  }
  return covered
}
// 頼んだときに上書きした書き込みのうち、まだ届いていないものの行き先（古い順）。届いた・取りやめた・送らないことにしたものは入れない。
// 列は1本なので、送り始める時点では、先に頼んだ書き込みはどれも終わっている（届いたか、失敗したか）
function unsentUnder(ask: Ask): readonly WriteIntent[] {
  return ask.covered
    .filter((c) => !c.ask.over)
    .sort((a, b) => a.ask.stamp - b.ask.stamp)
    .flatMap((c) => c.intents)
}

// 行き先を、Annict の今の状態と比べて書く（features/unsent/reconcile.ts。何度送っても同じ結果になる）
const reconcileTask = (intents: readonly WriteIntent[]) => async () => {
  const token = loadAnnictToken()
  if (!token) throw new Error(t('Annictにログインしていません', 'You’re not logged in to Annict.'))
  // reconcile は送信の列（このファイル）を使うので、読み込みの循環を避けて、使うときに読む
  const { reconcileIntent } = await import('../features/unsent/reconcile')
  for (const intent of intents) await reconcileIntent(token, intent)
}

// 頼んだときのまま、何も頼み直されていない
const untouched = (f: FailedWrite, live: readonly WriteIntent[] | undefined) => !live || (live.length === f.intents?.length && live.every((x, i) => x === f.intents![i]))

// 利用者に見せる形の失敗。links を付けると、失敗の表示に手で直すためのリンクが出る
export class WriteError extends Error {
  readonly links?: FailedWrite['links']
  constructor(message: string, links?: FailedWrite['links']) {
    super(message)
    this.links = links
  }
}

export function messageOf(e: unknown): string {
  if (e instanceof AnnictError) return e.message
  return e instanceof Error ? e.message : String(e)
}

// 外部への書き込みは、アプリ全体で1本の列に並べる。画面ごとに列を持つと、同じ作品の評価を別の画面から続けて変えたとき、
// 後の送信が前の送信の結果（共有の感想の控え）を待たずに古い感想を読み、感想の重複や消し違いを起こすため
let chain: Promise<void> = Promise.resolve()
let pendingAll = 0
// 書き込みを頼んだ・終えたたびに増える番号（どの画面の分も）
let writeEpoch = 0

// どの画面かを問わず、送信待ちか送信中の書き込みがあるか（記録の読み直しを控える判断に使う）
export function hasPendingWrites(): boolean {
  return pendingAll > 0
}

// 読み込みを始める前に控える印。読み終えたら noWritesSince で、そのあいだに書き込みが無かったかを見る
export function writeMark(): number {
  return writeEpoch
}

// mark を控えてから今まで、書き込みを頼んでも終えてもおらず、いま送信待ちも無い（＝読んだ中身は書く前のものではない）。
// 終わりに hasPendingWrites だけを見ると、読んでいるあいだに始まって終わった書き込みを見逃し、
// 書く前の中身で画面の先行表示を巻き戻す（2026-11-10 のレビュー G3）
export function noWritesSince(mark: number): boolean {
  return pendingAll === 0 && writeEpoch === mark
}

// 画面は送信の完了を待たずに次へ進む。残り件数と失敗は、その画面で頼んだ分だけを持つ。
// 失敗したものは一覧に残し、まとめて送り直せる。
// intents（最終的にどうしたいか）を渡すと、送り終えるまで端末の控えにも残す（閉じても、次に開いたときに送り直せる。lib/writeJournal.ts）
export function useWriteQueue() {
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState<FailedWrite[]>([])
  // 失敗の一覧の最新を ref にも持つ。送り直しを状態の更新関数の中でやると、StrictMode（開発時）で更新関数が2回走って2重に送るため、
  // 送り直す一覧は ref から読み、状態は表示のためだけに合わせる
  const failedRef = useRef<FailedWrite[]>([])
  const updateFailed = useCallback((next: FailedWrite[]) => {
    failedRef.current = next
    setFailed(next)
  }, [])

  // 列に並べる。again は「もう一度」で同じ task を送り直すときの、前の札
  const put = useCallback((label: string, task: WriteTask, intents?: readonly WriteIntent[], again?: Ask): Ask | undefined => {
    setPending((p) => p + 1)
    pendingAll++
    writeEpoch++
    const ticket = intents ? journalPut(label, intents) : []
    const covered = intents ? coveredBy(intents, again) : []
    const n = stamp(intents)
    let ask: Ask | undefined
    if (intents && n !== undefined) {
      ask = again ?? { label, intents, stamp: n, ticket, over: false, withdrawn: false, resent: false, reasked: false, covered: [] }
      ask.stamp = n
      ask.ticket = ticket
      ask.covered = [...ask.covered, ...covered]
      openAsks.add(ask)
    }
    // この画面の失敗のうち、今の頼みですべて上書きされたものは一覧から外す（もう送らない）
    if (intents && failedRef.current.some((f) => liveIntents(f)?.length === 0)) {
      for (const f of failedRef.current) if (f.ask && liveIntents(f)?.length === 0) openAsks.delete(f.ask)
      updateFailed(failedRef.current.filter((f) => liveIntents(f)?.length !== 0))
    }
    chain = chain.then(async () => {
      try {
        await task(ask ? unsentUnder(ask) : [])
        journalDone(ticket)
        if (ask) {
          ask.over = true
          openAsks.delete(ask)
        }
      } catch (e) {
        const failed: FailedWrite = { label, message: messageOf(e), links: e instanceof WriteError ? e.links : undefined, task, intents, ticket, stamp: n, ask }
        // 送る前に取りやめた頼みは、途中（書く前の読み込みなど）で失敗しても、失敗として残さない（何も書かないので、送り直すものが無い）
        if (ask?.withdrawn) journalDone(ticket)
        // 送っているあいだに、同じ項目がすべて頼み直されていたら、失敗として残さない（新しいほうが送られる）
        else if (liveIntents(failed)?.length === 0) {
          journalDone(ticket)
          if (ask) openAsks.delete(ask)
        } else updateFailed([...failedRef.current, failed])
      } finally {
        pendingAll--
        writeEpoch++
        setPending((p) => p - 1)
      }
    })
    return ask
  }, [updateFailed])

  // 頼んだ書き込みを、送る前に取りやめる（頼んだ側の task が、まだ何も書いていないときに呼ぶ。task は自分で何も書かずに終わること）。
  // 取りやめられたら true。頼まなかったことにする: 控えを取り下げ、失敗の一覧にあれば外す。
  // 頼んだときに上書きした、まだ届いていない書き込み（送信中の取り消しなど）は、頼み直す。上書きしたままにすると、そちらが失敗しても
  // 一覧にも控えにも残らず、Annict だけが古いままになる（2026-11-13 のレビュー O1）。
  // そのあとで同じ項目がほかの頼みで頼み直されていたら、その項目は頼み直さない（あとの頼みが、いちばん新しい行き先）。
  // false は、取りやめられない（頼んだ側は、これまでどおり取り消しの書き込みを頼む）: 行き先が task の外で書かれる・書かれたとき
  // （「もう一度」で行き先をそのまま送り直した。または、この頼みを上書きした頼みが取りやめられて、列の側がこの頼みの行き先を頼み直した）
  const withdraw = useCallback((ask: Ask): boolean => {
    if (ask.withdrawn) return true
    if (ask.resent || ask.reasked) return false
    ask.withdrawn = true
    openAsks.delete(ask)
    journalDone(ask.ticket)
    if (failedRef.current.some((f) => f.ask === ask)) updateFailed(failedRef.current.filter((f) => f.ask !== ask))
    // 送らないことにした頼みを取りやめても、頼み直さない
    if (ask.over) return true
    ask.over = true
    // 頼み直す分を先に全部決めてから、古い頼みの順に並べる（頼み直すたびに番号が進むので、途中で決めると、同じ項目の新しいほうが落ちる）
    const again = ask.covered
      .filter((c) => !c.ask.over)
      .map((c) => ({ ask: c.ask, intents: liveIntents({ intents: c.intents, stamp: ask.stamp }) ?? [] }))
      .filter((c) => c.intents.length > 0)
      .sort((a, b) => a.ask.stamp - b.ask.stamp)
    for (const c of again) {
      c.ask.reasked = true
      put(c.ask.label, reconcileTask(c.intents), c.intents)
    }
    return true
  }, [put, updateFailed])

  // 戻り値は、送る前に取りやめる関数（withdraw。行き先を渡さなかった頼みは取りやめられない）
  const enqueue = useCallback(
    (label: string, task: WriteTask, intents?: readonly WriteIntent[]): (() => boolean) => {
      const ask = put(label, task, intents)
      return () => (ask ? withdraw(ask) : false)
    },
    [put, withdraw],
  )

  // 失敗したものを送り直す。そのあとで同じ項目を頼み直していれば、その項目は送らない。
  // 一部だけ頼み直されていたら、残りの行き先だけを Annict の今の状態と比べて書く（features/unsent/reconcile.ts。何度送っても同じ結果になる）。
  // 例: 感想の保存が失敗 → 総合評価だけ付け直して成功 → 「もう一度」は感想の中身だけを書き、総合評価は今の値のまま。
  // ほかのタブで頼み直した分は、共有の端末の控えで見る（2026-10-13 のレビュー: タブAで評価の送信が失敗 → タブBで別の評価にして成功 →
  // タブAの「もう一度」が古い評価で上書きしていた。タブBの頼みで、タブAの控えはその項目が「もう書かない」になるか消えている）
  const retryFailed = useCallback(() => {
    const list = failedRef.current
    updateFailed([])
    for (const f of list) {
      // 札は行き先と同じ順に1つずつ（控えに書けなかったときは空なので、起動中の番号だけで見る）
      const shared = f.ticket?.length && f.ticket.length === f.intents?.length ? ticketDropped(f.ticket) : undefined
      const live = liveIntents(f, shared)
      if (!live || untouched(f, live)) {
        put(f.label, f.task, f.intents, f.ask)
        continue
      }
      journalDone(f.ticket ?? [])
      if (live.length === 0) {
        if (f.ask) openAsks.delete(f.ask)
        continue
      }
      if (f.ask) handOver(f.ask)
      put(f.label, reconcileTask(live), live)
    }
  }, [put, updateFailed])

  // 失敗したものを送らないことにした。端末の控えからも消す（次に開いたときに聞かない）
  const dismissFailed = useCallback(() => {
    for (const f of failedRef.current) {
      journalDone(f.ticket ?? [])
      if (f.ask) giveUp(f.ask)
    }
    updateFailed([])
  }, [updateFailed])

  // 送信が残っているうちにタブを閉じようとしたら止める
  useEffect(() => {
    if (pending === 0) return
    // アカウントを切り替えて読み込み直すときは止めない（止めると、前の人の画面のまま何も書けないページが残る）
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isFrozen()) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pending])

  return { pending, failed, enqueue, retryFailed, dismissFailed }
}
