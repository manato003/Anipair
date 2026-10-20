// 並べ替え（記録とブラウズ）。文字だけの切り替えで、選んでいる並べ方を濃くする。
// 押している並べ方をもう一度押すと、昇順と降順が入れ替わる（矢印で向きを示す）。
// 矢印の幅はどの並べ方にも空けておく（選び直したときに、文字の位置が揺れないように）
import { t } from '../lib/i18n'

export type SortDir = 'desc' | 'asc'

export function SortRow<K extends string>(props: { options: readonly { key: K; label: string }[]; value: K; dir: SortDir; onChoose: (key: K) => void }) {
  return (
    <div className="rsort" role="group" aria-label={t('並べ替え', 'Sort')}>
      {props.options.map((o) => {
        const on = props.value === o.key
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => props.onChoose(o.key)} title={on ? t('もう一度押すと、並びの向きが逆になります', 'Press again to reverse the order') : undefined}>
            {o.label}
            <span className="sortdir" aria-label={on ? (props.dir === 'desc' ? t('降順', 'Descending') : t('昇順', 'Ascending')) : undefined}>
              {on ? (props.dir === 'desc' ? '↓' : '↑') : ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}
