import { Fragment } from 'react'
import { fetchViewer } from '../../lib/annict'
import { Logo } from '../../components/Logo'
import { WatchingScene } from '../../components/Mascot'
import { startLogin } from '../../lib/annictLogin'
import { TAGLINE_PHRASES, TAGLINE_PHRASES_EN } from '../../lib/brand'
import { getLang, t } from '../../lib/i18n'
import { LangToggle } from '../../components/LangToggle'
import { AboutBlock } from './AboutBlock'
import { TokenForm } from './TokenForm'
import { Spinner } from '../../components/Loading'

async function verifyAnnictToken(token: string): Promise<string> {
  const v = await fetchViewer(token)
  return t(`${v.name}（@${v.username}）で連携しました`, `Connected as ${v.name} (@${v.username})`)
}

// ログインする前の最初の画面
// 右上の「EN／あ」で言語を切り替える（ほかの画面では、右上の並びにある同じボタン。components/LangToggle.tsx）
// loggedOut: この端末でログアウトしたあと。「Annictでログイン」は、ブラウザで Annict にログインしているアカウントでそのまま入るので、
// 別のアカウントに替えたい人に入り方を添える（Anipair からは Annict のログインを見られも消せもしないので、状態は言わずに手順だけ。2026-10-13 利用者）
export function Welcome(props: {
  clientId: string | null
  busy: boolean
  error: string | null
  loggedOut?: boolean
  onAnnictTokenChange: (token: string | null) => void
}) {
  const en = getLang() === 'en'
  // 開発者向け: 個人用アクセストークン（ログインのボタンが無いときは、最初から開いておく）
  const devToken = (
    <details className="settings__dev" open={!props.clientId}>
      <summary>{t('開発者向け: 個人用アクセストークンで使う', 'For developers: use a personal access token')}</summary>
      <p className="settings__lead">
        {t('Annictの', 'In Annict’s ')}
        <a href="https://annict.com/settings/apps" target="_blank" rel="noreferrer">
          {t('アプリケーション設定', 'application settings')}
        </a>
        {t(
          'で、スコープを「読み込み + 書き込み」にして個人用アクセストークンを作成し、下の欄に貼り付けてください。',
          ', create a personal access token with the “Read + Write” scope, and paste it below.',
        )}
        {/* Annict の API利用規約 第4条（2026-11-25 施行）: トークンでできることと、他人に教えないことを説明する */}
        {t(
          'このトークンがあると、あなたのAnnictの記録を読んだり、記録や感想を付けたりできます。ほかの人には教えないでください。',
          ' This token can read your Annict records and add records and reviews. Don’t share it with anyone.',
        )}
      </p>
      <TokenForm
        label={t('Annictの個人用アクセストークン', 'Annict personal access token')}
        verify={verifyAnnictToken}
        save={(token) => props.onAnnictTokenChange(token)}
      />
    </details>
  )
  const tagline = en ? TAGLINE_PHRASES_EN : TAGLINE_PHRASES
  return (
    <div className="settings__block welcome">
      <LangToggle className="welcome__lang" />
      <h1 className="welcome__logo">
        <Logo size="large" />
      </h1>
      <WatchingScene className="scene-art welcome__art" />
      <p className="welcome__tagline">
        {tagline.map((phrase, i) => (
          <Fragment key={phrase}>
            {/* 英語は語のあいだに空白が要る（日本語の句は詰めて並べる） */}
            {en && i > 0 && ' '}
            <span>{phrase}</span>
          </Fragment>
        ))}
      </p>
      <p className="settings__lead">
        {t(
          'Annictの視聴記録を、タップだけで付けられるアプリです。見たアニメを評価していくと、好みに合う作品を提案します。',
          'Anipair lets you log your anime on Annict with just a tap. Rate the anime you’ve watched, and it suggests new ones that match your taste.',
        )}
      </p>
      {/* 英語のとき: 作品名はローマ字の題名で出し、作品のデータの一部は日本語のままであることを、ログインの前に伝える */}
      {en && <p className="settings__lead welcome__lang-note">Anime titles are shown in romanized Japanese. Some details, like episode titles and synopses, stay in Japanese.</p>}
      {props.clientId && (
        <button
          type="button"
          className="btn btn--primary settings__login"
          disabled={props.busy}
          onClick={() => startLogin({ clientId: props.clientId!, origin: window.location.origin, assign: (url) => window.location.assign(url) })}
        >
          {props.busy ? (
            <>
              <Spinner />
              {t('ログインしています…', 'Logging in…')}
            </>
          ) : (
            t('Annictでログイン', 'Log in with Annict')
          )}
        </button>
      )}
      {props.error && (
        <p className="settings__error" role="alert">
          {props.error}
        </p>
      )}
      {/* ボタンの下の補足は小さく、1つずつ「・」で分ける。多くの人に関わる新規登録を先に（別のアカウントは少数）。
          主役はキャッチコピーとログインのボタン（2026-10-13 利用者「できるだけシンプルに」） */}
      <ul className="welcome__notes">
        <li>
          {t('アカウントをお持ちでない方は、', 'Anipair uses your Annict account, an anime tracking service from Japan. If you don’t have one, ')}
          <a href="https://annict.com/sign_up" target="_blank" rel="noreferrer">
            {t('Annictで新規登録', 'sign up on Annict')}
          </a>
          {t('してください。', '.')}
        </li>
        {props.clientId && props.loggedOut && (
          <li>
            {t(
              '別のアカウントで連携するときは、先にAnnictのサイトでそのアカウントにログインしてください。',
              'To connect a different account, first log in to that account on the Annict website. ',
            )}
            {/* 同じ画面のまま開く（ホーム画面に置いたアプリは Safari と別にログインを持つので、新しいタブだとアプリの中のログインを替えられない） */}
            <a href="https://annict.com/">{t('Annictを開く', 'Open Annict')}</a>
          </li>
        )}
      </ul>
      {/* アプリの説明・規約・開発者向けは、開いたときだけ */}
      <details className="welcome__about">
        <summary>{t('このアプリについて', 'About this app')}</summary>
        <AboutBlock showTagline={false} welcome />
        {props.clientId && devToken}
      </details>
      {/* ログインのボタンが無いとき（ローカルの開発など）は、トークンの欄を最初から開いて外に出す */}
      {!props.clientId && devToken}
    </div>
  )
}
