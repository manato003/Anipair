import { FORMAT_GROUPS, FROM_YEARS, type FormatGroup, type MatchFilter } from './matchFilter'

// マッチングの絞り込み（形式と放送年）。変えても提案は作り直さない（次に提案するときに効く）
export function MatchFilterControls(props: { filter: MatchFilter; onChange: (next: MatchFilter) => void }) {
  const { filter } = props

  function toggle(id: FormatGroup) {
    const on = filter.formats.includes(id)
    // 形式は1つ以上を残す
    if (on && filter.formats.length === 1) return
    const formats = FORMAT_GROUPS.map((g) => g.id).filter((g) => (g === id ? !on : filter.formats.includes(g)))
    props.onChange({ ...filter, formats })
  }

  return (
    <div className="filter">
      <fieldset className="filter__group">
        <legend className="detail__label">形式</legend>
        <div className="filter__options">
          {FORMAT_GROUPS.map((g) => {
            const on = filter.formats.includes(g.id)
            return (
              <label key={g.id} className="filter__option">
                <input type="checkbox" checked={on} disabled={on && filter.formats.length === 1} onChange={() => toggle(g.id)} />
                {g.label}
              </label>
            )
          })}
        </div>
      </fieldset>
      <label className="filter__group">
        <span className="detail__label">放送年</span>
        <select
          value={filter.fromYear ?? ''}
          onChange={(e) => props.onChange({ ...filter, fromYear: e.target.value === '' ? null : Number(e.target.value) })}
        >
          {FROM_YEARS.map((y) => (
            <option key={y.label} value={y.year ?? ''}>
              {y.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
