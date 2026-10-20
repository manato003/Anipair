import { annictClientId } from '../../lib/annictLogin'
import { Welcome } from './Welcome'

// ログインしたままでも、ログイン前の最初の画面だけを出す（?welcome。条件は lib/welcomePreview.ts）。
// アプリの本体（App）は動かさないので、ログインや端末の記録には触れない
export function WelcomePreview() {
  return (
    <div className="app">
      <main className="app__main">
        <section className="settings settings--welcome">
          {/* ログインのボタンは本物（押すと Annict でログインし直して、アプリに戻る）。トークンの欄は保存しない */}
          <Welcome clientId={annictClientId()} busy={false} error={null} onAnnictTokenChange={() => {}} />
        </section>
      </main>
    </div>
  )
}
