import { lazy, Suspense, useState } from 'react'
import { Loading } from '../../components/Loading'
import { t } from '../../lib/i18n'
import { useHistoryUnseen } from './historySeen'
import { Section } from './Section'

// 開発記録の1枚は CHANGELOG（日本語と英語）を抱えるので、開いたときに読む
const History = lazy(() => import('./History'))

// 設定の「最新情報」。公式の X と、開発記録（これまでの版）と、開発日誌（Zenn の記事）。
// 前は「このアプリ」と「お問い合わせ」の薄い補足の中にあって、見つからなかったので、項目を分けた
// 記事の一覧は代表のものだけを並べ、新しい記事は Zenn のプロフィールからたどってもらう（記事を出すたびにアプリを直さないため）
const X_URL = 'https://x.com/anipairAPP'
const ZENN_PROFILE_URL = 'https://zenn.dev/manato003'
const ARTICLES = [
  {
    // Zenn の記事は日本語で書いたもの（英語の画面では、題の後ろに「(in Japanese)」を足す）
    title: 'Annictの記録をタップで付けて、次に見るアニメを理由つきで提案するWebアプリを作った', // i18n-ok
    url: 'https://zenn.dev/manato003/articles/anipair-annict-anime-app',
  },
  {
    title: '公開APIを使わせてもらう側として、負担をかけないクライアント作りで意識したこと', // i18n-ok
    url: 'https://zenn.dev/manato003/articles/anipair-gentle-api-client',
  },
] as const

export function NewsBlock() {
  return (
    <>
      <Section id="settings-x" title={t('公式X', 'Official X account')} summary={t('最新情報や、Anipairを使うときに役立つことを投稿しています。', 'Posts news and tips for using Anipair.')}>
        <div className="settings__actions">
          <a className="btn" href={X_URL} target="_blank" rel="noreferrer">
            {t('Xで@anipairAPPを見る', 'View @anipairAPP on X')}
          </a>
        </div>
      </Section>
      <HistoryBlock />
      <Section id="settings-devlog" title={t('Anipair開発日誌', 'Anipair dev log')} summary={t('作ったものの仕組みや、作りながら考えたことをZennに書いています。', 'How Anipair works and what I thought about while building it, written on Zenn (in Japanese).')}>
        <ul className="devlog">
          {ARTICLES.map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.title}
                {t('', ' (in Japanese)')}
              </a>
            </li>
          ))}
        </ul>
        <div className="settings__actions">
          <a className="btn" href={ZENN_PROFILE_URL} target="_blank" rel="noreferrer">
            {t('Zennの記事をすべて見る', 'See all articles on Zenn')}
          </a>
        </div>
      </Section>
    </>
  )
}

function HistoryBlock() {
  const [open, setOpen] = useState(false)
  const unseen = useHistoryUnseen()
  return (
    <Section
      id="settings-history"
      title={t('開発記録', 'Development history')}
      summary={t('これまでの版で、何が変わってきたかをまとめています。', 'A look back at what has changed, version by version.')}
      status={
        <span className="history-entry__version">
          {t('いまの版', 'Current version')} {__APP_VERSION__}
          {unseen && <span className="folder__new">{t('新しい版', 'New version')}</span>}
        </span>
      }
    >
      <div className="settings__actions">
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {t('開発記録を見る', 'View development history')}
        </button>
      </div>
      {open && (
        <Suspense fallback={<Loading className="settings__summary" label={t('読み込み中', 'Loading')} />}>
          <History onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </Section>
  )
}
