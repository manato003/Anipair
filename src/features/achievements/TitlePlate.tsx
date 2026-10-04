import type { Rarity } from './titles'

// 称号の名札。金属の縁と字、上の紋章（金以上）、左右の装飾。レア度は色と装飾だけで見せる（文字は出さない）。
// 色と装飾はレア度ごと（styles/achievements.css の .rarity--* と .plate）。まだ手に入れていないものは灰色にする
export function TitlePlate(props: { name: string; rarity: Rarity; locked?: boolean; size?: 'sm' | 'lg' }) {
  const cls = ['plate', `rarity--${props.rarity}`, props.size ? `plate--${props.size}` : '', props.locked ? 'plate--locked' : ''].filter(Boolean).join(' ')
  return (
    <span className={cls}>
      <span className="plate__crest" aria-hidden />
      <span className="plate__side" aria-hidden />
      <span className="plate__bar">
        <span className="plate__name">{props.name}</span>
      </span>
      <span className="plate__side plate__side--r" aria-hidden />
    </span>
  )
}
