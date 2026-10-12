import { useState } from 'react'
import { FAQ } from '../../components/faq'
import { FeedbackSheet } from '../../components/FeedbackSheet'
import { Section } from './Section'

// 設定の「お問い合わせ」。送る入口を先に、よくある質問をその下に置く（ヘルプの「文章で詳しく読む」と同じ質問）。
// 前は「このアプリについて」の中のリンクだけで、見つけにくかった（2026-10-11 利用者）
export function ContactBlock() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Section
        id="settings-contact"
        title="質問・不具合・要望を送る"
        summary="送った内容は開発者だけが読みます（公開されません）。"
      >
        <div className="settings__actions">
          <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
            質問・不具合・要望を送る
          </button>
          {/* X の DM でも受け付ける。補足の薄い文字だと見つからなかったので、送るボタンと並べる（#30。2026-10-13 利用者） */}
          <a className="btn" href="https://x.com/anipairAPP" target="_blank" rel="noreferrer">
            XのDMで送る
          </a>
        </div>
        <p className="settings__hint">
          <a href="https://github.com/manato003/anipair/issues" target="_blank" rel="noreferrer">
            GitHubのIssues
          </a>
          でも受け付けています（公開されます）。
        </p>
        {open && <FeedbackSheet onClose={() => setOpen(false)} />}
      </Section>
      <Section id="settings-faq" title="よくある質問">
        {FAQ.map(([q, a]) => (
          <details key={q} className="help__more">
            <summary>{q}</summary>
            <p className="help__answer">{a}</p>
          </details>
        ))}
      </Section>
    </>
  )
}
