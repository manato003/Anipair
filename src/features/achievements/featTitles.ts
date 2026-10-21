import { tx, type Text } from '../../lib/i18n'
import type { Rarity } from './rarity'
import type { Feats } from './titles'

// 出来事（その場で起きること）で付く隠し称号。起きたときに評価の画面で右上に知らせるので、称号の表（titles.ts）とは分けて最初に読む。
// 表の隠し称号（titles.ts の HIDDEN）も、ここから名前・条件・レア度を取る（id は保存に使うので変えない）
export const FEAT_TITLES: Record<keyof Feats, { id: string; name: Text; condition: Text; rarity: Rarity }> = {
  lateNight: { id: 'hidden-midnight', name: { ja: '丑三つ時の観測者', en: 'Witching Hour Observer' }, condition: { ja: '深夜2時から4時のあいだに記録した', en: 'Logged something between 2 and 4 a.m.' }, rarity: 'crimson' },
  oneNightCastle: { id: 'hidden-castle', name: { ja: '一夜城', en: 'Castle in a Night' }, condition: { ja: '一度に20本以上答えて、クールを踏破した', en: 'Answered 20 or more anime in one go and cleared a season' }, rarity: 'gold' },
  earlyMorning: { id: 'hidden-dawn-hour', name: { ja: '暁の観測者', en: 'Daybreak Observer' }, condition: { ja: '朝5時から7時のあいだに記録した', en: 'Logged something between 5 and 7 a.m.' }, rarity: 'bronze' },
  newYear: { id: 'hidden-new-year', name: { ja: '年越しの観測者', en: 'New Year’s Observer' }, condition: { ja: '元日に記録した', en: 'Logged something on New Year’s Day' }, rarity: 'silver' },
}

export function featTitle(feat: keyof Feats): { id: string; name: string; rarity: Rarity } {
  const h = FEAT_TITLES[feat]
  return { id: h.id, name: tx(h.name), rarity: h.rarity }
}
