import { useState } from 'react'
import { UsageGuide } from '../../components/UsageGuide'
import { MascotProfile } from './MascotProfile'
import { TAGLINE } from '../../lib/brand'
import { saveOnboardingSeen } from '../../lib/storage'
import { LegalLinks } from './LegalLinks'
import { Section } from './Section'
import { t } from '../../lib/i18n'

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
          {t('使い方を見る', 'How to use')}
        </button>
        <button type="button" className="link" onClick={() => setMascotOpen(true)}>
          {t('アニとペアのこと', 'About Ani & Pair')}
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
      {/* 要点は3つの短い文に。細かいこと（サーバーの処理・通信先・画像・権利）は畳む（前は6つの長い箇条書きだった） */}
      <ul className="settings__list settings__lead">
        <li>{t('個人が開発した、Annictの非公式アプリです。Annictの運営とは関係ありません。', 'Anipair is an unofficial Annict app made by an individual developer. It is not affiliated with Annict.')}</li>
        <li>
          {t(
            '運営サーバーに、利用者の記録やトークンは置きません。トークンはこの端末のブラウザに保存します。',
            'Your records and token are not stored on Anipair’s server. Your token is saved in this device’s browser.',
          )}
        </li>
        <li>
          {t(
            'どの画面がどれくらい開かれたかだけを、Vercel Web Analyticsで数えています（Cookieなし）。',
            'Only which screens are opened, and how often, is counted with Vercel Web Analytics (no cookies).',
          )}
        </li>
      </ul>
      <details className="settings__fold">
        <summary>{t('データの行き先と権利について', 'Where your data goes, and rights')}</summary>
        <ul className="settings__list settings__lead">
          <li>
            {t(
              'サーバーで動くのは、ログインの受け渡し・Shikimoriへの中継・問い合わせの受け付け・Tier表の共有のリンクの4つの処理だけです。問い合わせの内容は送ったときだけ開発者に届きます（公開はされません）。Tier表をリンクで共有したときは、表の題名・段の名前・作品のIDと並びだけを置きます（Annictの名前やトークンは送りません。作った人が消せます）。',
              'The server runs only four things: completing the login, relaying requests to Shikimori, receiving feedback, and Tier list share links. Feedback reaches the developer only when you send it (it is not made public). When you share a Tier list as a link, only the list title, tier names, and the anime IDs and their order are stored (your Annict name and token are not sent, and the creator can delete it).',
            )}
          </li>
          <li>
            {t('作品データの一部（ジャンル・似た作品・一部の表紙・声優やスタッフの参加作品）は', 'Some anime data (genres, similar anime, some covers, and the other works of voice actors and staff) comes from ')}
            <a href="https://shikimori.io/" target="_blank" rel="noreferrer">
              Shikimori
            </a>
            {t('から取得しています。', '.')}
          </li>
          <li>
            {t(
              '通信先はAnnict・Shikimori・Wikipedia・Google Fontsです（英語の画面では、声優・スタッフの英語名を引くためにWikidataも）。Shikimoriの作品データは上に書いたサーバーの処理（Vercel）を通して受け取ります。その処理はShikimoriの公開データを控えたり、MyAnimeListとAnnictで同じ作品を指すIDの組（公開されている作品のIDどうし）を覚えたり、問い合わせの回数を数えたりするために、Upstash（Redis）を使います（利用者の情報は置きません）。GitHubと連携した場合は、GitHubにも送信します。問い合わせを送ったときは、その内容だけがこのサイトの関数を通して運営者の非公開のGitHubリポジトリに届きます。開いた画面の集計のために、画面の名前・参照元・国や地域・端末とブラウザの種類をVercel Web Analyticsに送ります。',
              'Anipair connects to Annict, Shikimori, Wikipedia, and Google Fonts (and, on the English screen, Wikidata for the English names of voice actors and staff). Shikimori’s anime data is received through the server process above (on Vercel), which uses Upstash (Redis) to keep copies of Shikimori’s public data, to remember which MyAnimeList ID and Annict ID point to the same anime (public anime IDs only), and to count requests (no user information is stored there). If you connect GitHub, data is also sent to GitHub. When you send feedback, only its contents reach the developer’s private GitHub repository through this site’s function. To count screen views, the screen name, referrer, country or region, and device and browser type are sent to Vercel Web Analytics.',
            )}
          </li>
          <li>
            {t(
              '作品の詳細のあらすじはWikipediaの記事の冒頭を、出典とライセンス（CC BY-SA 4.0）を添えて表示しています。',
              'Synopses in anime details show the beginning of the (Japanese) Wikipedia article, with its source and license (CC BY-SA 4.0).',
            )}
          </li>
          <li>
            {t(
              '表紙にはShikimoriのポスターと、AnnictのAPIが返す各作品の公式サイトの画像を表示しています。画像はブラウザが提供元から直接読み込みます。権利は各権利者に帰属します。',
              'Covers are Shikimori’s posters and images from each anime’s official website, provided through Annict’s API. Your browser loads the images directly from their sources. All rights belong to their respective owners.',
            )}
          </li>
          <li>
            {t(
              'ソースコードはMITライセンスで公開しています。Anipairの名前とロゴ、アニとペア（絵・名前・設定）の著作権は運営者が保持しています。',
              'The source code is published under the MIT License. The developer holds the copyright to the Anipair name and logo, and to Ani & Pair (artwork, names, and backstory).',
            )}
          </li>
        </ul>
      </details>
      <p className="settings__lead settings__about-foot">
        <a href="https://github.com/manato003/Anipair" target="_blank" rel="noreferrer">
          {t('ソースコード（GitHub）', 'Source code (GitHub)')}
        </a>
        <span className="settings__version">
          {t('バージョン', 'Version')} {__APP_VERSION__}
        </span>
      </p>
      <LegalLinks className="settings__about-foot" />
    </>
  )
  if (welcome) return <div id="settings-about">{body}</div>
  return (
    <Section id="settings-about" title={t('このアプリについて', 'About this app')}>
      {body}
    </Section>
  )
}
