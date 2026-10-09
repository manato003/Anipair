import { useState } from 'react'
import { applyEffectLevel, loadEffectLevel, saveEffectLevel, type EffectLevel } from '../../lib/storage'
import { Choices } from '../../components/QuickSettings'
import { EFFECTS } from '../../lib/displayPrefs'
import { Section } from './Section'


// 演出の強さ（10件ごとの表示・クールの踏破・称号の覚醒）。何百枚も答える人ほど、繰り返しの演出に飽きるので選べるようにする
export function EffectsBlock() {
  const [level, setLevel] = useState<EffectLevel>(loadEffectLevel)
  const choose = (next: EffectLevel) => {
    setLevel(next)
    saveEffectLevel(next)
    applyEffectLevel(next)
  }
  return (
    <Section id="settings-effects" title="演出" summary="答えた数の節目や、クールを踏破したときに出る演出の強さです。称号を手に入れたときの知らせは、「なし」でも動かさずに出します。">
      <Choices label="演出の強さ" choices={EFFECTS} value={level} onChoose={choose} />
      <p className="settings__lead">控えめは、火花や光の筋を出さずに表示だけを残します。なしは、10件ごとの表示を出さず、踏破や称号は動かさずに見せます。</p>
    </Section>
  )
}
