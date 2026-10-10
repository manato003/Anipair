import type { ReactNode } from 'react'
import type { SeasonName } from '../lib/season'

// © 2026 manato003. アニとペアのデザイン・絵・名前・設定は、MIT ライセンスの対象外です（著作権を保持。LICENSE の「例外」）。
//
// マスコットの「アニ」と「ペア」（アプリの名前を2つに割った2人組）。
// アニ: 大きめのおもち。テレビのアンテナで今期の作品を受信する、アニメを見る係。
// ペア: 少し小さいおもち。頭に季節の芽（春は桜・夏は葉・秋は紅葉・冬は雪）。次の好きを見つけてくる係。
// 線は濃い色、体は温かい白、差し色は季節の色を1つだけ（styles/mascot.css）。芽と差し色は、地と同じく見ているクールの季節で CSS が替える。
// 体の外に出る線（アンテナ・芽の茎・腕）は地の文字の色にして、暗い地でも見えるようにする。
// 出てくるのは、待つ・空・はじめて・うれしい・困った、のような気持ちが動く場面だけ（答える画面の表紙と答えの邪魔をしない）

export type MascotExpr = 'normal' | 'happy' | 'surprised' | 'sleepy' | 'sad' | 'think'
type Arms = 'down' | 'up' | 'hold'

const SW = 4.2

// 目と口（cx は2つの目の真ん中、gap は目の間、s は大きさ）
function Face({ expr, cx, cy, gap, s = 1 }: { expr: MascotExpr; cx: number; cy: number; gap: number; s?: number }) {
  const ex = [cx - gap / 2, cx + gap / 2]
  const my = cy + 10 * s
  const cheeks = (
    <>
      <ellipse className="m-cheek" cx={ex[0] - 7 * s} cy={cy + 7 * s} rx={5 * s} ry={2.8 * s} />
      <ellipse className="m-cheek" cx={ex[1] + 7 * s} cy={cy + 7 * s} rx={5 * s} ry={2.8 * s} />
    </>
  )
  const eye = (x: number, dy = 0, dx = 0) => (
    <>
      <ellipse className="m-ink" cx={x + dx} cy={cy + dy} rx={3.6 * s} ry={5 * s} />
      <circle className="m-hi" cx={x + dx + 1.2 * s} cy={cy + dy - 1.8 * s} r={1.25 * s} />
    </>
  )
  const arc = (x: number, up: boolean) => (
    <path className="m-line" d={`M${x - 4 * s} ${cy + (up ? 1.5 : -1) * s}q${4 * s} ${(up ? -6 : 5) * s} ${8 * s} 0`} strokeWidth={3 * s} />
  )
  switch (expr) {
    case 'happy':
      return (
        <>
          {cheeks}
          {arc(ex[0], true)}
          {arc(ex[1], true)}
          <path className="m-ink" d={`M${cx - 5 * s} ${my - s}h${10 * s}q0 ${6.5 * s} ${-5 * s} ${6.5 * s}t${-5 * s} ${-6.5 * s}Z`} />
        </>
      )
    case 'surprised':
      return (
        <>
          {cheeks}
          <circle className="m-ink" cx={ex[0]} cy={cy} r={4.4 * s} />
          <circle className="m-ink" cx={ex[1]} cy={cy} r={4.4 * s} />
          <circle className="m-hi" cx={ex[0] + 1.3 * s} cy={cy - 1.6 * s} r={1.3 * s} />
          <circle className="m-hi" cx={ex[1] + 1.3 * s} cy={cy - 1.6 * s} r={1.3 * s} />
          <ellipse className="m-ink" cx={cx} cy={my + s} rx={2.8 * s} ry={3.4 * s} />
        </>
      )
    case 'sleepy':
      return (
        <>
          {cheeks}
          {arc(ex[0], false)}
          {arc(ex[1], false)}
          <ellipse className="m-ink" cx={cx} cy={my + 1} rx={2.2 * s} ry={1.8 * s} />
        </>
      )
    case 'sad':
      return (
        <>
          {eye(ex[0])}
          {eye(ex[1])}
          <path className="m-line" d={`M${cx - 3.5 * s} ${my + 2.5 * s}q${3.5 * s} ${-3.6 * s} ${7 * s} 0`} strokeWidth={2.8 * s} />
          <path className="m-drop" d={`M${ex[1] + 12 * s} ${cy - 10 * s}q${3 * s} ${5 * s} 0 ${7 * s}q${-3 * s} ${-2 * s} 0 ${-7 * s}Z`} strokeWidth={1.6 * s} />
        </>
      )
    case 'think':
      return (
        <>
          {eye(ex[0], -1.5 * s, s)}
          {eye(ex[1], -1.5 * s, s)}
          <path className="m-line" d={`M${cx - 2.5 * s} ${my}h${5 * s}`} strokeWidth={3 * s} />
        </>
      )
    default:
      return (
        <>
          {cheeks}
          {eye(ex[0])}
          {eye(ex[1])}
          <path className="m-line" d={`M${cx - 3.5 * s} ${my}q${3.5 * s} ${3.8 * s} ${7 * s} 0`} strokeWidth={2.8 * s} />
        </>
      )
  }
}

