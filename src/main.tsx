import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { applyButtonLabels, applyEffectLevel, loadButtonLabels, loadEffectLevel } from './lib/storage'
import { startTheme } from './lib/theme'

// 画面の色（テーマ）、設定の「演出」の強さと「ボタンの表示」を、描く前に反映する
startTheme()
applyEffectLevel(loadEffectLevel())
applyButtonLabels(loadButtonLabels())

// 流した位置は画面ごとにアプリが覚えて戻す（lib/pageScroll.ts）。シートを「戻る」で閉じたときに、ブラウザが位置を動かさないようにする
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

// 後から読む画面の JS が読めなかったら（開いたままのタブが、デプロイで消えた古いファイルを読みに行った）、ページを読み直して新しい版にする。
// 読み直しても失敗するとき（通信が切れているなど）に繰り返さないよう、1分に1回まで
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try {
    last = Number(sessionStorage.getItem('animax.reloadedForChunk')) || 0
  } catch {
    // 保存できない環境では、読み直しを1回に限れないので、そのままエラーにする
    return
  }
  if (Date.now() - last < 60_000) return
  event.preventDefault()
  try {
    sessionStorage.setItem('animax.reloadedForChunk', String(Date.now()))
  } catch {
    return
  }
  window.location.reload()
})

// 書体の CSS を当てる（index.html では先読みだけにして、最初の描画を止めないようにしている）
for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="style"]')) link.rel = 'stylesheet'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
