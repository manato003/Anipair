import { useState } from 'react'
import { UsageGuide } from '../../components/UsageGuide'
import { TAGLINE } from '../../lib/brand'
import { saveOnboardingSeen } from '../../lib/storage'
import { LegalLinks } from './LegalLinks'
import { Section } from './Section'

// 設定の末尾。何のアプリで、何が外に出て、何が出ないか。要点だけ出して、通信先・画像の細かい説明は畳む
// showTagline: ログイン前の最初の画面では、すぐ上にキャッチコピーがあるので出さない
export function AboutBlock({ showTagline = true }: { showTagline?: boolean }) {
  // 初めての人に出す使い方のシートを、ここからいつでも見直せる
  const [guideOpen, setGuideOpen] = useState(false)
  return (
    <Section id="settings-about" title="このアプリについて">
      {showTagline && <p className="settings__lead">{TAGLINE}</p>}
      <p className="settings__about-foot">
        <button type="button" className="link" onClick={() => setGuideOpen(true)}>
          使い方を見る
        </button>
      </p>
      {guideOpen && (
        <UsageGuide
          onClose={() => {
            // 設定から開いたときも、閉じれば「見た」ことにする（評価の画面で、もう一度出さない）
            saveOnboardingSeen(true)
            setGuideOpen(false)
          }}
        />
      )}
      <ul className="settings__list settings__lead">
        <li>Anipair は個人が開発した Annict の非公式アプリで、Annict の運営とは関係ありません。</li>
        <li>運営サーバーはなく、利用者の情報は保存しません。サーバーで動くのは、ログインの受け渡しと Shikimori への中継の2つの処理だけです。</li>
        <li>トークンは、この端末の中にだけ保存されます。</li>
        <li>
          作品データの一部（ジャンル・似た作品・一部の表紙）は{' '}
          <a href="https://shikimori.io/" target="_blank" rel="noreferrer">
            Shikimori
          </a>{' '}
          から取得しています。
        </li>
      </ul>
      <details className="settings__fold">
        <summary>通信先・画像について</summary>
        <ul className="settings__list settings__lead">
          <li>通信先は Annict と Shikimori（このサイトの中継を経由）と Wikipedia です。GitHub と連携した場合は、GitHub にも送信します。</li>
          <li>作品の詳細のあらすじは、Wikipedia の記事の冒頭を、出典とライセンス（CC BY-SA 4.0）を添えて表示しています。</li>
          <li>表紙には、Shikimori のポスターと、Annict の API が返す各作品の公式サイトの画像を表示しています。権利は各権利者に帰属します。</li>
        </ul>
      </details>
      <p className="settings__lead settings__about-foot">
        <a href="https://github.com/manato003/anipair" target="_blank" rel="noreferrer">
          ソースコード（GitHub）
        </a>
        <span className="settings__version">バージョン {__APP_VERSION__}</span>
      </p>
      <LegalLinks className="settings__about-foot" />
    </Section>
  )
}