// ペアの頭の芽。4つの季節を全部描き、いまの季節の1つだけを CSS で出す（地の色と同じく、見ているクールで替わる）。
// only を渡すと、その季節の芽だけをいつも出す（季節ごとの芽を並べて見せるところ）
function Sprout({ only }: { only?: SeasonName }) {
  const cls = (s: SeasonName) => (only ? (only === s ? 'm-sprout m-sprout--show' : 'm-sprout') : `m-sprout m-sprout--${s}`)
  return (
    <g>
      <path className="m-wire" d="M0 0v-9" strokeWidth={SW * 0.8} />
      <g className={cls('spring')} transform="translate(0 -17)">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} className="m-accent" cx="0" cy="-6" rx="4.2" ry="6" transform={`rotate(${a})`} strokeWidth="2.4" />
        ))}
        <circle className="m-ink" r="2.6" />
      </g>
      <g className={cls('summer')}>
        <path className="m-accent" d="M0-8C-1-17-9-20-15-18c0 7 6 11 15 10Z" strokeWidth="2.6" />
        <path className="m-accent" d="M0-10C2-19 10-22 16-19c-1 7-7 10-16 9Z" strokeWidth="2.6" />
      </g>
      <g className={cls('autumn')}>
        <path className="m-accent" d="M0-30 3.5-21 11-25 8-16.5 16-15 9.5-10 12-5.5 3.5-8 0-8-3.5-8-12-5.5-9.5-10-16-15-8-16.5-11-25-3.5-21Z" strokeWidth="2.6" />
      </g>
      <g className={cls('winter')} transform="translate(0 -18)">
        <path className="m-line" d="M0-10v20M-8.7-5 8.7 5M-8.7 5 8.7-5M-2.5-8.2 0-6 2.5-8.2M-2.5 8.2 0 6 2.5 8.2" strokeWidth="2.6" />
        <circle className="m-accent" r="3.6" strokeWidth="2" />
      </g>
    </g>
  )
}

function armsPath(arms: Arms, side: 'ani' | 'pair') {
  if (side === 'ani') {
    if (arms === 'up') return ['M19 68Q7 56 9 44', 'M101 68q12-12 10-24']
    if (arms === 'hold') return ['M22 84q8 2 14-4', 'M98 84q-8 2-14-4']
    return ['M18 80q-6 6-4 13', 'M102 80q6 6 4 13']
  }
  if (arms === 'up') return ['M29 76Q19 66 21 55', 'M91 76q10-10 8-21']
  if (arms === 'hold') return ['M30 90q7 1 12-4', 'M90 90q-7 1-12-4']
  return ['M28 88q-5 5-3 11', 'M92 88q5 5 3 11']
}

interface FigureProps {
  expr?: MascotExpr
  arms?: Arms
  // 後ろ姿（顔を描かない）
  back?: boolean
  // アンテナを揺らす（アニ。読み込み中）
  wiggle?: boolean
  // アンテナが曲がっている（アニ。困った）
  bent?: boolean
  // ペアの芽の季節を決める（無ければ、見ているクールの季節）
  season?: SeasonName
}

// アニの形（120 の枠）。<svg> の中に置く
export function AniFigure({ expr = 'normal', arms = 'down', back = false, wiggle = false, bent = false }: FigureProps) {
  const [l, r] = armsPath(arms, 'ani')
  return (
    <g className="m-ani">
      <g className={wiggle ? 'm-antenna m-antenna--wiggle' : 'm-antenna'}>
        <path className="m-wire" d="M52 40Q46 24 39 13" strokeWidth={SW} />
        <path className="m-wire" d={bent ? 'M68 40Q78 30 92 34' : 'M68 40Q74 24 81 13'} strokeWidth={SW} />
        <circle className="m-accent m-tip" cx="38" cy="11" r="5.4" strokeWidth="3.2" />
        <circle className="m-accent m-tip" cx={bent ? 94 : 82} cy={bent ? 35 : 11} r="5.4" strokeWidth="3.2" />
      </g>
      <ellipse className="m-body" cx="44" cy="108" rx="9" ry="5.5" strokeWidth={SW * 0.9} />
      <ellipse className="m-body" cx="76" cy="108" rx="9" ry="5.5" strokeWidth={SW * 0.9} />
      <path className="m-wire" d={l} strokeWidth={SW} />
      <path className="m-wire" d={r} strokeWidth={SW} />
      <path className="m-body" d="M16 76C16 50 35 37 60 37s44 13 44 39c0 21-17 32-44 32S16 97 16 76Z" strokeWidth={SW} />
      {!back && <path className="m-belly" d="M30 94c8 7 18 9 30 9s22-2 30-9" strokeWidth="7" />}
      {!back && <Face expr={expr} cx={60} cy={70} gap={24} />}
    </g>
  )
}

