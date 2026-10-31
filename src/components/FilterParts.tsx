import { useState } from 'react'
import { t } from '../lib/i18n'
import { SEASON_NAMES, seasonNameLabel, type Season, type SeasonName } from '../lib/season'
import { Loading, Spinner } from './Loading'

// 絞り込みのシート（記録・ブラウズ）で共通の部品

// 選べるもののチップの段。件数があれば添える。first を渡すと、最初はその数だけ出して「ほかの〜も見る」で広げる
export function ChipSection<T extends string>(props: {
  title: string
  // count は件数か、短い添え書き（苦手な項目の巻き添えの割合など）
  items: readonly { id: T; label: string; count?: number | string }[]
  selected: readonly T[]
  onToggle: (id: T) => void
  first?: number
  moreLabel?: (rest: number) => string
  // 選べる数の上限。上限まで選んだら、ほかは押せなくして maxNote を出す
  max?: number
  maxNote?: string
}) {
  const [all, setAll] = useState(false)
  const full = props.max !== undefined && props.selected.length >= props.max
  const limit = props.first !== undefined && !all ? props.first : Infinity
  const head = props.items.slice(0, limit)
  // 選んでいるのに最初の分に入っていないものも出す（外せるように）
  const shown = [...head, ...props.items.filter((it) => props.selected.includes(it.id) && !head.includes(it))]
  return (
    <section className="filtersheet__group">
      <h3 className="detail__label">{props.title}</h3>
      <div className="filtersheet__chips">
        {shown.map((it) => (
          <button
            key={it.id}
            type="button"
            className="chip"
            aria-pressed={props.selected.includes(it.id)}
            disabled={full && !props.selected.includes(it.id)}
            onClick={() => props.onToggle(it.id)}
          >
            {it.label}
            {it.count !== undefined && <span className="chip__count">{it.count}</span>}
          </button>
        ))}
      </div>
      {full && props.maxNote && <p className="note filtersheet__maxnote">{props.maxNote}</p>}
      {props.items.length > limit && (
        <button type="button" className="link filtersheet__more" onClick={() => setAll(true)}>
          {props.moreLabel ? props.moreLabel(props.items.length - limit) : t(`ほかの${props.items.length - limit}件も見る`, `Show ${props.items.length - limit} more`)}
        </button>
      )}
    </section>
  )
}

// クールを年と季節で選ぶ（期間の始めと終わり。並べて置くときは filtersheet__cours で包む）。年を「指定なし」にすると、そちらの端まで。年を選ぶと季節は fallback（から: 冬・まで: 秋）から始まる
export function CourField(props: { label: string; value: Season | null; years: readonly number[]; fallback: SeasonName; onChange: (value: Season | null) => void }) {
  const { value } = props
  return (
    <div className="filtersheet__cour">
      <span className="filtersheet__courlabel">{props.label}</span>
      <select
        value={value?.year ?? ''}
        onChange={(e) => props.onChange(e.target.value ? { year: Number(e.target.value), name: value?.name ?? props.fallback } : null)}
        aria-label={t(`放送時期（${props.label}）の年`, `Aired (${props.label.toLowerCase()}) year`)}
      >
        <option value="">{t('指定なし', 'Any')}</option>
        {props.years.map((y) => (
          <option key={y} value={y}>
            {t(`${y}年`, String(y))}
          </option>
        ))}
      </select>
      <select
        value={value?.name ?? ''}
        disabled={!value}
        onChange={(e) => value && props.onChange({ year: value.year, name: e.target.value as SeasonName })}
        aria-label={t(`放送時期（${props.label}）の季節`, `Aired (${props.label.toLowerCase()}) season`)}
      >
        {!value && <option value="">—</option>}
        {SEASON_NAMES.map((n) => (
          <option key={n} value={n}>
            {seasonNameLabel(n)}
          </option>
        ))}
      </select>
    </div>
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
