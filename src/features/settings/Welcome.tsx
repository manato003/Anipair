import { fetchViewer } from '../../lib/annict'
import { Logo } from '../../components/Logo'
import { WatchingScene } from '../../components/Mascot'
import { startLogin } from '../../lib/annictLogin'
import { TAGLINE_PHRASES } from '../../lib/brand'
import { AboutBlock } from './AboutBlock'
import { TokenForm } from './TokenForm'
import { Spinner } from '../../components/Loading'

async function verifyAnnictToken(token: string): Promise<string> {
  const v = await fetchViewer(token)
  return `${v.name}（@${v.username}）で連携しました`
}

// ログインする前の最初の画面
// loggedOut: この端末でログアウトしたあと。「Annictでログイン」は、ブラウザで Annict にログインしているアカウントでそのまま入るので、
// 別のアカウントに替えたい人に入り方を添える（Anipair からは Annict のログインを見られも消せもしないので、状態は言わずに手順だけ。2026-10-13 利用者）
export function Welcome(props: {
  clientId: string | null
  busy: boolean
  error: string | null
  loggedOut?: boolean
  onAnnictTokenChange: (token: string | null) => void
}) {
  // 開発者向け: 個人用アクセストークン（ログインのボタンが無いときは、最初から開いておく）
  const devToken = (
    <details className="settings__dev" open={!props.clientId}>
      <summary>開発者向け: 個人用アクセストークンで使う</summary>
      <p className="settings__lead">
        Annictの
        <a href="https://annict.com/settings/apps" target="_blank" rel="noreferrer">
          アプリケーション設定
        </a>
        で、スコープを「読み込み + 書き込み」にして個人用アクセストークンを作成し、下の欄に貼り付けてください。
      </p>
      <TokenForm
        label="Annictの個人用アクセストークン"
        verify={verifyAnnictToken}
        save={(t) => props.onAnnictTokenChange(t)}
      />
    </details>
  )
  return (
    <div className="settings__block welcome">
      <h1 className="welcome__logo">
        <Logo size="large" />
      </h1>
      <WatchingScene className="scene-art welcome__art" />
      <p className="welcome__tagline">
        {TAGLINE_PHRASES.map((phrase) => (
          <span key={phrase}>{phrase}</span>
        ))}
      </p>
      <p className="settings__lead">Annictの視聴記録を、タップだけで付けられるアプリです。見たアニメを評価していくと、好みに合う作品を提案します。</p>
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
              ログインしています…
            </>
          ) : (
            'Annictでログイン'
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
          アカウントをお持ちでない方は、
          <a href="https://annict.com/sign_up" target="_blank" rel="noreferrer">
            Annictで新規登録
          </a>
          してください。
        </li>
        {props.clientId && props.loggedOut && (
          <li>
            別のアカウントで連携するときは、先にAnnictのサイトでそのアカウントにログインしてください。
            {/* 同じ画面のまま開く（ホーム画面に置いたアプリは Safari と別にログインを持つので、新しいタブだとアプリの中のログインを替えられない） */}
            <a href="https://annict.com/">Annictを開く</a>
          </li>
        )}
      </ul>
      {/* アプリの説明・規約・開発者向けは、開いたときだけ */}
      <details className="welcome__about">
        <summary>このアプリについて</summary>
        <AboutBlock showTagline={false} welcome />
        {props.clientId && devToken}
      </details>
      {/* ログインのボタンが無いとき（ローカルの開発など）は、トークンの欄を最初から開いて外に出す */}
      {!props.clientId && devToken}
    </div>
  )
}
