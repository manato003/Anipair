import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnictError } from './annict'
import { isFrozen, loadAnnictToken } from './storage'
import { fieldsOf, journalDone, journalPut, narrowIntent, type Field, type JournalTicket, type WriteIntent } from './writeJournal'

export interface FailedWrite {
  label: string
  message: string
  // 自動で直せないときに、利用者が手で直せる場所（Annict の検索ページ・フォーラムなど）
  links?: readonly { href: string; text: string }[]
  task: () => Promise<void>
  intents?: readonly WriteIntent[]
  // 端末の控え（lib/writeJournal.ts）の札。送らないことにしたら控えからも消す
  ticket?: JournalTicket
  // intents を頼んだときの番号。あとから同じ項目を頼み直したかを見分ける
  stamp?: number
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
// まだ上書きされていない行き先だけ（一部の項目が頼み直されていれば、残りの項目だけの行き先にする）
function liveIntents(f: FailedWrite): readonly WriteIntent[] | undefined {
  if (!f.intents || f.stamp === undefined) return f.intents
  const n = f.stamp
  return f.intents.flatMap((intent) => {
    const dropped = new Set<Field>(fieldsOf(intent).filter((x) => x.aliases.some((a) => (latestByAlias.get(a) ?? 0) > n)).map((x) => x.name))
    const live = narrowIntent(intent, dropped)
    return live ? [live] : []
  })
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

// どの画面かを問わず、送信待ちか送信中の書き込みがあるか（記録の読み直しを控える判断に使う）
export function hasPendingWrites(): boolean {
  return pendingAll > 0
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

  const enqueue = useCallback((label: string, task: () => Promise<void>, intents?: readonly WriteIntent[]) => {
    setPending((p) => p + 1)
    pendingAll++
    const ticket = intents ? journalPut(label, intents) : []
    const n = stamp(intents)
    // この画面の失敗のうち、今の頼みですべて上書きされたものは一覧から外す（もう送らない）
    if (intents && failedRef.current.some((f) => liveIntents(f)?.length === 0)) {
      updateFailed(failedRef.current.filter((f) => liveIntents(f)?.length !== 0))
    }
    chain = chain.then(async () => {
      try {
        await task()
        journalDone(ticket)
      } catch (e) {
        const failed: FailedWrite = { label, message: messageOf(e), links: e instanceof WriteError ? e.links : undefined, task, intents, ticket, stamp: n }
        // 送っているあいだに、同じ項目がすべて頼み直されていたら、失敗として残さない（新しいほうが送られる）
        if (liveIntents(failed)?.length === 0) journalDone(ticket)
        else updateFailed([...failedRef.current, failed])
      } finally {
        pendingAll--
        setPending((p) => p - 1)
      }
    })
  }, [updateFailed])

  // 失敗したものを送り直す。そのあとで同じ項目を頼み直していれば、その項目は送らない。
  // 一部だけ頼み直されていたら、残りの行き先だけを Annict の今の状態と比べて書く（features/unsent/reconcile.ts。何度送っても同じ結果になる）。
  // 例: 感想の保存が失敗 → 総合評価だけ付け直して成功 → 「もう一度」は感想の中身だけを書き、総合評価は今の値のまま
  const retryFailed = useCallback(() => {
    const list = failedRef.current
    updateFailed([])
    for (const f of list) {
      const live = liveIntents(f)
      if (!live || untouched(f, live)) {
        enqueue(f.label, f.task, f.intents)
        continue
      }
      journalDone(f.ticket ?? [])
      if (live.length === 0) continue
      enqueue(
        f.label,
        async () => {
          const token = loadAnnictToken()
          if (!token) throw new Error('Annictにログインしていません')
          // reconcile は送信の列（このファイル）を使うので、読み込みの循環を避けて、使うときに読む
          const { reconcileIntent } = await import('../features/unsent/reconcile')
          for (const intent of live) await reconcileIntent(token, intent)
        },
        live,
      )
    }
  }, [enqueue, updateFailed])

  // 失敗したものを送らないことにした。端末の控えからも消す（次に開いたときに聞かない）
  const dismissFailed = useCallback(() => {
    for (const f of failedRef.current) journalDone(f.ticket ?? [])
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
