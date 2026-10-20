import { useEffect, useId, useState } from 'react'
import { t, plural } from '../lib/i18n'
import { useNotice } from '../lib/notices'
import type { FailedWrite } from '../lib/useWriteQueue'
import { Spinner } from './Loading'

// 保存中の札を出すまでの待ち。すぐ終わる保存（話ごとの連続評価など）では何も出さない（出ては消えるちらつきを防ぐ）
const SHOW_PENDING_AFTER_MS = 600

// 保存中かどうかを、少し続いたときだけ true にする
function useLingering(on: boolean): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!on) return
    const t = window.setTimeout(() => setShown(true), SHOW_PENDING_AFTER_MS)
    return () => {
      window.clearTimeout(t)
      setShown(false)
    }
  }, [on])
  return on && shown
}

// 送信の状態。保存中は画面の下に浮かぶ小さな札（画面の流れに入れないので、出ても消えても一覧が動かない）。
// 保存できなかったときは、押してもらう必要があるので、置かれた場所にそのまま出す
export function SaveStatus(props: { pending: number; failed: FailedWrite[]; onRetry: () => void; onDismiss?: () => void }) {
  const first = props.failed[0]
  const pendingShown = useLingering(props.pending > 0)
  // コントロールセンターにも並べる（画面を移っても、保存できなかったことが分かるように）
  const id = useId()
  useNotice(
    first
      ? {
          id: `save${id}`,
          title: t(`${props.failed.length}件を保存できませんでした`, `${plural(props.failed.length, 'record', 'records')} couldn’t be saved`),
          body: first.message,
          action: first.links?.length ? undefined : { label: t('もう一度', 'Retry'), run: props.onRetry },
          urgent: true,
        }
      : null,
  )
  if (first) {
    return (
      <div className="save save--error" role="alert">
        <span>
          {t(`${props.failed.length}件を保存できませんでした。`, `${plural(props.failed.length, 'record', 'records')} couldn’t be saved. `)}
          {first.message}
        </span>
        {first.links?.length ? (
          first.links.map((l) => (
            <a key={l.href} className="link" href={l.href} target="_blank" rel="noreferrer">
              {l.text}
            </a>
          ))
        ) : (
          <button type="button" className="link" onClick={props.onRetry}>
            {t('もう一度送る', 'Send again')}
          </button>
        )}
        {props.onDismiss && (
          <button type="button" className="link" onClick={props.onDismiss}>
            {t('閉じる', 'Close')}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="save-toast" aria-live="polite" data-visible={pendingShown || undefined}>
      {pendingShown && (
        <>
          <Spinner />
          {t(`保存中（残り${props.pending}件）`, `Saving (${props.pending} left)`)}
        </>
      )}
    </div>
  )
}
