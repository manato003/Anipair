import { useState, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { AniFigure, CheerScene, PairFigure, WatchingScene } from './Mascot'
import { Sheet } from './Sheet'

// 「Anipair の使い方」。アニとペアが、アプリ全体の流れを7ページで案内する（初めて評価の画面を開いたときに1回だけ出し、設定の「このアプリ」からいつでも見直せる）。
// 文章だけでは伝わらないので、ページごとに画面を簡単にした図を描き、説明する場所を差し色で光らせる。
// 画面ごとの細かい使い方は、各画面の右上の「?」（実際の画面の上でボタンを指す）に任せる。
// どう閉じても（はじめる・閉じる・Esc・戻る・払う）、閉じたら onClose を呼ぶ

type Screen = 'rate' | 'match' | 'records' | 'browse' | 'nav'

// 画面の図（スマホの形。120×200）。hl の場所を差し色で光らせる。下の帯は5つの分類で、いまの画面を濃くする
function Wire({ screen }: { screen: Screen }) {
  const tab = { rate: 0, match: 1, records: 2, browse: 3, nav: -1 }[screen]
  const hl = 'guide-wire__hl'
  return (
    <svg className="guide-wire" viewBox="0 0 120 200" aria-hidden>
      <rect className="guide-wire__frame" x="2" y="2" width="116" height="196" rx="16" />
      {/* 上の段（見出しと、右上の ? とコントロールセンター） */}
      <rect className="guide-wire__ink" x="12" y="14" width="34" height="7" rx="3.5" />
      <circle className={screen === 'nav' ? hl : 'guide-wire__soft'} cx="88" cy="17.5" r="6" />
      <circle className={screen === 'nav' ? hl : 'guide-wire__soft'} cx="103" cy="17.5" r="6" />
      {screen === 'rate' && (
        <>
          <rect className="guide-wire__soft" x="30" y="30" width="60" height="5" rx="2.5" />
          <rect className="guide-wire__cover" x="38" y="42" width="44" height="62" rx="5" />
          <rect className="guide-wire__ink" x="34" y="110" width="52" height="5" rx="2.5" />
          <rect className={hl} x="10" y="124" width="100" height="16" rx="5" />
          <rect className={hl} x="10" y="144" width="32" height="14" rx="5" />
          <rect className={hl} x="46" y="144" width="64" height="14" rx="5" />
        </>
      )}
      {screen === 'match' && (
        <>
          <rect className="guide-wire__cover" x="38" y="30" width="44" height="62" rx="5" />
          <rect className="guide-wire__ink" x="30" y="98" width="60" height="5" rx="2.5" />
          <rect className={hl} x="24" y="108" width="72" height="12" rx="4" />
          <rect className="guide-wire__soft" x="10" y="126" width="100" height="12" rx="5" />
          <rect className={hl} x="10" y="143" width="31" height="15" rx="5" />
          <rect className={hl} x="44" y="143" width="32" height="15" rx="5" />
          <rect className={hl} x="79" y="143" width="31" height="15" rx="5" />
        </>
      )}
      {screen === 'records' && (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} className={i === 4 ? hl : 'guide-wire__soft'} x={10 + i * 21} y="28" width="17" height="9" rx="3" />
          ))}
          {[0, 1].map((i) => (
            <g key={i}>
              <rect className="guide-wire__cover" x="10" y={46 + i * 52} width="26" height="38" rx="3" />
              <rect className="guide-wire__ink" x="42" y={48 + i * 52} width="56" height="5" rx="2.5" />
              <rect className="guide-wire__soft" x="42" y={58 + i * 52} width="40" height="4" rx="2" />
              <rect className={hl} x="42" y={70 + i * 52} width="68" height="12" rx="4" />
            </g>
          ))}
        </>
      )}
      {screen === 'browse' && (
        <>
          <rect className="guide-wire__soft" x="10" y="28" width="72" height="11" rx="5.5" />
          <rect className="guide-wire__soft" x="86" y="28" width="24" height="11" rx="5.5" />
          <rect className="guide-wire__soft" x="30" y="44" width="60" height="9" rx="4.5" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} className={i === 1 ? hl : 'guide-wire__cover'} x={10 + (i % 3) * 34} y={60 + Math.floor(i / 3) * 52} width="30" height="44" rx="3" />
          ))}
        </>
      )}
      {screen === 'nav' && (
        <>
          <rect className="guide-wire__cover" x="38" y="34" width="44" height="62" rx="5" />
          <rect className="guide-wire__soft" x="10" y="108" width="100" height="14" rx="5" />
          <rect className="guide-wire__soft" x="10" y="128" width="100" height="14" rx="5" />
          <path className="guide-wire__arrow" d="M22 160h76M30 154l-8 6 8 6M90 154l8 6-8 6" />
        </>
      )}
      {/* 下の帯（5つの分類） */}
      <rect className={screen === 'nav' ? hl : 'guide-wire__bar'} x="2" y="172" width="116" height="26" rx="0" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} className={i === tab ? 'guide-wire__ink' : 'guide-wire__dot'} cx={18 + i * 21} cy="185" r={i === tab ? 4.5 : 3.5} />
      ))}
    </svg>
  )
}

