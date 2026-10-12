import { useState } from 'react'
import { UsageGuide } from '../../components/UsageGuide'
import { MascotProfile } from './MascotProfile'
import { TAGLINE } from '../../lib/brand'
import { saveOnboardingSeen } from '../../lib/storage'
import { LegalLinks } from './LegalLinks'
import { Section } from './Section'

// 設定の先頭（ログイン前の最初の画面では末尾）。何のアプリで、何が外に出て、何が出ないか。要点だけ出して、通信先・画像の細かい説明は畳む
// showTagline: ログイン前の最初の画面では、すぐ上にキャッチコピーがあるので出さない。
// welcome: ログイン前の最初の画面。「このアプリについて」を開いた中に置くので、見出しを付けない（Welcome.tsx）
export function AboutBlock({ showTagline = true, welcome = false }: { showTagline?: boolean; welcome?: boolean }) {
  // 初めての人に出す使い方のシートを、ここからいつでも見直せる
  const [guideOpen, setGuideOpen] = useState(false)
  const [mascotOpen, setMascotOpen] = useState(false)
  const body = (
    <>
      {showTagline && <p className="settings__lead">{TAGLINE}</p>}
      <p className="settings__about-foot">
        <button type="button" className="link" onClick={() => setGuideOpen(true)}>
          使い方を見る
        </button>
        <button type="button" className="link" onClick={() => setMascotOpen(true)}>
          アニとペアのこと
        </button>
      </p>
      {mascotOpen && <MascotProfile onClose={() => setMascotOpen(false)} />}
      {guideOpen && (
        <UsageGuide
          onClose={() => {
            // 設定から開いたときも、閉じれば「見た」ことにする（評価の画面で、もう一度出さない）
            saveOnboardingSeen(true)
            setGuideOpen(false)
          }}
        />
      )}
      {/* 要点は3つの短い文に。細かいこと（サーバーの処理・通信先・画像・権利）は畳む（#30: 6つの長い箇条書きだった） */}
      <ul className="settings__list settings__lead">
        <li>個人が開発した、Annictの非公式アプリです。Annictの運営とは関係ありません。</li>
        <li>運営サーバーに、利用者の記録は置きません。トークンはこの端末の中だけにあります。</li>
        <li>どの画面がどれくらい開かれたかだけを、Vercel Web Analyticsで数えています（Cookieなし）。</li>
      </ul>
      <details className="settings__fold">
        <summary>データの行き先と権利について</summary>
        <ul className="settings__list settings__lead">
          <li>サーバーで動くのは、ログインの受け渡し・Shikimoriへの中継・問い合わせの受け付けの3つの処理だけです。問い合わせの内容は、送ったときだけ開発者に届きます（公開はされません）。</li>
          <li>
            作品データの一部（ジャンル・似た作品・一部の表紙・声優やスタッフの参加作品）は
            <a href="https://shikimori.io/" target="_blank" rel="noreferrer">
              Shikimori
            </a>
            から取得しています。
          </li>
          <li>通信先はAnnict・Shikimori・Wikipedia・Google Fontsです。Shikimoriの作品データは、上に書いたサーバーの処理（Vercel）を通して受け取ります。GitHubと連携した場合は、GitHubにも送信します。問い合わせを送ったときは、その内容だけが、このサイトの関数を通して運営者の非公開のGitHubリポジトリに届きます。開いた画面の集計のために、画面の名前・参照元・国や地域・端末とブラウザの種類をVercel Web Analyticsに送ります。</li>
          <li>作品の詳細のあらすじは、Wikipediaの記事の冒頭を、出典とライセンス（CC BY-SA 4.0）を添えて表示しています。</li>
          <li>表紙には、Shikimoriのポスターと、AnnictのAPIが返す各作品の公式サイトの画像を表示しています。画像はブラウザが提供元から直接読み込みます。権利は各権利者に帰属します。</li>
          <li>ソースコードはMITライセンスで公開しています。Anipairの名前とロゴ、アニとペア（絵・名前・設定）の著作権は運営者が保持しています。</li>
        </ul>
      </details>
      <p className="settings__lead settings__about-foot">
        <a href="https://github.com/manato003/anipair" target="_blank" rel="noreferrer">
          ソースコード（GitHub）
        </a>
        <span className="settings__version">バージョン {__APP_VERSION__}</span>
      </p>
      <LegalLinks className="settings__about-foot" />
    </>
  )
  if (welcome) return <div id="settings-about">{body}</div>
  return (
    <Section id="settings-about" title="このアプリについて">
      {body}
    </Section>
  )
}
