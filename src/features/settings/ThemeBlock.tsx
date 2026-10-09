import { Choices, MotionNote } from '../../components/QuickSettings'
import { BRIGHTNESS, COLORS, MOTION, useThemePrefs } from '../../lib/displayPrefs'
import { Section } from './Section'

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
    <Section id="settings-theme" title="表示" summary="画面の色と明るさ、動き、片手で使うときのボタンの位置です。">
      <p className="settings__sub">テーマの色</p>
      <Choices label="テーマの色" choices={COLORS} value={prefs.color} onChoose={(v) => choose('color', v)} />
      <p className="settings__lead">自動は、いま見ているクールの季節の色です。</p>
      <p className="settings__sub">明るさ</p>
      <Choices label="明るさ" choices={BRIGHTNESS} value={prefs.brightness} onChoose={(v) => choose('brightness', v)} />
      <p className="settings__lead">自動は端末の設定に従います。もっと暗いは、黒に近い地です。</p>
      <p className="settings__sub">時刻で色を変える</p>
      <Choices label="時刻で色を変える" choices={TOD} value={prefs.tod} onChoose={(v) => choose('tod', v)} />
      <p className="settings__lead">深夜ほど、地が少し暗くなります。</p>
      <p className="settings__sub">画面の動き</p>
      <Choices label="画面の動き" choices={MOTION} value={prefs.motion} onChoose={(v) => choose('motion', v)} />
      <p className="settings__lead">自動は端末の「動きを減らす」設定に従います。答えたときに表紙が流れる動きや、画面が切り替わるときの動きです。</p>
      <MotionNote motion={prefs.motion} />
      <p className="settings__sub">片手操作</p>
      <Choices label="片手操作" choices={HAND} value={prefs.hand} onChoose={(v) => choose('hand', v)} />
      <p className="settings__lead">スマホを持つ手に合わせて、よく押すボタンを親指の届く側に寄せます。</p>
    </Section>
  )
}
