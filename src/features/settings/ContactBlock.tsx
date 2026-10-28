import { useState } from 'react'
import { FAQ } from '../../components/faq'
import { FeedbackSheet } from '../../components/FeedbackSheet'
import { t } from '../../lib/i18n'
import { Section } from './Section'

// 設定の「お問い合わせ」。送る入口を先に、よくある質問をその下に置く（ヘルプの「文章で詳しく読む」と同じ質問）。
// 前は「このアプリについて」の中のリンクだけで、見つけにくかった
export function ContactBlock() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Section
        id="settings-contact"
        title={t('質問・不具合・要望を送る', 'Send feedback')}
        summary={t('送った内容は開発者だけが読みます（公開されません）。', 'Only the developer reads what you send (it isn’t made public).')}
      >
        <div className="settings__actions">
          <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
            {t('質問・不具合・要望を送る', 'Send feedback')}
          </button>
          {/* X の DM でも受け付ける。補足の薄い文字だと見つからなかったので、送るボタンと並べる */}
          <a className="btn" href="https://x.com/anipairAPP" target="_blank" rel="noreferrer">
            {t('XのDMで送る', 'Send via X DM')}
          </a>
        </div>
        <p className="settings__hint">
          <a href="https://github.com/manato003/Anipair/issues" target="_blank" rel="noreferrer">
            {t('GitHubのIssues', 'GitHub Issues')}
          </a>
          {t('でも受け付けています（公開されます）。', ' also works (these are public).')}
        </p>
        {open && <FeedbackSheet onClose={() => setOpen(false)} />}
      </Section>
      <Section id="settings-faq" title={t('よくある質問', 'FAQ')}>
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
