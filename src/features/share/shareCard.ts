import type { Rarity } from '../achievements/titles'
import { genreName } from '../match/taste'
import { AXIS_LABEL } from '../../lib/reviewOps'
import type { Affinity, AxisWeight, GenreAxis, Summary, YearReview } from '../records/trends'

// 共有の画像（傾向のまとめ・称号）の中身。端末の中で canvas に描く（drawShareCard.ts）。サーバーには送らない。
// 作品の表紙は入れない（権利は各権利者にあり、外に出す画像には使わない）。ここは中身を決めるだけの純粋な関数

export const SHARE_URL = 'https://anipair.vercel.app/'

export const RARITY_LABEL: Record<Rarity, string> = {
  bronze: '銅',
  silver: '銀',
  gold: '金',
  amethyst: '紫晶',
  crimson: '紅',
  radiant: '虹',
  origin: '特別',
}

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
    { label: '見た作品', value: `${i.summary.watched}本` },
    { label: '評価した作品', value: `${i.summary.rated}本` },
    ...(i.summary.completion !== null ? [{ label: '完走率', value: `${Math.round(i.summary.completion * 100)}%` }] : []),
  ]
  const radar =
    i.genres.length >= 3 ? i.genres.map((g) => ({ label: genreName(g.name), value: g.average === null ? 0 : Math.max(0, Math.min(1, (g.average - 2) / 2)) })) : null
  const liked = [...i.genres].filter((g) => g.average !== null).sort((a, b) => b.average! - a.average! || b.count - a.count)
  const facts: ShareCard['facts'] = []
  if (i.harsh) facts.push({ label: '評価のくせ', value: `${i.harsh.label}（${i.harsh.diff >= 0 ? '+' : '−'}${Math.abs(i.harsh.diff).toFixed(1)}点）` })
  if (liked.length > 0) facts.push({ label: '高く評価するジャンル', value: liked.slice(0, 3).map((g) => genreName(g.name)).join('・') })
  if (i.golden) facts.push({ label: '黄金期', value: `${i.golden.from}〜${i.golden.to}年` })
  if (i.major) facts.push({ label: 'タイプ', value: i.major.label })
  if (i.affinity && i.affinity.liked.length > 0) facts.push({ label: '隠れ推しの声優', value: i.affinity.liked.slice(0, 3).map((a) => a.name).join(' / ') })
  if (i.topAxis) facts.push({ label: '重視する観点', value: AXIS_LABEL[i.topAxis.key] })
  return {
    headline: '私のアニメの傾向',
    title: i.title,
    kpis,
    radar,
    facts: facts.slice(0, 6),
    footer: 'あなたの傾向も',
    text: `Anipair で、私のアニメの傾向を図にしました。\n${SHARE_URL}\n#Anipair`,
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
    headline: '私の称号',
    title: i.title,
    kpis: [
      { label: '称号', value: `${i.unlocked} / ${i.total}` },
      { label: '隠し称号', value: `${i.hiddenUnlocked} / ${i.hiddenTotal}` },
    ],
    radar: null,
    facts: i.best.slice(0, 5).map((t) => ({ label: RARITY_LABEL[t.rarity], value: t.name, rarity: t.rarity })),
    footer: 'あなたも称号を',
    text: `Anipair で手に入れた称号です。\n${SHARE_URL}\n#Anipair`,
  }
}

// 年間のふり返り。作品は題名だけ（表紙は入れない）
export function yearShare(y: YearReview, title: { name: string; rarity: Rarity } | null): ShareCard {
  const facts: ShareCard['facts'] = []
  if (y.best.length > 0) facts.push({ label: 'いちばん良かった作品', value: y.best.slice(0, 3).map((r) => r.entry.title).join(' / ') })
  if (y.busiest) facts.push({ label: 'いちばん見た月', value: `${y.busiest.month}月（${y.busiest.count}本）` })
  if (y.genres.length > 0) facts.push({ label: 'よく見たジャンル', value: y.genres.map((g) => genreName(g.name)).join('・') })
  if (y.casts.length > 0) facts.push({ label: 'よく見た声優', value: y.casts.map((c) => c.name).join(' / ') })
  return {
    headline: `${y.year}年のアニメ`,
    title,
    kpis: [
      { label: '見た作品', value: `${y.watched}本` },
      { label: '評価した作品', value: `${y.rated}本` },
      ...(y.average !== null ? [{ label: '平均評価（4点）', value: y.average.toFixed(1) }] : []),
    ],
    radar: null,
    facts,
    footer: 'あなたの1年も',
    text: `Anipair で、${y.year}年に見たアニメをふり返りました。\n${SHARE_URL}\n#Anipair`,
  }
}
