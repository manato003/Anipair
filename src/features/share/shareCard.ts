import { RARITY_LABEL, type Rarity } from '../achievements/titles'
import { personName, workTitle } from '../../lib/names'
export { RARITY_LABEL }
import { genreName } from '../match/taste'
import { AXIS_LABEL } from '../../lib/reviewOps'
import { t } from '../../lib/i18n'
import { joinList, monthName, type Affinity, type AxisWeight, type GenreAxis, type Summary, type YearReview } from '../records/trends'

// 共有の画像（傾向のまとめ・称号）の中身。端末の中で canvas に描く（drawShareCard.ts）。サーバーには送らない。
// 作品の表紙は入れない（権利は各権利者にあり、外に出す画像には使わない）。ここは中身を決めるだけの純粋な関数

export const SHARE_URL = 'https://anipair.com/'


export interface ShareCard {
  headline: string
  title: { name: string; rarity: Rarity } | null
  // 大きな数（3つまで）
  kpis: { label: string; value: string }[]
  // ジャンルの好みのレーダー（値は 0〜1。3軸以上のときだけ）
  radar: { label: string; value: number }[] | null
  // 一言ずつの特徴（6つまで）。rarity があれば、その色の印を付ける（称号）
  facts: { label: string; value: string; rarity?: Rarity }[]
  // 画像のいちばん下の一言（アプリの URL の前に置く）
  footer: string
  // 投稿に添える文
  text: string
}

export interface TrendsShareInput {
  summary: Summary
  harsh: { diff: number; label: string } | null
  genres: readonly GenreAxis[]
  golden: { from: number; to: number } | null
  major: { label: string } | null
  affinity: { liked: readonly Affinity[] } | null
  topAxis: AxisWeight | null
  title: { name: string; rarity: Rarity } | null
}

export function trendsShare(i: TrendsShareInput): ShareCard {
  const kpis = [
    { label: t('見た作品', 'Watched'), value: t(`${i.summary.watched}本`, `${i.summary.watched} anime`) },
    { label: t('評価した作品', 'Rated'), value: t(`${i.summary.rated}本`, `${i.summary.rated} anime`) },
    ...(i.summary.completion !== null ? [{ label: t('完走率', 'Completion rate'), value: `${Math.round(i.summary.completion * 100)}%` }] : []),
  ]
  const radar =
    i.genres.length >= 3 ? i.genres.map((g) => ({ label: genreName(g.name), value: g.average === null ? 0 : Math.max(0, Math.min(1, (g.average - 2) / 2)) })) : null
  const liked = [...i.genres].filter((g) => g.average !== null).sort((a, b) => b.average! - a.average! || b.count - a.count)
  const facts: ShareCard['facts'] = []
  if (i.harsh) {
    const sign = i.harsh.diff >= 0 ? '+' : '−'
    const diff = Math.abs(i.harsh.diff).toFixed(1)
    facts.push({ label: t('評価のくせ', 'Rating tendency'), value: t(`${i.harsh.label}（${sign}${diff}点）`, `${i.harsh.label} (${sign}${diff} pts)`) })
  }
  if (liked.length > 0) facts.push({ label: t('高く評価するジャンル', 'Top-rated genres'), value: joinList(liked.slice(0, 3).map((g) => genreName(g.name))) })
  if (i.golden) facts.push({ label: t('黄金期', 'Golden era'), value: t(`${i.golden.from}〜${i.golden.to}年`, `${i.golden.from}–${i.golden.to}`) })
  if (i.major) facts.push({ label: t('タイプ', 'Type'), value: i.major.label })
  if (i.affinity && i.affinity.liked.length > 0) facts.push({ label: t('隠れ推しの声優', 'Voice actors I secretly love'), value: i.affinity.liked.slice(0, 3).map((a) => a.name).join(' / ') })
  if (i.topAxis) facts.push({ label: t('重視する観点', 'What I value most'), value: AXIS_LABEL[i.topAxis.key] })
  return {
    headline: t('私のアニメの傾向', 'My anime taste'),
    title: i.title,
    kpis,
    radar,
    facts: facts.slice(0, 6),
    footer: t('あなたの傾向も', 'See your own taste'),
    text: t(`Anipairで私のアニメの傾向を図にしました。\n${SHARE_URL}\n#Anipair`, `I charted my anime taste on Anipair.\n${SHARE_URL}\n#Anipair`),
  }
}

export interface ProfileShareInput {
  title: { name: string; rarity: Rarity } | null
  unlocked: number
  total: number
  hiddenUnlocked: number
  hiddenTotal: number
  // 手に入れた称号（レア度の高い順）
  best: readonly { name: string; rarity: Rarity }[]
}

export function profileShare(i: ProfileShareInput): ShareCard {
  return {
    headline: t('私の称号', 'My titles'),
    title: i.title,
    kpis: [
      { label: t('称号', 'Titles'), value: `${i.unlocked} / ${i.total}` },
      { label: t('隠し称号', 'Hidden titles'), value: `${i.hiddenUnlocked} / ${i.hiddenTotal}` },
    ],
    radar: null,
    facts: i.best.slice(0, 5).map((b) => ({ label: RARITY_LABEL[b.rarity], value: b.name, rarity: b.rarity })),
    footer: t('あなたも称号を', 'Earn your own titles'),
    text: t(`Anipairで手に入れた称号です。\n${SHARE_URL}\n#Anipair`, `Titles I earned on Anipair.\n${SHARE_URL}\n#Anipair`),
  }
}

// 年間のふり返り。作品は題名だけ（表紙は入れない）
export function yearShare(y: YearReview, title: { name: string; rarity: Rarity } | null): ShareCard {
  const facts: ShareCard['facts'] = []
  if (y.best.length > 0) facts.push({ label: t('いちばん良かった作品', 'My best anime'), value: y.best.slice(0, 3).map((r) => workTitle(r.entry)).join(' / ') })
  if (y.busiest) facts.push({ label: t('いちばん見た月', 'Busiest month'), value: t(`${y.busiest.month}月（${y.busiest.count}本）`, `${monthName(y.busiest.month)} (${y.busiest.count} anime)`) })
  if (y.genres.length > 0) facts.push({ label: t('よく見たジャンル', 'Most-watched genres'), value: joinList(y.genres.map((g) => genreName(g.name))) })
  if (y.casts.length > 0) facts.push({ label: t('よく見た声優', 'Most-watched voice actors'), value: y.casts.map((c) => personName({ name: c.name })).join(' / ') })
  return {
    headline: t(`${y.year}年のアニメ`, `My ${y.year} in anime`),
    title,
    kpis: [
      { label: t('見た作品', 'Watched'), value: t(`${y.watched}本`, `${y.watched} anime`) },
      { label: t('評価した作品', 'Rated'), value: t(`${y.rated}本`, `${y.rated} anime`) },
      ...(y.average !== null ? [{ label: t('平均評価（4点）', 'Average rating (1–4)'), value: y.average.toFixed(1) }] : []),
    ],
    radar: null,
    facts,
    footer: t('あなたの1年も', 'Look back on your year'),
    text: t(`Anipairで${y.year}年に見たアニメをふり返りました。\n${SHARE_URL}\n#Anipair`, `I looked back on the anime I watched in ${y.year} on Anipair.\n${SHARE_URL}\n#Anipair`),
  }
}
