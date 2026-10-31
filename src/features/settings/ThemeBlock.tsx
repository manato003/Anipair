import { Choices, MotionNote } from '../../components/QuickSettings'
import { LangChoices } from '../../components/LangToggle'
import { BRIGHTNESS, COLORS, MOTION, useThemePrefs } from '../../lib/displayPrefs'
import { t } from '../../lib/i18n'
import { Section, SettingRow } from './Section'

const TOD = [
  { value: true, get label() { return t('する', 'On') } },
  { value: false, get label() { return t('しない', 'Off') } },
] as const
const HAND = [
  { value: 'right', get label() { return t('右手', 'Right') } },
  { value: 'left', get label() { return t('左手', 'Left') } },
] as const

// 画面の色・動きと、片手操作。どれも既定は自動（めんどうな人は触らなくてよい）。よく変えるものは、コントロールセンターでも変えられる
export function ThemeBlock() {
  const [prefs, choose] = useThemePrefs()
  return (
    // 見出しは画面の名前（表示）と重なるので付けず、行を並べる
    <Section id="settings-theme">
      {/* 見出しは両方の言語で（読めない言語になっていても見つけられるように） */}
      <SettingRow label="言語 / Language"> {/* i18n-ok */}
        <LangChoices />
      </SettingRow>
      <SettingRow label={t('テーマの色', 'Theme color')} hint={t('自動は見ているクールの季節の色', 'Auto uses the color of the season you’re viewing')}>
        <Choices label={t('テーマの色', 'Theme color')} choices={COLORS} value={prefs.color} onChoose={(v) => choose('color', v)} />
      </SettingRow>
      <SettingRow label={t('明るさ', 'Brightness')} hint={prefs.color === 'night' ? t('夜の色は、いつも暗い地です', 'Night is always dark') : undefined}>
        <Choices label={t('明るさ', 'Brightness')} choices={BRIGHTNESS} value={prefs.brightness} onChoose={(v) => choose('brightness', v)} />
      </SettingRow>
      <SettingRow label={t('時刻で色を変える', 'Shift color by time of day')} hint={t('深夜ほど少し暗く', 'A little darker late at night')}>
        <Choices label={t('時刻で色を変える', 'Shift color by time of day')} choices={TOD} value={prefs.tod} onChoose={(v) => choose('tod', v)} />
      </SettingRow>
      <SettingRow label={t('画面の動き', 'Motion')} after={<MotionNote motion={prefs.motion} />}>
        <Choices label={t('画面の動き', 'Motion')} choices={MOTION} value={prefs.motion} onChoose={(v) => choose('motion', v)} />
      </SettingRow>
      <SettingRow label={t('片手操作', 'One-handed mode')} hint={t('よく押すボタンを親指の側に', 'Puts the buttons you press most on your thumb’s side')}>
        <Choices label={t('片手操作', 'One-handed mode')} choices={HAND} value={prefs.hand} onChoose={(v) => choose('hand', v)} />
      </SettingRow>
    </Section>
  )
}
