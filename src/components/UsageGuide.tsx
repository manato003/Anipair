import { useState, type ReactNode } from 'react'
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

const STEPS: { art: ReactNode; title: string; body: string }[] = [
  {
    art: <WatchingScene className="scene-art guide-scene" />,
    title: 'ようこそ、Anipair へ',
    body: '見たアニメを、タップで Annict に記録していくアプリです。記録が増えるほど、あなたの好みに合う「次の1本」を見つけてきます。案内は、アニメを見る係のアニと、次の好きを見つけてくる係のペアです。',
  },
  {
    art: <Figure screen="rate" guide="ani" />,
    title: '評価: 表紙を見て、答える',
    body: 'クールの人気作が1枚ずつ出てきます。見た作品は4段階で評価、見ていなければ「見てない」、気になれば「見たい」。上の ‹ › で、前のクールへさかのぼれます。',
  },
  {
    art: <Figure screen="match" guide="pair" />,
    title: 'マッチング: 次の好きを見つける',
    body: 'あなたの評価から好みを調べて、まだ見ていない作品を提案します。気になれば「見たい」、違えば「興味なし」、迷ったら「保留」。提案の理由も一緒に出ます。',
  },
  {
    art: <Figure screen="records" guide="ani" />,
    title: '記録: 見てる・見た・見たい',
    body: '記録した作品の一覧です。見てる作品は、カードから次の話をその場で記録できます。「まとめ」では、好みの傾向・年間のふり返り・実績（称号）が見られます。',
  },
  {
    art: <Figure screen="browse" guide="pair" />,
    title: 'ブラウズ: 作品を探す',
    body: 'クールの作品の一覧と、タイトルでの検索です。表紙を押すと詳細が開き、あらすじ・キャスト・関連作品が読めて、そのまま記録もできます。',
  },
  {
    art: <Figure screen="nav" guide="both" />,
    title: '画面の行き来と、困ったとき',
    body: '画面は下の帯で切り替えます（スマホは左右に払っても、PC は ← → でも替わります）。右上の「?」は、その画面のボタンを1つずつ指して説明します。となりのボタンは、知らせと表示の設定です。',
  },
  {
    art: <CheerScene className="scene-art guide-scene" />,
    title: 'さあ、はじめよう',
    body: '記録はすべて、あなたの Annict に保存されます。まずは評価の画面で、見たことのある作品に答えてみてください。',
  },
]

export function UsageGuide(props: { active?: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  return (
    <Sheet label="Anipair の使い方" size="page" active={props.active} onClose={props.onClose}>
      <div className="guide" aria-live="polite">
        <p className="guide__count">
          {i + 1} / {STEPS.length}
        </p>
        <div className="guide__art" key={i}>
          {step.art}
        </div>
        <h2 className="guide__title">{step.title}</h2>
        <p className="guide__body">{step.body}</p>
        <div className="guide__dots" aria-hidden>
          {STEPS.map((s, k) => (
            <span key={s.title} className={k === i ? 'guide__dot guide__dot--on' : 'guide__dot'} />
          ))}
        </div>
        <div className="guide__nav">
          <button type="button" className="btn" onClick={() => setI(i - 1)} disabled={i === 0}>
            戻る
          </button>
          {last ? (
            <button type="button" className="btn btn--primary" onClick={props.onClose}>
              はじめる
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setI(i + 1)}>
              次へ
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
