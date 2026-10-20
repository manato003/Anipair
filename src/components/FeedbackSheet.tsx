import { useState, type FormEvent } from 'react'
import { CONTACT_MAX, FEEDBACK_KIND_LABELS, FEEDBACK_MAX, FEEDBACK_MIN, sendFeedback, type FeedbackDraft, type FeedbackKind } from '../lib/feedback'
import { t } from '../lib/i18n'
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
    <Sheet label={t('質問・不具合・要望を送る', 'Send feedback')} active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{t('質問・不具合・要望を送る', 'Send feedback')}</h2>
      {sent ? (
        <div className="feedback__done" role="status">
          <p>{t('送りました。ありがとうございます。', 'Sent. Thank you!')}</p>
          <p className="note">
            {draft.contact.trim()
              ? t('お返事が要る内容には、書いていただいた返信先にお送りします。', 'If your message needs a reply, we’ll send it to the contact you gave.')
              : t('いただいた内容は、今後の改善に使わせていただきます。', 'We’ll use what you sent to improve Anipair.')}
          </p>
          <button type="button" className="btn btn--primary" onClick={props.onClose}>
            {t('閉じる', 'Close')}
          </button>
        </div>
      ) : (
        <form className="feedback" onSubmit={submit}>
          <p className="note">
            {t(
              '送った内容は開発者だけが読みます（公開はされません）。GitHubのアカウントは要りません。よくある質問は、設定の「お問い合わせ」とヘルプにあります。',
              'Only the developer reads what you send (it isn’t made public). You don’t need a GitHub account. Common questions are answered in Settings under “Contact” and in the help.',
            )}
          </p>
          <fieldset className="feedback__kinds">
            <legend className="review__axis-name">{t('種類', 'Type')}</legend>
            {FEEDBACK_KIND_LABELS.map(([kind, label]) => (
              <button key={kind} type="button" className="chip" aria-pressed={draft.kind === kind} onClick={() => set('kind', kind as FeedbackKind)}>
                {label}
              </button>
            ))}
          </fieldset>
          <label className="review__body">
            <span className="review__axis-name">{t('内容', 'Message')}</span>
            <textarea
              value={draft.body}
              rows={6}
              maxLength={FEEDBACK_MAX}
              placeholder={
                draft.kind === 'bug'
                  ? t('例: どの画面で、何をしたら、どうなったか', 'e.g. which screen, what you did, and what happened')
                  : draft.kind === 'idea'
                    ? t('例: こういう機能があるとうれしい', 'e.g. I’d love a feature that…')
                    : ''
              }
              onChange={(e) => set('body', e.target.value)}
            />
            <span className="note feedback__count">
              {t(`${length}/${FEEDBACK_MAX}字`, `${length}/${FEEDBACK_MAX}`)}
            </span>
          </label>
          <label className="review__body">
            <span className="review__axis-name">{t('返信先（任意）', 'Contact for a reply (optional)')}</span>
            <input
              type="text"
              value={draft.contact}
              maxLength={CONTACT_MAX}
              placeholder={t('例: Xのアカウント（お返事が要るときだけ）', 'e.g. your X account (only if you want a reply)')}
              autoComplete="off"
              onChange={(e) => set('contact', e.target.value)}
            />
          </label>
          <label className="feedback__check">
            <input type="checkbox" checked={draft.withDevice} onChange={(e) => set('withDevice', e.target.checked)} />
            {t(
              'アプリのバージョンと、使っている端末・ブラウザの種類を添える（不具合を調べるのに使います）',
              'Include the app version and your device and browser type (used to investigate bugs)',
            )}
          </label>
          {/* 人には見えない欄。機械の送信はここも埋めてくるので、入っていたら捨てる */}
          <div className="visually-hidden" aria-hidden="true">
            <label>
              {t('ウェブサイト', 'Website')}
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
              {t('プライバシーポリシー', 'Privacy Policy')}
            </a>
            <button type="submit" className="btn btn--primary" disabled={!ready}>
              {sending ? (
                <>
                  <Spinner />
                  {t('送っています…', 'Sending…')}
                </>
              ) : (
                t('送る', 'Send')
              )}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
