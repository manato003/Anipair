import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnictError } from './annict'
import { journalDone, journalPut, type JournalTicket, type WriteIntent } from './writeJournal'

export interface FailedWrite {
  label: string
  message: string
  // 自動で直せないときに、利用者が手で直せる場所（Annict の検索ページなど）
  link?: { href: string; text: string }
  task: () => Promise<void>
  intents?: readonly WriteIntent[]
  // 端末の控え（lib/writeJournal.ts）の札。送らないことにしたら控えからも消す
  ticket?: JournalTicket
}

// 利用者に見せる形の失敗。link を付けると、失敗の表示に手で直すためのリンクが出る
export class WriteError extends Error {
  readonly link?: FailedWrite['link']
  constructor(message: string, link?: FailedWrite['link']) {
    super(message)
    this.link = link
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
    chain = chain.then(async () => {
      try {
        await task()
        journalDone(ticket)
      } catch (e) {
        const link = e instanceof WriteError ? e.link : undefined
        updateFailed([...failedRef.current, { label, message: messageOf(e), link, task, intents, ticket }])
      } finally {
        pendingAll--
        setPending((p) => p - 1)
      }
    })
  }, [updateFailed])

  const retryFailed = useCallback(() => {
    const list = failedRef.current
    updateFailed([])
    for (const f of list) enqueue(f.label, f.task, f.intents)
  }, [enqueue, updateFailed])

  // 失敗したものを送らないことにした。端末の控えからも消す（次に開いたときに聞かない）
  const dismissFailed = useCallback(() => {
    for (const f of failedRef.current) journalDone(f.ticket ?? [])
    updateFailed([])
  }, [updateFailed])

  // 送信が残っているうちにタブを閉じようとしたら止める
  useEffect(() => {
    if (pending === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pending])

  return { pending, failed, enqueue, retryFailed, dismissFailed }
}
