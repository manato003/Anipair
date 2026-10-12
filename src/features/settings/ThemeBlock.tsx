import { Choices, MotionNote } from '../../components/QuickSettings'
import { BRIGHTNESS, COLORS, MOTION, useThemePrefs } from '../../lib/displayPrefs'
import { Section, SettingRow } from './Section'

const TOD = [
  { value: true, label: 'する' },
  { value: false, label: 'しない' },
] as const
const HAND = [
  { value: 'right', label: '右手' },
  { value: 'left', label: '左手' },
] as const

// 画面の色・動きと、片手操作。どれも既定は自動（めんどうな人は触らなくてよい）。よく変えるものは、コントロールセンターでも変えられる
export function ThemeBlock() {
  const [prefs, choose] = useThemePrefs()
  return (
    // 見出しは画面の名前（表示）と重なるので付けず、行を並べる（#30）
    <Section id="settings-theme">
      <SettingRow label="テーマの色" hint="自動は、見ているクールの季節の色">
        <Choices label="テーマの色" choices={COLORS} value={prefs.color} onChoose={(v) => choose('color', v)} />
      </SettingRow>
      <SettingRow label="明るさ" hint="自動は端末の設定どおり">
        <Choices label="明るさ" choices={BRIGHTNESS} value={prefs.brightness} onChoose={(v) => choose('brightness', v)} />
      </SettingRow>
      <SettingRow label="時刻で色を変える" hint="深夜ほど少し暗く">
        <Choices label="時刻で色を変える" choices={TOD} value={prefs.tod} onChoose={(v) => choose('tod', v)} />
      </SettingRow>
      <SettingRow label="画面の動き" hint="自動は端末の「動きを減らす」どおり" after={<MotionNote motion={prefs.motion} />}>
        <Choices label="画面の動き" choices={MOTION} value={prefs.motion} onChoose={(v) => choose('motion', v)} />
      </SettingRow>
      <SettingRow label="片手操作" hint="よく押すボタンを親指の側に">
        <Choices label="片手操作" choices={HAND} value={prefs.hand} onChoose={(v) => choose('hand', v)} />
      </SettingRow>
    </Section>
  )
}
