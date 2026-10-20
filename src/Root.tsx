import { useEffect } from 'react'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { WelcomePreview } from './features/settings/WelcomePreview'
import { useLang } from './lib/i18n'
import { isWelcomePreview } from './lib/welcomePreview'

// 言語（lib/i18n.ts）。替えたらアプリ全体を描き直す（文言は t() が呼んだときの言語で返すので、描き直せばすべて替わる）
export function Root() {
  const lang = useLang()
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  // preview と手元で ?welcome を付けたときは、ログイン前の最初の画面だけを出す（features/settings/WelcomePreview.tsx）
  return <ErrorBoundary key={lang}>{isWelcomePreview(window.location) ? <WelcomePreview /> : <App />}</ErrorBoundary>
}

