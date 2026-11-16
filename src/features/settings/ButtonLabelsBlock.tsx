import { useEffect, useState } from 'react'
import { applyButtonLabels, loadButtonLabels, saveButtonLabels, subscribeDisplayPrefs, type ButtonLabels } from '../../lib/storage'
import { Choices } from '../../components/QuickSettings'
import { BUTTON_LABELS } from '../../lib/displayPrefs'
import { t } from '../../lib/i18n'
import { Section, SettingRow } from './Section'


// 評価とマッチングの答えのボタンの見せ方。初めはアイコンと名前を並べて、アイコンの意味を覚えてもらう。
// 慣れた人は名前を消してすっきりさせ、アイコンが合わない人は名前だけにできる
export function ButtonLabelsBlock() {
  const [value, setValue] = useState<ButtonLabels>(loadButtonLabels)
  // コントロールセンターで変えたときも、押されている印を追いかける
  useEffect(() => subscribeDisplayPrefs(() => setValue(loadButtonLabels())), [])
  const choose = (next: ButtonLabels) => {
    setValue(next)
    saveButtonLabels(next)
    applyButtonLabels(next)
  }
  return (
    <Section id="settings-buttons">
      <SettingRow label={t('答えのボタン', 'Answer buttons')} hint={t('アイコンだけでも、PCは重ねると名前が出ます', 'Even with icons only, hovering shows the name on a PC')}>
        <Choices label={t('ボタンの表示', 'Button display')} choices={BUTTON_LABELS} value={value} onChoose={choose} />
      </SettingRow>
    </Section>
  )
}
