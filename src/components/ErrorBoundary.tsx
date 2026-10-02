import { Component, type ReactNode } from 'react'
import { clearAll } from '../lib/storage'

// App の外側に置く。保存データが原因の白画面から、利用者が自力で抜けられるようにする
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <p className="crash__title">画面を表示できませんでした</p>
        <p className="crash__body">{this.state.error.message}</p>
        <button type="button" className="btn" onClick={() => location.reload()}>
          再読み込み
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            clearAll()
            location.reload()
          }}
        >
          この端末の保存データを消して再読み込み
        </button>
        <p className="crash__note">Annict に保存した記録は消えません。消えるのはトークンと進み具合だけです。</p>
      </div>
    )
  }
}
