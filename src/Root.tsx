import { lazy, Suspense, useEffect } from 'react'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WelcomePreview } from './features/settings/WelcomePreview'
import { sharedIdOf } from './features/tier/tierShare'
import { useLang } from './lib/i18n'
import { isWelcomePreview } from './lib/welcomePreview'

// 共有のリンク（/t/<ID>）で開いた Tier表。アプリの本体とは別に、見るだけの画面を出す（読むのはそのときだけ）
const SharedTierPage = lazy(() => import('./features/tier/SharedTierPage').then((m) => ({ default: m.SharedTierPage })))

// 言語（lib/i18n.ts）。替えたらアプリ全体を描き直す（文言は t() が呼んだときの言語で返すので、描き直せばすべて替わる）
export function Root() {
  const lang = useLang()
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  // preview と手元で ?welcome を付けたときは、ログイン前の最初の画面だけを出す（features/settings/WelcomePreview.tsx）
  const sharedId = sharedIdOf(window.location.pathname)
  if (sharedId) {
    return (
      <ErrorBoundary key={lang}>
        <Suspense fallback={null}>
          <SharedTierPage id={sharedId} />
        </Suspense>
      </ErrorBoundary>
    )
  }
  return <ErrorBoundary key={lang}>{isWelcomePreview(window.location) ? <WelcomePreview /> : <App />}</ErrorBoundary>
}

