import { Component, Fragment, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { clearAll } from '../lib/storage'
import { Empty } from './Empty'

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
        <p className="crash__title">{t('画面を表示できませんでした', 'Couldn’t display the screen')}</p>
        <p className="crash__body">{this.state.error.message}</p>
        <button type="button" className="btn" onClick={() => location.reload()}>
          {t('再読み込み', 'Reload')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            clearAll()
            location.reload()
          }}
        >
          {t('この端末の保存データを消して再読み込み', 'Clear data saved on this device and reload')}
        </button>
        <p className="crash__note">{t('Annictに保存した記録は消えません。消えるのはトークンと進み具合だけです。', 'Records saved on Annict won’t be deleted. Only the token and your progress on this device are cleared.')}</p>
      </div>
    )
  }
}

// 新しい版を公開したあと、開いたままの古いページが、もう無い画面のファイルを読もうとして失敗したときの文言（ブラウザごとに違う）
const STALE_BUILD = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

// 画面（評価・マッチング・記録・ブラウズ・設定）ごとに置く。1つの画面の描画で落ちても、下の帯でほかの画面へ移って使い続けられる。
// 「開き直す」はその画面だけを作り直す。画面のファイルを読めなかった（新しい版が出た）ときは、再読み込みだけを勧める
export class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
    if (STALE_BUILD.test(error.message)) {
      return (
        <div className="crash crash--screen" role="alert">
          <Empty mood="trouble" title={t('アプリが新しくなりました', 'The app has been updated')}
            body={t('この画面を開くには、再読み込みしてください。ほかの画面は、下の帯からそのまま使えます。', 'Reload to open this screen. You can keep using the other screens from the bar below.')}>
            <div className="crash__actions">
              <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
                {t('再読み込み', 'Reload')}
              </button>
            </div>
          </Empty>
        </div>
      )
    }
    return (
      <div className="crash crash--screen" role="alert">
        <Empty mood="trouble" title={t('この画面を表示できませんでした', 'Couldn’t display this screen')}
          body={t('ほかの画面は、下の帯からそのまま使えます。', 'You can keep using the other screens from the bar below.')}>
          <p className="crash__body">{error.message}</p>
          <div className="crash__actions">
            <button type="button" className="btn btn--primary" onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}>
              {t('この画面を開き直す', 'Reopen this screen')}
            </button>
            <button type="button" className="btn" onClick={() => location.reload()}>
              {t('再読み込み', 'Reload')}
            </button>
          </div>
        </Empty>
      </div>
    )
  }
}
