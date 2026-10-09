import { nextSeason, previousSeason, sameSeason, seasonLabel, seasonOf, type Season } from '../lib/season'
import { OLDEST_SEASON } from '../features/rate/queue'
import { SeasonPicker } from './SeasonPicker'

// クールを選ぶまとまり（ブラウズと記録）: 前期・今期・来期の近道と、前後の矢印と年・季節。
// どれもクールを替える操作なので、離さずに1か所にまとめる。近道はいつも出しておき、見ているクールを塗る（押して消えると並びがずれる）。
// 来期の作品は放送前から Annict にあるので、来期まで選べる。
// allowAll: 「すべて」を選べる（記録。もともと全クールの一覧）。すべてのあいだは矢印・年・季節を薄くし、触るとそのクールで絞る
export function CourNav(props: { value: Season | null; onChange: (season: Season | null) => void; allowAll?: boolean }) {
  const today = seasonOf(new Date())
  const latest = nextSeason(today)
  const near: readonly { label: string; season: Season }[] = [
    { label: '前期', season: previousSeason(today) },
    { label: '今期', season: today },
    { label: '来期', season: latest },
  ]
  const value = props.value
  return (
    <div className={value ? 'cournav' : 'cournav cournav--all'}>
      <div className={props.allowAll ? 'cournav__near cournav__near--all' : 'cournav__near'} role="group" aria-label="近いクール">
        {props.allowAll && (
          <button type="button" aria-pressed={value === null} onClick={() => props.onChange(null)}>
            すべて
          </button>
        )}
        {near.map((n) => (
          <button key={n.label} type="button" aria-pressed={value !== null && sameSeason(value, n.season)} title={seasonLabel(n.season)} onClick={() => props.onChange(n.season)}>
            {n.label}
          </button>
        ))}
      </div>
      <SeasonPicker value={value ?? today} min={OLDEST_SEASON} max={latest} onChange={props.onChange} />
    </div>
  )
}