// 図と、横に立つアニかペア
function Figure({ screen, guide }: { screen: Screen; guide: 'ani' | 'pair' | 'both' }) {
  return (
    <div className="guide-art">
      <Wire screen={screen} />
      <svg className="mascot guide-art__mascot" viewBox={guide === 'both' ? '0 0 200 120' : '0 0 120 120'} aria-hidden>
        {guide === 'ani' && <AniFigure expr="happy" />}
        {guide === 'pair' && <PairFigure expr="happy" />}
        {guide === 'both' && (
          <>
            <AniFigure />
            <g transform="translate(84 8) scale(0.93)">
              <PairFigure expr="happy" />
            </g>
          </>
        )}
      </svg>
    </div>
  )
}

// 言語を替えたら文言も替わるように、呼ぶたびに作る（ファイルの一番外で t() を呼ばない）
function steps(): { art: ReactNode; title: string; body: string }[] {
  return [
    {
      art: <WatchingScene className="scene-art guide-scene" />,
      title: t('ようこそ、Anipairへ', 'Welcome to Anipair'),
      body: t(
        '見たアニメをタップでAnnictに記録していくアプリです。記録が増えるほど、あなたの好みに合う「次の1本」を見つけてきます。案内はアニメを見る係のアニと、次の好きを見つけてくる係のペアです。',
        'Anipair lets you log the anime you’ve watched on Annict with just a tap. The more you record, the better it gets at finding your “next one”. Your guides are Ani, who watches the anime, and Pair, who hunts for the next thing you’ll love.',
      ),
    },
    {
      art: <Figure screen="rate" guide="ani" />,
      title: t('評価: 表紙を見て答える', 'Rate: look at the cover and answer'),
      body: t(
        'クールの人気作が1枚ずつ出てきます。見た作品は4段階で評価、見ていなければ「見てない」、気になれば「見たい」。上の ‹ › で、前のクールへさかのぼれます。',
        'Popular anime from a season appear one at a time. Rate what you’ve watched in four steps, tap “Haven’t seen” if you haven’t, or “Want to watch” if it looks interesting. Use ‹ › at the top to go back to earlier seasons.',
      ),
    },
    {
      art: <Figure screen="match" guide="pair" />,
      title: t('マッチング: 次の好きを見つける', 'Match: find your next favorite'),
      body: t(
        'あなたの評価から好みを調べて、まだ見ていない作品を提案します。気になれば「見たい」、違えば「興味なし」、迷ったら「保留」。提案の理由も一緒に出ます。',
        'Anipair learns your taste from your ratings and suggests anime you haven’t seen. Tap “Want to watch” if it looks good, “Not interested” if not, or “Later” if you’re unsure. Each suggestion comes with a reason.',
      ),
    },
    {
      art: <Figure screen="records" guide="ani" />,
      title: t('記録: 見てる・見た・見たい', 'Records: Watching, Watched, Want to watch'),
      body: t(
        '記録した作品の一覧です。見てる作品はカードから次の話をその場で記録できます。「まとめ」では好みの傾向・年間のふり返り・実績（称号）が見られ、見た作品を段に並べたTier表も作れます。',
        'Your recorded anime, in lists. For anime you’re watching, you can record the next episode right from the card. Under “Summary”, you’ll find your taste trends, Year in review, and Achievements (titles), and you can rank the anime you watched in a Tier list.',
      ),
    },
    {
      art: <Figure screen="browse" guide="pair" />,
      title: t('ブラウズ: 作品を探す', 'Browse: find anime'),
      body: t(
        'クールの作品の一覧と、タイトルでの検索です。表紙を押すと詳細が開き、あらすじ・キャスト・関連作品が読めて、そのまま記録もできます。',
        'Browse the anime list for each season, or search by title. Tap a cover to open details, read the synopsis, cast, and related anime, and record it right there.',
      ),
    },
    {
      art: <Figure screen="nav" guide="both" />,
      title: t('画面の行き来と困ったとき', 'Getting around, and getting help'),
      body: t(
        '画面は下の帯で切り替えます（スマホは左右に払っても、PCは ← → でも替わります）。右上の「?」はその画面のボタンを1つずつ指して説明します。となりのボタンは知らせと表示の設定です。',
        'Switch screens with the bar at the bottom (on a phone you can also swipe left or right; on a computer, press ← →). The “?” at the top right points to each button on the current screen and explains it. The button next to it opens notifications and display settings.',
      ),
    },
    {
      art: <CheerScene className="scene-art guide-scene" />,
      title: t('さあ、はじめよう', 'Let’s get started'),
      body: t(
        '記録はすべてあなたのAnnictに保存されます。閉じると評価の画面です。見たことのある作品に答えてみてください。スマホではブラウザの共有から「ホーム画面に追加」すると、アプリのように開けます。',
        'All your records are saved to your own Annict account. Close this to go to the Rate screen, and answer a few anime you’ve seen. On a phone, use your browser’s Share menu and “Add to Home Screen” to open Anipair like an app.',
      ),
    },
  ]
}