// ペアの形（120 の枠）。<svg> の中に置く
export function PairFigure({ expr = 'normal', arms = 'down', back = false, season }: FigureProps) {
  const [l, r] = armsPath(arms, 'pair')
  return (
    <g className="m-pair">
      <ellipse className="m-body" cx="50" cy="109" rx="7.5" ry="4.8" strokeWidth={SW * 0.9} />
      <ellipse className="m-body" cx="70" cy="109" rx="7.5" ry="4.8" strokeWidth={SW * 0.9} />
      <path className="m-wire" d={l} strokeWidth={SW} />
      <path className="m-wire" d={r} strokeWidth={SW} />
      <path className="m-body" d="M26 84c0-21 15-33 34-33s34 12 34 33c0 17-14 26-34 26S26 101 26 84Z" strokeWidth={SW} />
      {!back && <path className="m-belly" d="M38 99c6 5 13 6.5 22 6.5s16-1.5 22-6.5" strokeWidth="6" />}
      <g transform="translate(60 52) scale(1.05)">
        <Sprout only={season} />
      </g>
      {!back && <Face expr={expr} cx={60} cy={80} gap={20} s={0.92} />}
    </g>
  )
}

function Svg(props: { viewBox: string; className?: string; label?: string; children: ReactNode }) {
  const cls = ['mascot', props.className ?? ''].filter(Boolean).join(' ')
  return props.label ? (
    <svg className={cls} viewBox={props.viewBox} role="img" aria-label={props.label}>
      {props.children}
    </svg>
  ) : (
    <svg className={cls} viewBox={props.viewBox} aria-hidden>
      {props.children}
    </svg>
  )
}

export function Ani(props: FigureProps & { className?: string; label?: string }) {
  return (
    <Svg viewBox="0 0 120 120" className={props.className} label={props.label}>
      <AniFigure {...props} />
    </Svg>
  )
}

export function Pair(props: FigureProps & { className?: string; label?: string }) {
  return (
    <Svg viewBox="0 0 120 120" className={props.className} label={props.label}>
      <PairFigure {...props} />
    </Svg>
  )
}

