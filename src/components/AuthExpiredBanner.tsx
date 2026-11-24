import { annictClientId, startLogin } from '../lib/annictLogin'
import { t } from '../lib/i18n'
import { useNotice } from '../lib/notices'

// Annict のトークンが使えなくなった（401）ときに、画面の上に出す帯。
// このとき端末の Annict の記録の写しは消してある（storage.ts の forgetRevokedAnnict。連携の解除とみなす。Issue #40）ので、そのことも伝える。
// ログインのボタンがあるサイトでは、そのまま Annict のログインへ移る。無い環境（ローカルの開発など）では、設定を開いて貼り直してもらう
export function AuthExpiredBanner(props: {
  onOpenSettings: () => void
  onDismiss: () => void
  // 指定が無ければビルドに埋め込まれた client_id を使う
  clientId?: string | null
}) {
  const clientId = props.clientId === undefined ? annictClientId() : props.clientId
  useNotice({
    id: 'auth',
    title: t('Annictのログインが切れました', 'Your Annict login has expired'),
    body: t('Annictとの連携が解除されたか、トークンが使えなくなりました。この端末に控えていたAnnictの記録は削除しました。もう一度ログインすると、Annictから読み直して記録を続けられます。', 'Anipair was disconnected from Annict, or the token stopped working. The copy of your Annict records on this device was deleted. Log in again to load them from Annict and keep recording.'),
    action: { label: t('ログインし直す', 'Log in again'), run: relogin },
    urgent: true,
  })

  function relogin() {
    if (clientId) startLogin({ clientId, origin: window.location.origin, assign: (url) => window.location.assign(url) })
    else props.onOpenSettings()
  }

  return (
    <div className="auth-banner" role="alert">
      <p className="auth-banner__text">{t('Annictのログインが切れました。この端末に控えていたAnnictの記録は削除しました。もう一度ログインしてください。', 'Your Annict login has expired. The copy of your Annict records on this device was deleted. Please log in again.')}</p>
      <div className="auth-banner__actions">
        <button type="button" className="btn btn--primary" onClick={relogin}>
          {t('もう一度ログイン', 'Log in again')}
        </button>
        <button type="button" className="link" onClick={props.onDismiss}>
          {t('閉じる', 'Close')}
        </button>
      </div>
    </div>
  )
}
