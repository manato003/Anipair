import { annictClientId } from '../../lib/annictLogin'
import { Landing } from '../landing/Landing'

// ログインしたままでも、ログイン前の紹介ページだけを出す（?welcome。条件は lib/welcomePreview.ts）。
// アプリの本体（App）は動かさないので、ログインや端末の記録には触れない
export function WelcomePreview() {
  return (
    <div className="app" data-page="settings">
      <main className="app__main">
        {/* ログインのボタンは本物（押すと Annict でログインし直して、アプリに戻る）。トークンの欄は保存しない */}
        <Landing clientId={annictClientId()} busy={false} error={null} onAnnictTokenChange={() => {}} />
      </main>
    </div>
  )
}
