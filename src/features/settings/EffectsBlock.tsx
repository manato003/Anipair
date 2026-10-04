import { useState } from 'react'
import { applyEffectLevel, loadEffectLevel, saveEffectLevel, type EffectLevel } from '../../lib/storage'
import { Section } from './Section'

const LEVELS: readonly { level: EffectLevel; label: string }[] = [
  { level: 'full', label: 'ふつう' },
  { level: 'subtle', label: '控えめ' },
  { level: 'off', label: 'なし' },
]

// 演出の強さ（10件ごとの表示・クールの踏破・称号の覚醒）。何百枚も答える人ほど、繰り返しの演出に飽きるので選べるようにする
export function EffectsBlock() {
  const [level, setLevel] = useState<EffectLevel>(loadEffectLevel)
  const choose = (next: EffectLevel) => {
    setLevel(next)
    saveEffectLevel(next)
    applyEffectLevel(next)
  }
  return (
    <Section id="settings-effects" title="演出" summary="答えた数の節目や、クールを踏破したときに出る演出の強さです。">
      <div className="toggle" role="group" aria-label="演出の強さ">
        {LEVELS.map((l) => (
          <button key={l.level} type="button" aria-pressed={level === l.level} onClick={() => choose(l.level)}>
            {l.label}
          </button>
        ))}
      </div>
      <p className="settings__lead">控えめは、火花や光の筋を出さずに表示だけを残します。なしは、10件ごとの表示を出さず、踏破や称号は動かさずに見せます。</p>
    </Section>
  )
}
