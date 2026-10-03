import { annictClientId, startLogin } from '../lib/annictLogin'

// Annict のトークンが使えなくなった（401）ときに、画面の上に出す帯。
// ログインのボタンがあるサイトでは、そのまま Annict のログインへ移る。無い環境（ローカルの開発など）では、設定を開いて貼り直してもらう
export function AuthExpiredBanner(props: {
  onOpenSettings: () => void
  onDismiss: () => void
  // 指定が無ければビルドに埋め込まれた client_id を使う
  clientId?: string | null
}) {
  const clientId = props.clientId === undefined ? annictClientId() : props.clientId

  function relogin() {
    if (clientId) startLogin({ clientId, origin: window.location.origin, assign: (url) => window.location.assign(url) })
    else props.onOpenSettings()
  }

  return (
    <div className="auth-banner" role="alert">
      <p className="auth-banner__text">Annict のログインが切れました。もう一度ログインしてください。</p>
      <div className="auth-banner__actions">
        <button type="button" className="btn btn--primary" onClick={relogin}>
          もう一度ログイン
        </button>
        <button type="button" className="link" onClick={props.onDismiss}>
          閉じる
        </button>
      </div>
    </div>
  )
}
