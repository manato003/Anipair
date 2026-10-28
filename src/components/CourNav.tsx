import type { ReactNode } from 'react'
import { nextSeason, previousSeason, sameSeason, seasonLabel, seasonOf, type Season } from '../lib/season'
import { OLDEST_SEASON } from '../features/rate/queue'
import { t } from '../lib/i18n'
import { SeasonPicker } from './SeasonPicker'

// クールを選ぶまとまり（ブラウズと記録）: 前期・今期・来期の近道と、前後の矢印と年・季節。
// どれもクールを替える操作なので、離さずに1か所にまとめる。近道はいつも出しておき、見ているクールを塗る（押して消えると並びがずれる）。
// 来期の作品は放送前から Annict にあるので、来期まで選べる。
// allowAll: 「すべて」を選べる（記録。もともと全クールの一覧）。すべてのあいだは矢印・年・季節を薄くし、触るとそのクールで絞る
// lead: 近道の前に置くもの（PC の帯の検索）。近道と1つのまとまりにして、年・季節を帯の中央に置けるようにする（browse.css）
export function CourNav(props: { value: Season | null; onChange: (season: Season | null) => void; allowAll?: boolean; lead?: ReactNode }) {
  const today = seasonOf(new Date())
  const latest = nextSeason(today)
  const near: readonly { label: string; season: Season }[] = [
    { label: t('前期', 'Last season'), season: previousSeason(today) },
    { label: t('今期', 'This season'), season: today },
    { label: t('来期', 'Next season'), season: latest },
  ]
  const value = props.value
  const nearGroup = (
    <div className={props.allowAll ? 'cournav__near cournav__near--all' : 'cournav__near'} role="group" aria-label={t('近いクール', 'Nearby seasons')}>
      {props.allowAll && (
        <button type="button" aria-pressed={value === null} onClick={() => props.onChange(null)}>
          {t('すべて', 'All')}
        </button>
      )}
      {near.map((n) => (
        <button key={n.label} type="button" aria-pressed={value !== null && sameSeason(value, n.season)} title={seasonLabel(n.season)} onClick={() => props.onChange(n.season)}>
          {n.label}
        </button>
      ))}
    </div>
  )
  return (
    <div className={value ? 'cournav' : 'cournav cournav--all'}>
      {props.lead ? (
        <div className="cournav__lead">
          {props.lead}
          {nearGroup}
        </div>
      ) : (
        nearGroup
      )}
      <SeasonPicker value={value ?? today} min={OLDEST_SEASON} max={latest} onChange={props.onChange} />
    </div>
  )
}
