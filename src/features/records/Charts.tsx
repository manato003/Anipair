// 傾向のシートの図。SVG と HTML だけで描く（図のライブラリは使わない）。
// 決まりごと（dataviz の指針）: 棒は細く（24px まで）上端だけ丸める・線は2px・点は半径4で背景色の輪・塗りは1割の濃さ・
// 数値や名前は文字の色で、系列の色は図形だけ・1系列の図に凡例は付けない。押さえたいところだけ数を添え、残りは title（ホバー）で読める

// 構成比の4色（暗い背景用。dataviz の検証スクリプトで #161a2e の上で確認済み: 明るさ・彩度・色覚の違い・3:1 すべて合格）
const CATEGORY_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const
// 中央からの差の2色（プラスは青、マイナスは橙。上の4色のうち隣どうしで検証済みの2つ）
const DIVERGING = { plus: '#3987e5', minus: '#d95926' } as const

// レーダーチャート（1系列）。値は 0〜1。軸の名前と添え書き（本数など）を外側に出す
export function Radar(props: { axes: readonly { label: string; sub: string; value: number | null }[]; title: string }) {
  const n = props.axes.length
  const size = 300
  const c = size / 2
  const R = 92
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const point = (i: number, r: number) => [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))] as const
  const polygon = props.axes.map((a, i) => point(i, (a.value ?? 0) * R).join(',')).join(' ')
  return (
    <svg className="chart chart--radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={props.title}>
      <title>{props.title}</title>
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} className="chart__grid" points={props.axes.map((_, i) => point(i, k * R).join(',')).join(' ')} />
      ))}
      {props.axes.map((_, i) => {
        const [x, y] = point(i, R)
        return <line key={i} className="chart__grid" x1={c} y1={c} x2={x} y2={y} />
      })}
      <polygon className="chart__area" points={polygon} />
      {props.axes.map((a, i) => {
        const [x, y] = point(i, (a.value ?? 0) * R)
        return (
          <circle key={a.label} className="chart__dot" cx={x} cy={y} r={4}>
            <title>{`${a.label}（${a.sub}）`}</title>
          </circle>
        )
      })}
      {props.axes.map((a, i) => {
        const [x, y] = point(i, R + 22)
        const anchor = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end'
        return (
          <text key={a.label} className="chart__axis" x={x} y={y} textAnchor={anchor}>
            <tspan className="chart__axis-name">{a.label}</tspan>
            <tspan className="chart__axis-sub" x={x} dy="1.25em">
              {a.sub}
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}

// 縦棒（年ごと・月ごと）。強調するものは主の色、ほかは灰色（強調の形）。ラベルは間引いて出す
export function Columns(props: { bars: readonly { label: string; value: number; emphasis?: boolean; title: string }[]; title: string; every?: number }) {
  const n = props.bars.length
  const width = 320
  const height = 120
  const pad = 18
  const slot = (width - 8) / Math.max(n, 1)
  const bar = Math.min(24, Math.max(3, slot * 0.6))
  const max = Math.max(1, ...props.bars.map((b) => b.value))
  const every = props.every ?? Math.max(1, Math.ceil(n / 8))
  return (
    <svg className="chart chart--columns" viewBox={`0 0 ${width} ${height + pad}`} role="img" aria-label={props.title}>
      <title>{props.title}</title>
      <line className="chart__grid" x1={0} y1={height} x2={width} y2={height} />
      {props.bars.map((b, i) => {
        const h = (b.value / max) * (height - 14)
        const x = 4 + i * slot + (slot - bar) / 2
        const r = Math.min(4, bar / 2, h)
        return (
          <g key={b.label}>
            {b.value > 0 && (
              <path
                className={b.emphasis ? 'chart__bar chart__bar--em' : 'chart__bar'}
                d={`M${x},${height} V${height - h + r} Q${x},${height - h} ${x + r},${height - h} H${x + bar - r} Q${x + bar},${height - h} ${x + bar},${height - h + r} V${height} Z`}
              >
                <title>{b.title}</title>
              </path>
            )}
            {/* 押しやすいように、棒より広い透明の当たり */}
            <rect className="chart__hit" x={4 + i * slot} y={0} width={slot} height={height}>
              <title>{b.title}</title>
            </rect>
            {(i % every === 0 || i === n - 1) && (
              <text className="chart__tick" x={x + bar / 2} y={height + 13} textAnchor="middle">
                {b.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// 順位の横棒（よく見る声優など）。名前・本数・平均評価は文字で、棒は本数の長さ
export function RankBars(props: { items: readonly { key: string; name: string; count: number; note: string | null }[] }) {
  const max = Math.max(1, ...props.items.map((i) => i.count))
  return (
    <ol className="rankbars">
      {props.items.map((it) => (
        <li key={it.key} className="rankbars__item">
          <span className="rankbars__name">{it.name}</span>
          <span className="rankbars__track" aria-hidden>
            <span className="rankbars__fill" style={{ width: `${(it.count / max) * 100}%` }} />
          </span>
          <span className="rankbars__value">
            {it.count}本{it.note && <span className="rankbars__note">{it.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

// 中央（0）から左右に伸びる横棒（声優との相性）。max は棒の端の値（いくつかの図で目盛りを揃えるため渡す）。
// 名前の下に添え書き、右に値と本数。値は文字の色で、棒の色はプラス・マイナスだけを表す
export function Diverging(props: { items: readonly { key: string; name: string; value: number; valueText: string; sub: string | null }[]; max: number; title: string }) {
  const max = Math.max(props.max, 0.001)
  return (
    <ol className="diverging" aria-label={props.title}>
      {props.items.map((it) => {
        const w = (Math.min(Math.abs(it.value), max) / max) * 50
        return (
          <li key={it.key} className="diverging__item">
            <span className="diverging__label">
              <span className="diverging__name">{it.name}</span>
              {it.sub && <span className="diverging__sub">{it.sub}</span>}
            </span>
            <span className="diverging__track" aria-hidden>
              <span className="diverging__center" />
              <span
                className={it.value >= 0 ? 'diverging__fill diverging__fill--plus' : 'diverging__fill diverging__fill--minus'}
                style={{ width: `${w}%`, background: it.value >= 0 ? DIVERGING.plus : DIVERGING.minus }}
              />
            </span>
            <span className="diverging__value">{it.valueText}</span>
          </li>
        )
      })}
    </ol>
  )
}

// 構成比の積み上げ横棒（4区分まで）。区分のあいだは2pxの隙間、凡例に名前と数
export function Stack(props: { parts: readonly { label: string; value: number }[]; title: string }) {
  const total = props.parts.reduce((a, p) => a + p.value, 0) || 1
  return (
    <div className="stack">
      <div className="stack__bar" role="img" aria-label={props.title}>
        {props.parts.map((p, i) =>
          p.value > 0 ? (
            <span key={p.label} className="stack__part" style={{ flexGrow: p.value, background: CATEGORY_COLORS[i] }} title={`${p.label} ${p.value}本`} />
          ) : null,
        )}
      </div>
      <ul className="stack__legend">
        {props.parts.map((p, i) => (
          <li key={p.label}>
            <span className="stack__swatch" style={{ background: CATEGORY_COLORS[i] }} aria-hidden />
            {p.label}
            <span className="stack__value">
              {p.value}本（{Math.round((p.value / total) * 100)}%）
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// 割合のリング（完走率）。真ん中に数
export function Ring(props: { value: number; label: string }) {
  const r = 34
  const len = 2 * Math.PI * r
  return (
    <svg className="chart chart--ring" viewBox="0 0 90 90" role="img" aria-label={`${props.label} ${Math.round(props.value * 100)}%`}>
      <circle className="ring__track" cx={45} cy={45} r={r} />
      <circle className="ring__fill" cx={45} cy={45} r={r} strokeDasharray={`${len * props.value} ${len}`} transform="rotate(-90 45 45)" />
      <text className="ring__value" x={45} y={50} textAnchor="middle">
        {Math.round(props.value * 100)}%
      </text>
    </svg>
  )
}

// 甘口・辛口のメーター（-2〜+2。真ん中が世間と同じ）
export function Balance(props: { value: number; left: string; right: string }) {
  const v = Math.max(-2, Math.min(2, props.value))
  return (
    <div className="balance">
      <div className="balance__track" aria-hidden>
        <span className="balance__center" />
        <span className="balance__dot" style={{ left: `${((v + 2) / 4) * 100}%` }} />
      </div>
      <div className="balance__labels" aria-hidden>
        <span>{props.left}</span>
        <span>世間と同じ</span>
        <span>{props.right}</span>
      </div>
    </div>
  )
}
