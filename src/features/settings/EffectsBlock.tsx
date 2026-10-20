import { useState } from 'react'
import { applyEffectLevel, loadEffectLevel, saveEffectLevel, type EffectLevel } from '../../lib/storage'
import { Choices } from '../../components/QuickSettings'
import { EFFECTS } from '../../lib/displayPrefs'
import { t } from '../../lib/i18n'
import { Section, SettingRow } from './Section'


// 演出の強さ（10件ごとの表示・クールの踏破・称号の覚醒）。何百枚も答える人ほど、繰り返しの演出に飽きるので選べるようにする
export function EffectsBlock() {
  const [level, setLevel] = useState<EffectLevel>(loadEffectLevel)
  const choose = (next: EffectLevel) => {
    setLevel(next)
    saveEffectLevel(next)
    applyEffectLevel(next)
  }
  return (
    <Section id="settings-effects">
      <SettingRow label={t('演出', 'Effects')} hint={t('答えた数の節目や、踏破のときの演出', 'Effects at answer-count milestones and when you finish a season')}>
        <Choices label={t('演出の強さ', 'Effect level')} choices={EFFECTS} value={level} onChoose={choose} />
      </SettingRow>
    </Section>
  )
}
