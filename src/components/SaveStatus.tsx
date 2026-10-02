import type { FailedWrite } from '../lib/useWriteQueue'

export function SaveStatus(props: { pending: number; failed: FailedWrite[]; onRetry: () => void; onDismiss?: () => void }) {
  const first = props.failed[0]
  if (first) {
    return (
      <div className="save save--error" role="alert">
        <span>
          {props.failed.length}件を保存できませんでした。{first.message}
        </span>
        {first.link ? (
          <a className="link" href={first.link.href} target="_blank" rel="noreferrer">
            {first.link.text}
          </a>
        ) : (
          <button type="button" className="link" onClick={props.onRetry}>
            もう一度送る
          </button>
        )}
        {props.onDismiss && (
          <button type="button" className="link" onClick={props.onDismiss}>
            閉じる
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="save" aria-live="polite">
      {props.pending > 0 ? `保存中（残り${props.pending}件）` : ''}
    </div>
  )
}
