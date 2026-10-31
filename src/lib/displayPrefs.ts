import { useState } from 'react'
import { t } from './i18n'
import type { ButtonLabels, EffectLevel } from './storage'
import { applyTheme, loadTheme, saveTheme, type ThemePrefs } from './theme'

// 表示の設定の選択肢（設定の「表示」と、コントロールセンターのクイック設定で同じものを使う）
// label は取り出したときの言語で返す（getter。ファイルの外側で t() を呼ばないため）
export const COLORS = [
  { value: 'auto', get label() { return t('自動', 'Auto') } },
  { value: 'spring', get label() { return t('春', 'Spring') } },
  { value: 'summer', get label() { return t('夏', 'Summer') } },
  { value: 'autumn', get label() { return t('秋', 'Fall') } },
  { value: 'winter', get label() { return t('冬', 'Winter') } },
  { value: 'night', get label() { return t('夜', 'Night') } },
] as const satisfies readonly { value: ThemePrefs['color']; label: string }[]
export const BRIGHTNESS = [
  { value: 'auto', get label() { return t('自動', 'Auto') } },
  { value: 'light', get label() { return t('明るい', 'Light') } },
  { value: 'dark', get label() { return t('暗い', 'Dark') } },
  { value: 'darker', get label() { return t('もっと暗い', 'Darker') } },
] as const satisfies readonly { value: ThemePrefs['brightness']; label: string }[]
export const MOTION = [
  { value: 'auto', get label() { return t('自動', 'Auto') } },
  { value: 'on', get label() { return t('動かす', 'On') } },
  { value: 'reduce', get label() { return t('減らす', 'Reduce') } },
] as const satisfies readonly { value: ThemePrefs['motion']; label: string }[]
export const BUTTON_LABELS = [
  { value: 'both', get label() { return t('アイコンと名前', 'Icon and name') } },
  { value: 'icon', get label() { return t('アイコンだけ', 'Icon only') } },
  { value: 'text', get label() { return t('名前だけ', 'Name only') } },
] as const satisfies readonly { value: ButtonLabels; label: string }[]
export const EFFECTS = [
  { value: 'full', get label() { return t('ふつう', 'Normal') } },
  { value: 'subtle', get label() { return t('控えめ', 'Subtle') } },
  { value: 'off', get label() { return t('なし', 'Off') } },
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
