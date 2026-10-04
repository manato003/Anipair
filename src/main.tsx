import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'
import { applyEffectLevel, loadEffectLevel } from './lib/storage'

// 設定の「演出」の強さを、描く前に反映する
applyEffectLevel(loadEffectLevel())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