export function UsageGuide(props: { active?: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const all = steps()
  const step = all[i]
  const last = i === all.length - 1
  return (
    <Sheet label={t('Anipairの使い方', 'How to use Anipair')} size="page" active={props.active} onClose={props.onClose}>
      <div className="guide" aria-live="polite">
        <p className="guide__count">
          {i + 1} / {all.length}
        </p>
        <div className="guide__art" key={i}>
          {step.art}
        </div>
        <h2 className="guide__title">{step.title}</h2>
        <p className="guide__body">{step.body}</p>
        <div className="guide__dots" aria-hidden>
          {all.map((s, k) => (
            <span key={s.title} className={k === i ? 'guide__dot guide__dot--on' : 'guide__dot'} />
          ))}
        </div>
        <div className="guide__nav">
          {/* 1ページ目は戻る先が無いので、代わりに飛ばして閉じられるようにする（読まずに始めたい人のため。2026-10-21） */}
          {i === 0 ? (
            <button type="button" className="btn" onClick={props.onClose}>
              {t('スキップ', 'Skip')}
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => setI(i - 1)}>
              {t('戻る', 'Back')}
            </button>
          )}
          {last ? (
            <button type="button" className="btn btn--primary" onClick={props.onClose}>
              {t('はじめる', 'Start')}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setI(i + 1)}>
              {t('次へ', 'Next')}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
