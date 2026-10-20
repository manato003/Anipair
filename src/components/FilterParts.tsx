import { useState } from 'react'
import { t } from '../lib/i18n'
import { Loading, Spinner } from './Loading'

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
          {props.moreLabel ? props.moreLabel(props.items.length - limit) : t(`ほかの${props.items.length - limit}件も見る`, `Show ${props.items.length - limit} more`)}
        </button>
      )}
    </section>
  )
}

// 放送年の「から〜まで」。years は新しい順
export function YearRange(props: { years: readonly number[]; from: number | null; to: number | null; onChange: (from: number | null, to: number | null) => void }) {
  return (
    <section className="filtersheet__group">
      <h3 className="detail__label">{t('放送年', 'Air year')}</h3>
      <div className="filtersheet__years">
        <select value={props.from ?? ''} onChange={(e) => props.onChange(e.target.value ? Number(e.target.value) : null, props.to)} aria-label={t('放送年（から）', 'Air year (from)')}>
          <option value="">{t('指定なし', 'Any')}</option>
          {[...props.years].reverse().map((y) => (
            <option key={y} value={y}>
              {t(`${y}年`, `${y}`)}
            </option>
          ))}
        </select>
        <span aria-hidden>{t('〜', '–')}</span>
        <select value={props.to ?? ''} onChange={(e) => props.onChange(props.from, e.target.value ? Number(e.target.value) : null)} aria-label={t('放送年（まで）', 'Air year (to)')}>
          <option value="">{t('指定なし', 'Any')}</option>
          {props.years.map((y) => (
            <option key={y} value={y}>
              {t(`${y}年`, `${y}`)}
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
        <p className="note">{t(`作品の情報を読めませんでした（${props.error}）`, `Couldn’t load anime info (${props.error})`)}</p>
      ) : (
        <Loading label={t('作品の情報を読み込み中', 'Loading anime info')} />
      )}
    </section>
  )
}

// 下に貼りつく「すべて解除」と「N件を表示」。resultCount が null のときは作品を読み直している
export function FilterFoot(props: { resultCount: number | null; onClear: () => void; onClose: () => void }) {
  return (
    <div className="filtersheet__foot">
      <button type="button" className="link" onClick={props.onClear}>
        {t('すべて解除', 'Clear all')}
      </button>
      <button type="button" className="btn btn--primary" onClick={props.onClose}>
        {props.resultCount === null ? (
          <>
            <Spinner />
            {t('読み込み中（閉じて待てます）', 'Loading (you can close and wait)')}
          </>
        ) : (
          t(`${props.resultCount}件を表示`, `Show ${props.resultCount} anime`)
        )}
      </button>
    </div>
  )
}
