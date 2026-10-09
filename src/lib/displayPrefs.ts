import { useState } from 'react'
import type { ButtonLabels, EffectLevel } from './storage'
import { applyTheme, loadTheme, saveTheme, type ThemePrefs } from './theme'

// 表示の設定の選択肢（設定の「表示」と、コントロールセンターのクイック設定で同じものを使う）
export const COLORS = [
  { value: 'auto', label: '自動' },
  { value: 'spring', label: '春' },
  { value: 'summer', label: '夏' },
  { value: 'autumn', label: '秋' },
  { value: 'winter', label: '冬' },
] as const satisfies readonly { value: ThemePrefs['color']; label: string }[]
export const BRIGHTNESS = [
  { value: 'auto', label: '自動' },
  { value: 'light', label: '明るい' },
  { value: 'dark', label: '暗い' },
  { value: 'darker', label: 'もっと暗い' },
] as const satisfies readonly { value: ThemePrefs['brightness']; label: string }[]
export const MOTION = [
  { value: 'auto', label: '自動' },
  { value: 'on', label: '動かす' },
  { value: 'reduce', label: '減らす' },
] as const satisfies readonly { value: ThemePrefs['motion']; label: string }[]
export const BUTTON_LABELS = [
  { value: 'both', label: 'アイコンと名前' },
  { value: 'icon', label: 'アイコンだけ' },
  { value: 'text', label: '名前だけ' },
] as const satisfies readonly { value: ButtonLabels; label: string }[]
export const EFFECTS = [
  { value: 'full', label: 'ふつう' },
  { value: 'subtle', label: '控えめ' },
  { value: 'off', label: 'なし' },
] as const satisfies readonly { value: EffectLevel; label: string }[]

// 選んだら保存して、すぐ画面に効かせる
export function useThemePrefs(): [ThemePrefs, <K extends keyof ThemePrefs>(key: K, value: ThemePrefs[K]) => void] {
  const [prefs, setPrefs] = useState<ThemePrefs>(loadTheme)
  const choose = <K extends keyof ThemePrefs>(key: K, value: ThemePrefs[K]) => {
    const next = { ...loadTheme(), [key]: value }
    setPrefs(next)
    saveTheme(next)
    applyTheme(next)
  }
  return [prefs, choose]
}
