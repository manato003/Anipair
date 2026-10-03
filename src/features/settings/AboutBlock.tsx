import { useState } from 'react'
import { UsageGuide } from '../../components/UsageGuide'
import { TAGLINE } from '../../lib/brand'
import { saveOnboardingSeen } from '../../lib/storage'
import { LegalLinks } from './LegalLinks'
import { Section } from './Section'

// 設定の末尾。何のアプリで、何が外に出て、何が出ないか。要点だけ出して、通信先・画像・あらすじの細かい説明は畳む
export function AboutBlock() {
  // 初めての人に出す使い方のシートを、ここからいつでも見直せる
  const [guideOpen, setGuideOpen] = useState(false)
  return (
    <Section id="settings-about" title="このアプリについて">
      <p className="settings__lead">{TAGLINE}</p>
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
        <li>Anipair は、Annict の非公式の個人開発アプリです。Annict とは関係がありません。</li>
        <li>運営のサーバーはありません。ログインの受け渡しと Shikimori への中継をする関数があるだけで、利用者の情報は何も保存しません。</li>
        <li>トークンはこの端末の中にだけ保存します。</li>
        <li>
          作品データの一部（ジャンル・似た作品・一部の表紙）:{' '}
          <a href="https://shikimori.io/" target="_blank" rel="noreferrer">
            Shikimori
          </a>
        </li>
      </ul>
      <details className="settings__fold">
        <summary>通信先・画像・あらすじについて</summary>
        <ul className="settings__list settings__lead">
          <li>通信先は Annict と、作品データの Shikimori（このサイトの中継を通します）です。GitHub とつないだ場合だけ、GitHub にも送ります。</li>
          <li>表紙の画像は Annict の画像（各作品の公式サイトのもの）と Shikimori のポスターを表示しています。権利は各権利者にあります。</li>
          <li>作品の詳細に出すあらすじは Annict の作品ページから読み、引用元を付けて表示しています。</li>
        </ul>
      </details>
      <p className="settings__lead settings__about-foot">
        <a href="https://github.com/manato003/anipair" target="_blank" rel="noreferrer">
          ソースコード（GitHub）
        </a>
        <span className="settings__version">版 {__APP_VERSION__}</span>
      </p>
      <LegalLinks className="settings__about-foot" />
    </Section>
  )
}
