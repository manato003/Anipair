import { t } from '../../lib/i18n'

// 称号のレア度（評価の画面とコントロールセンターでも使うので、称号の表 titles.ts とは分けて小さく持つ。表は記録の画面で読む）

// レア度。名札の色と装飾が変わる（styles/achievements.css の .plate--*）。並びは低い順。
// 色はゲームのレア度とランクの決まりに寄せた（原神・鳴潮の星の色、Valorant・Apex・LoL のランクの色）
// origin は特別な称号（Annict を創った人だけ）専用
export const RARITIES = ['bronze', 'silver', 'gold', 'amethyst', 'crimson', 'radiant', 'origin'] as const
export type Rarity = (typeof RARITIES)[number]

// レア度の呼び名（共有の画像と、God モードの試しの知らせ）
// 他のファイルから使われる定数なので、getter にして読んだときの言語で返す
export const RARITY_LABEL: Record<Rarity, string> = {
  get bronze() {
    return t('銅', 'Bronze')
  },
  get silver() {
    return t('銀', 'Silver')
  },
  get gold() {
    return t('金', 'Gold')
  },
  get amethyst() {
    return t('紫晶', 'Amethyst')
  },
  get crimson() {
    return t('紅', 'Crimson')
  },
  get radiant() {
    return t('虹', 'Radiant')
  },
  get origin() {
    return t('特別', 'Special')
  },
}
