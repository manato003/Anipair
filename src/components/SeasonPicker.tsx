import {
  SEASON_NAMES,
  clampSeason,
  compareSeasons,
  nextSeason,
  previousSeason,
  sameSeason,
  seasonNameLabel,
  yearsDescending,
  type Season,
  type SeasonName,
} from '../lib/season'

interface Props {
  value: Season
  // 選べる範囲（両端を含む）
  min: Season
  max: Season
  // 年・クールのプルダウンで選んだとき。範囲に収めてから渡す
  onChange: (season: Season) => void
  // ‹ › の1期送り。画面ごとの動き（空のクールを飛ばすなど）に合わせられるよう、渡さなければ onChange に1期ぶん進めた値を渡す
  onPrevious?: () => void
  onNext?: () => void
}

// ‹ 年 ▾ 季節 ▾ › 。遠いクールへはプルダウンで、隣へは ‹ › で動く。
// プルダウンは端末の標準の部品（スマホでは OS の選択画面が開く）
export function SeasonPicker({ value, min, max, onChange, onPrevious, onNext }: Props) {
  const shown = clampSeason(value, min, max)
  const years = yearsDescending(min, max)

  const pick = (next: Season) => {
    const target = clampSeason(next, min, max)
    if (!sameSeason(target, shown)) onChange(target)
  }
  const outOfRange = (name: SeasonName) => {
    const s = { year: shown.year, name }
    return compareSeasons(s, min) < 0 || compareSeasons(s, max) > 0
  }

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={onPrevious ?? (() => pick(previousSeason(shown)))}
        disabled={compareSeasons(shown, min) <= 0}
        aria-label="前のクール"
      >
        ‹
      </button>
      <div className="stepper__selects">
        <span className="stepper__select">
          <select aria-label="年" value={shown.year} onChange={(e) => pick({ year: Number(e.target.value), name: shown.name })}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
        </span>
        <span className="stepper__select">
          <select aria-label="季節" value={shown.name} onChange={(e) => pick({ year: shown.year, name: e.target.value as SeasonName })}>
            {SEASON_NAMES.map((name) => (
              <option key={name} value={name} disabled={outOfRange(name)}>
                {seasonNameLabel(name)}
              </option>
            ))}
          </select>
        </span>
      </div>
      <button
        type="button"
        className="stepper__btn"
        onClick={onNext ?? (() => pick(nextSeason(shown)))}
        disabled={compareSeasons(shown, max) >= 0}
        aria-label="次のクール"
      >
        ›
      </button>
    </div>
  )
}
