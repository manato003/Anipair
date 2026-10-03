import { fetchViewer } from '../../lib/annict'
import { Logo } from '../../components/Logo'
import { startLogin } from '../../lib/annictLogin'
import { TAGLINE_PHRASES } from '../../lib/brand'
import { saveAnnictToken } from '../../lib/storage'
import { LegalLinks } from './LegalLinks'
import { TokenForm } from './TokenForm'

async function verifyAnnictToken(token: string): Promise<string> {
  const v = await fetchViewer(token)
  return `${v.name}（@${v.username}）で連携しました`
}

// ログインする前の最初の画面
export function Welcome(props: { clientId: string | null; busy: boolean; error: string | null; onAnnictTokenChange: (token: string | null) => void }) {
  return (
    <div className="settings__block">
      <h1 className="welcome__logo">
        <Logo size="large" />
      </h1>
      <p className="welcome__tagline">
        {TAGLINE_PHRASES.map((phrase) => (
          <span key={phrase}>{phrase}</span>
        ))}
      </p>
      <p className="settings__lead">Annict の視聴記録を、タップだけで付けられるアプリです。見たアニメを評価していくと、好みに合う作品を提案します。</p>
      {props.clientId && (
        <button
          type="button"
          className="btn btn--primary settings__login"
          disabled={props.busy}
          onClick={() => startLogin({ clientId: props.clientId!, origin: window.location.origin, assign: (url) => window.location.assign(url) })}
        >
          {props.busy ? 'ログインしています…' : 'Annict でログイン'}
        </button>
      )}
      {props.error && (
        <p className="settings__error" role="alert">
          {props.error}
        </p>
      )}
      <p className="settings__lead settings__need">
        ご利用には Annict のアカウントが必要です。お持ちでない方は、
        <a href="https://annict.com/sign_up" target="_blank" rel="noreferrer">
          Annict で新規登録
        </a>
        してください。
      </p>
      <LegalLinks className="settings__legal" />
      {/* ログインのボタンが無いとき（ローカルの開発など）は、最初から開いておく */}
      <details className="settings__dev" open={!props.clientId}>
        <summary>開発者向け: 個人用アクセストークンで使う</summary>
        <p className="settings__lead">
          Annict の
          <a href="https://annict.com/settings/apps" target="_blank" rel="noreferrer">
            アプリケーション設定
          </a>
          で、スコープを「読み込み + 書き込み」にして個人用アクセストークンを作成し、下の欄に貼り付けてください。
        </p>
        <TokenForm
          label="Annict の個人用アクセストークン"
          verify={verifyAnnictToken}
          save={(t) => {
            saveAnnictToken(t)
            props.onAnnictTokenChange(t)
          }}
        />
      </details>
    </div>
  )
}
