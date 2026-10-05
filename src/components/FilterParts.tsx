import { useState } from 'react'

// 絞り込みのシート（記録・ブラウズ）で共通の部品。項目の中は「どれか」に当てはまるもの

// 選べるもののチップの段。件数があれば添える。first を渡すと、最初はその数だけ出して「ほかの〜も見る」で広げる
export function ChipSection<T extends string>(props: {
  title: string
  items: readonly { id: T; label: string; count?: number }[]
  selected: readonly T[]
  onToggle: (id: T) => void
  first?: number
  moreLabel?: (rest: number) => string
}) {
  const [all, setAll] = useState(false)
  const limit = props.first && !all ? props.first : Infinity
  const head = props.items.slice(0, limit)
  // 選んでいるのに最初の分に入っていないものも出す（外せるように）
  const shown = [...head, ...props.items.filter((it) => props.selected.includes(it.id) && !head.includes(it))]
  return (
    <section className="filtersheet__group">
      <h3 className="detail__label">{props.title}</h3>
      <div className="filtersheet__chips">
        {shown.map((it) => (
          <button key={it.id} type="button" className="chip" aria-pressed={props.selected.includes(it.id)} onClick={() => props.onToggle(it.id)}>
            {it.label}
            {it.count !== undefined && <span className="chip__count">{it.count}</span>}
          </button>
        ))}
      </div>
      {props.items.length > limit && (
        <button type="button" className="link filtersheet__more" onClick={() => setAll(true)}>
          {props.moreLabel ? props.moreLabel(props.items.length - limit) : `ほかの${props.items.length - limit}件も見る`}
        </button>
      )}
    </section>
  )
}

// 放送年の「から〜まで」。years は新しい順
export function YearRange(props: { years: readonly number[]; from: number | null; to: number | null; onChange: (from: number | null, to: number | null) => void }) {
  return (
    <section className="filtersheet__group">
      <h3 className="detail__label">放送年</h3>
      <div className="filtersheet__years">
        <select value={props.from ?? ''} onChange={(e) => props.onChange(e.target.value ? Number(e.target.value) : null, props.to)} aria-label="放送年（から）">
          <option value="">指定なし</option>
          {[...props.years].reverse().map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        <span aria-hidden>〜</span>
        <select value={props.to ?? ''} onChange={(e) => props.onChange(props.from, e.target.value ? Number(e.target.value) : null)} aria-label="放送年（まで）">
          <option value="">指定なし</option>
          {props.years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

// 作品の情報（ジャンル・制作会社）を読んでいる・読めなかったときの1行
export function InfoNote(props: { title: string; loading: boolean; error: string | null }) {
  if (!props.loading && !props.error) return null
  return (
    <section className="filtersheet__group">
      <h3 className="detail__label">{props.title}</h3>
      {props.error ? (
        <p className="note">作品の情報を読めませんでした（{props.error}）</p>
      ) : (
        <p className="note" aria-busy>
          作品の情報を読んでいます
        </p>
      )}
    </section>
  )
}

// 下に貼りつく「すべて解除」と「N件を表示」。resultCount が null のときは作品を読み直している
export function FilterFoot(props: { resultCount: number | null; onClear: () => void; onClose: () => void }) {
  return (
    <div className="filtersheet__foot">
      <button type="button" className="link" onClick={props.onClear}>
        すべて解除
      </button>
      <button type="button" className="btn btn--primary" onClick={props.onClose}>
        {props.resultCount === null ? '読んでいます（閉じて待てます）' : `${props.resultCount}件を表示`}
      </button>
    </div>
  )
}
