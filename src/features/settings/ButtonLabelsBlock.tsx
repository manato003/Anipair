import { useState } from 'react'
import { applyButtonLabels, loadButtonLabels, saveButtonLabels, type ButtonLabels } from '../../lib/storage'
import { Choices } from '../../components/QuickSettings'
import { BUTTON_LABELS } from '../../lib/displayPrefs'
import { Section, SettingRow } from './Section'


// 評価とマッチングの答えのボタンの見せ方。初めはアイコンと名前を並べて、アイコンの意味を覚えてもらう。
// 慣れた人は名前を消してすっきりさせ、アイコンが合わない人は名前だけにできる
export function ButtonLabelsBlock() {
  const [value, setValue] = useState<ButtonLabels>(loadButtonLabels)
  const choose = (next: ButtonLabels) => {
    setValue(next)
    saveButtonLabels(next)
    applyButtonLabels(next)
  }
  return (
    <Section id="settings-buttons">
      <SettingRow label="答えのボタン" hint="アイコンだけでも、PCは重ねると名前が出ます">
        <Choices label="ボタンの表示" choices={BUTTON_LABELS} value={value} onChoose={choose} />
      </SettingRow>
    </Section>
  )
}
