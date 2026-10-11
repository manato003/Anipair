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
        summary="GitHub のアカウントは要りません。送った内容は開発者だけが読み、公開はされません。"
      >
        <div className="settings__actions">
          <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
            質問・不具合・要望を送る
          </button>
        </div>
        <p className="settings__lead">
          GitHub を使う方は、
          <a href="https://github.com/manato003/anipair/issues" target="_blank" rel="noreferrer">
            公開リポジトリの Issues
          </a>
          からも送れます（こちらは公開されます）。
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
