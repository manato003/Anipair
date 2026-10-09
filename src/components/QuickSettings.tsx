import { useState } from 'react'
import { BRIGHTNESS, BUTTON_LABELS, COLORS, EFFECTS, MOTION, useThemePrefs } from '../lib/displayPrefs'
import { applyButtonLabels, applyEffectLevel, loadButtonLabels, loadEffectLevel, saveButtonLabels, saveEffectLevel, type ButtonLabels, type EffectLevel } from '../lib/storage'
import { systemReducesMotion, type ThemePrefs } from '../lib/theme'

export function Choices<T extends string | boolean>(props: { label: string; choices: readonly { value: T; label: string }[]; value: T; onChoose: (value: T) => void }) {
  return (
    <div className="toggle" role="group" aria-label={props.label}>
      {props.choices.map((c) => (
        <button key={String(c.value)} type="button" aria-pressed={props.value === c.value} onClick={() => props.onChoose(c.value)}>
          {c.label}
        </button>
      ))}
    </div>
  )
}

// 端末の「動きを減らす」で止まっているときの一言（自動のときだけ）
export function MotionNote({ motion }: { motion: ThemePrefs['motion'] }) {
  if (motion !== 'auto' || !systemReducesMotion()) return null
  return <p className="settings__lead settings__lead--notice">この端末は「動きを減らす」設定になっているので、画面の動きを止めています。動きを見たいときは「動かす」を選んでください。</p>
}

// コントロールセンターのクイック設定（画面を離れずに、よく変えるものだけ）
export function QuickSettings() {
  const [prefs, choose] = useThemePrefs()
  const [labels, setLabels] = useState<ButtonLabels>(loadButtonLabels)
  const [effects, setEffects] = useState<EffectLevel>(loadEffectLevel)
  return (
    <div className="quick">
      <p className="quick__label">テーマの色</p>
      <Choices label="テーマの色" choices={COLORS} value={prefs.color} onChoose={(v) => choose('color', v)} />
      <p className="quick__label">明るさ</p>
      <Choices label="明るさ" choices={BRIGHTNESS} value={prefs.brightness} onChoose={(v) => choose('brightness', v)} />
      <p className="quick__label">画面の動き</p>
      <Choices label="画面の動き" choices={MOTION} value={prefs.motion} onChoose={(v) => choose('motion', v)} />
      <MotionNote motion={prefs.motion} />
      <p className="quick__label">ボタンの表示</p>
      <Choices
        label="ボタンの表示"
        choices={BUTTON_LABELS}
        value={labels}
        onChoose={(v) => {
          setLabels(v)
          saveButtonLabels(v)
          applyButtonLabels(v)
        }}
      />
      <p className="quick__label">演出</p>
      <Choices
        label="演出の強さ"
        choices={EFFECTS}
        value={effects}
        onChoose={(v) => {
          setEffects(v)
          saveEffectLevel(v)
          applyEffectLevel(v)
        }}
      />
    </div>
  )
}