// セル画のカード（上端にタップ穴）。ペアが持ってくる「次の1本」、空の一覧の空っぽのセル
function Cel({ x, y, w, h, rot = 0, empty = false }: { x: number; y: number; w: number; h: number; rot?: number; empty?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} ${w / 2} ${h / 2})`}>
      {empty ? (
        <rect className="m-dash" width={w} height={h} rx={w * 0.12} strokeWidth="3.6" />
      ) : (
        <>
          <rect className="m-accent" width={w} height={h} rx={w * 0.12} strokeWidth="3.2" />
          <rect className="m-cel-face" x={w * 0.12} y={h * 0.2} width={w * 0.76} height={h * 0.68} rx={w * 0.08} />
        </>
      )}
      <circle className="m-ink" cx={w * 0.25} cy={h * 0.1} r={w * 0.05} />
      <rect className="m-ink" x={w * 0.4} y={h * 0.07} width={w * 0.2} height={h * 0.06} rx={h * 0.03} />
      <circle className="m-ink" cx={w * 0.75} cy={h * 0.1} r={w * 0.05} />
    </g>
  )
}

// ── 場面 ──

// ログイン前: 2人で並んでテレビを見ている後ろ姿
export function WatchingScene(props: { className?: string }) {
  return (
    <Svg viewBox="0 0 300 170" className={props.className} label="アニとペアが並んでアニメを見ている">
      <rect className="m-tv" x="70" y="14" width="160" height="96" rx="12" />
      <rect className="m-screen" x="80" y="24" width="140" height="76" rx="7" />
      <path className="m-play" d="M141 47v30l26-15Z" />
      <path className="m-wire" d="M120 110l-8 12M180 110l8 12" strokeWidth="4" />
      <g transform="translate(70 70) scale(0.85)">
        <AniFigure back />
      </g>
      <g transform="translate(150 80) scale(0.78)">
        <PairFigure back />
      </g>
    </Svg>
  )
}

// 提案の前: ペアが次の1本（セル画のカード）を抱えて持ってくる
export function ProposeScene(props: { className?: string }) {
  return (
    <Svg viewBox="0 0 300 170" className={props.className}>
      <g transform="translate(40 28) scale(1.05)">
        <AniFigure expr="surprised" />
      </g>
      <Cel x={178} y={22} w={56} h={78} rot={8} />
      <g transform="translate(150 50)">
        <PairFigure expr="happy" arms="hold" />
      </g>
    </Svg>
  )
}

// 空の一覧: アニが空っぽのセルを覗いている
export function EmptyScene(props: { className?: string }) {
  return (
    <Svg viewBox="0 0 300 170" className={props.className}>
      <Cel x={150} y={20} w={74} h={100} rot={-6} empty />
      <g transform="translate(50 36) scale(1.05)">
        <AniFigure expr="think" />
      </g>
    </Svg>
  )
}

// うまくいかなかった: アンテナが曲がって、アニが困っている
export function TroubleScene(props: { className?: string }) {
  return (
    <Svg viewBox="0 0 300 170" className={props.className}>
      <g transform="translate(90 26) scale(1.1) rotate(-8 60 70)">
        <AniFigure expr="sad" bent />
      </g>
    </Svg>
  )
}

// うれしい: 2人で両手を上げて喜ぶ（称号を手に入れたとき）
export function CheerScene(props: { className?: string }) {
  return (
    <Svg viewBox="0 0 300 170" className={props.className}>
      <g transform="translate(46 30) scale(1.05)">
        <AniFigure expr="happy" arms="up" />
      </g>
      <g transform="translate(146 44) scale(0.98)">
        <PairFigure expr="happy" arms="up" />
      </g>
      <g className="m-confetti">
        <rect className="m-accent" x="30" y="24" width="8" height="12" rx="2" transform="rotate(-20 34 30)" strokeWidth="2" />
        <rect className="m-accent" x="262" y="34" width="8" height="12" rx="2" transform="rotate(24 266 40)" strokeWidth="2" />
        <circle className="m-accent" cx="148" cy="22" r="4.5" strokeWidth="2" />
        <rect className="m-accent" x="214" y="16" width="7" height="11" rx="2" transform="rotate(-10 217 21)" strokeWidth="2" />
      </g>
    </Svg>
  )
}

// ── 印（ロゴ・アイコン）: 2人の頭。64 の枠 ──
// faces: 顔を描くか（32px より小さいと潰れるので、ブラウザのタブでは描かない）。
// ペアの芽は、季節に寄らない2枚葉（アイコンのファイルは季節で替えられないため）
export function DuoMarkFigure({ faces = true }: { faces?: boolean }) {
  return (
    <g>
      <path className="m-wire" d="M21 22 14 8M31 22l5-14" strokeWidth="5" />
      <circle className="m-accent" cx="13.5" cy="7.5" r="4.5" strokeWidth="3" />
      <circle className="m-accent" cx="36.5" cy="7.5" r="4.5" strokeWidth="3" />
      <path className="m-body" d="M3 42c0-13 9-21 23-21s23 8 23 21c0 11-9 17-23 17S3 53 3 42Z" strokeWidth="5" />
      <g transform="translate(49 34) scale(0.7)">
        <path className="m-wire" d="M0 0v-9" strokeWidth="3.4" />
        <path className="m-accent" d="M0-8C-1-17-9-20-15-18c0 7 6 11 15 10Z" strokeWidth="2.6" />
        <path className="m-accent" d="M0-10C2-19 10-22 16-19c-1 7-7 10-16 9Z" strokeWidth="2.6" />
      </g>
      <path className="m-body" d="M34 48c0-10 7-15 15-15s15 5 15 15c0 7-6 11-15 11s-15-4-15-11Z" strokeWidth="5" />
      {faces && (
        <>
          <circle className="m-ink" cx="19" cy="41" r="3" />
          <circle className="m-ink" cx="32" cy="41" r="3" />
          <circle className="m-ink" cx="45" cy="47" r="2.6" />
          <circle className="m-ink" cx="54" cy="47" r="2.6" />
        </>
      )}
    </g>
  )
}

export function DuoMark(props: { className?: string; faces?: boolean }) {
  return (
    <Svg viewBox="0 0 64 64" className={props.className}>
      <DuoMarkFigure faces={props.faces} />
    </Svg>
  )
}
