import { useState, type FormEvent } from 'react'
import { CONTACT_MAX, FEEDBACK_KIND_LABELS, FEEDBACK_MAX, FEEDBACK_MIN, sendFeedback, type FeedbackDraft, type FeedbackKind } from '../lib/feedback'
import { Sheet } from './Sheet'
import { Spinner } from './Loading'

// 質問・不具合・要望を送るシート（ヘルプの「文章で詳しく読む」と、設定の「お問い合わせ」から開く）。
// GitHub のアカウントが無くても送れる。送った内容は開発者だけが見る（問い合わせ専用の非公開リポジトリの Issue になる。api/feedback.ts）
export function FeedbackSheet(props: { active?: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<FeedbackDraft>({ kind: 'bug', body: '', contact: '', withDevice: true, website: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const set = <K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const length = draft.body.trim().length
  const ready = length >= FEEDBACK_MIN && length <= FEEDBACK_MAX && !sending

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setSending(true)
    setError(null)
    const failed = await sendFeedback(draft)
    setSending(false)
    if (failed) setError(failed)
    else setSent(true)
  }

  return (
    <Sheet label="質問・不具合・要望を送る" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">質問・不具合・要望を送る</h2>
      {sent ? (
        <div className="feedback__done" role="status">
          <p>送りました。ありがとうございます。</p>
          <p className="note">
            {draft.contact.trim() ? 'お返事が要る内容には、書いていただいた返信先にお送りします。' : 'いただいた内容は、今後の改善に使わせていただきます。'}
          </p>
          <button type="button" className="btn btn--primary" onClick={props.onClose}>
            閉じる
          </button>
        </div>
      ) : (
        <form className="feedback" onSubmit={submit}>
          <p className="note">
            送った内容は開発者だけが読みます（公開はされません）。GitHub のアカウントは要りません。よくある質問は、設定の「お問い合わせ」とヘルプにあります。
          </p>
          <fieldset className="feedback__kinds">
            <legend className="review__axis-name">種類</legend>
            {FEEDBACK_KIND_LABELS.map(([kind, label]) => (
              <button key={kind} type="button" className="chip" aria-pressed={draft.kind === kind} onClick={() => set('kind', kind as FeedbackKind)}>
                {label}
              </button>
            ))}
          </fieldset>
          <label className="review__body">
            <span className="review__axis-name">内容</span>
            <textarea
              value={draft.body}
              rows={6}
              maxLength={FEEDBACK_MAX}
              placeholder={draft.kind === 'bug' ? '例: どの画面で、何をしたら、どうなったか' : draft.kind === 'idea' ? '例: こういう機能があるとうれしい' : ''}
              onChange={(e) => set('body', e.target.value)}
            />
            <span className="note feedback__count">
              {length}/{FEEDBACK_MAX}字
            </span>
          </label>
          <label className="review__body">
            <span className="review__axis-name">返信先（任意）</span>
            <input
              type="text"
              value={draft.contact}
              maxLength={CONTACT_MAX}
              placeholder="例: X のアカウント（お返事が要るときだけ）"
              autoComplete="off"
              onChange={(e) => set('contact', e.target.value)}
            />
          </label>
          <label className="feedback__check">
            <input type="checkbox" checked={draft.withDevice} onChange={(e) => set('withDevice', e.target.checked)} />
            アプリのバージョンと、使っている端末・ブラウザの種類を添える（不具合を調べるのに使います）
          </label>
          {/* 人には見えない欄。機械の送信はここも埋めてくるので、入っていたら捨てる */}
          <div className="visually-hidden" aria-hidden="true">
            <label>
              ウェブサイト
              <input type="text" tabIndex={-1} autoComplete="off" value={draft.website} onChange={(e) => set('website', e.target.value)} />
            </label>
          </div>
          {error && (
            <p className="note feedback__error" role="alert">
              {error}
            </p>
          )}
          <div className="review__foot">
            <a className="link" href="/privacy.html" target="_blank" rel="noreferrer">
              プライバシーポリシー
            </a>
            <button type="submit" className="btn btn--primary" disabled={!ready}>
              {sending ? (
                <>
                  <Spinner />
                  送っています…
                </>
              ) : (
                '送る'
              )}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
