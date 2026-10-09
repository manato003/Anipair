import { useState } from 'react'
import { Spinner } from '../../components/Loading'
import { storedAtLabel } from '../../lib/offlineCache'
import { useNotice } from '../../lib/notices'
import { useWriteQueue } from '../../lib/useWriteQueue'
import { isStillPending, journalDone, leftoverEntries, type JournalEntry } from '../../lib/writeJournal'
import { reconcileIntent } from './reconcile'

// 前回開いたときに送れなかった書き込み（送る前に閉じた・失敗したまま閉じた）を知らせる帯。送るかどうかは利用者が決める
// （別の端末であとから直していることもあるので、黙って送らない）。送るときは Annict の今の状態と比べて、足りない分だけ書く（reconcile.ts）
export function UnsentWrites(props: { token: string }) {
  // 起動したときの分だけを見る（このあとに頼んだ書き込みは、ふつうの送信の列が受け持つ）
  const [groups, setGroups] = useState(() => groupByAction(leftoverEntries()))
  const [sent, setSent] = useState(false)
  const queue = useWriteQueue()
  // コントロールセンターにも並べる（画面の上の帯を閉じずに先へ進んでも、あとから送れるように）
  useNotice(groups.length > 0 && !sent ? { id: 'unsent', title: `前回送れなかった記録 ${groups.length}件`, body: '送ると、Annict の今の内容と比べて足りない分だけを書きます。', action: { label: '送る', run: () => send() }, urgent: true } : null)

  if (groups.length === 0) return null

  function send() {
    for (const group of groups) {
      // そのあとで同じ項目を頼み直していれば、古い行き先では送らない
      const still = group.filter(isStillPending)
      if (still.length === 0) continue
      const intents = still.map((e) => e.intent)
      queue.enqueue(
        still[0].label,
        async () => {
          for (const intent of intents) await reconcileIntent(props.token, intent)
        },
        intents,
      )
    }
    setSent(true)
  }

  function discard() {
    for (const group of groups) journalDone(group.map((e) => ({ key: e.key, seq: e.seq })))
    setGroups([])
  }

  if (sent) {
    if (queue.pending > 0) {
      return (
        <div className="auth-banner unsent" role="status">
          <p className="auth-banner__text">
            <Spinner /> 前回送れなかった記録を送っています（残り{queue.pending}件）
          </p>
        </div>
      )
    }
    if (queue.failed.length > 0) {
      return (
        <div className="auth-banner unsent" role="alert">
          <p className="auth-banner__text">
            {queue.failed.length}件を送れませんでした（{queue.failed[0].message}）
          </p>
          <div className="auth-banner__actions">
            <button type="button" className="btn btn--primary" onClick={queue.retryFailed}>
              もう一度
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                queue.dismissFailed()
                setGroups([])
              }}
            >
              送らない
            </button>
          </div>
        </div>
      )
    }
    return null
  }

  const oldest = Math.min(...groups.map((g) => g[0].at))
  return (
    <div className="auth-banner unsent" role="alert">
      <div className="unsent__body">
        <p className="auth-banner__text">
          前回（{storedAtLabel(new Date(oldest).toISOString())}〜）送れなかった記録が{groups.length}件あります。送ると、Annict の今の内容と比べて足りない分だけを書きます。
        </p>
        <details className="unsent__list">
          <summary>内容を見る</summary>
          <ul>
            {groups.map((g) => (
              <li key={g[0].seq}>{g[0].label}</li>
            ))}
          </ul>
        </details>
      </div>
      <div className="auth-banner__actions">
        <button type="button" className="btn btn--primary" onClick={send}>
          送る
        </button>
        <button type="button" className="link" onClick={discard}>
          送らない
        </button>
      </div>
    </div>
  )
}

// 1回の操作で頼んだもの（状態と評価など）は、同じ番号でまとめて控えている。1件として数え、頼んだ順に並べる
function groupByAction(entries: JournalEntry[]): JournalEntry[][] {
  const bySeq = new Map<number, JournalEntry[]>()
  for (const e of entries) bySeq.set(e.seq, [...(bySeq.get(e.seq) ?? []), e])
  return [...bySeq.values()]
}
