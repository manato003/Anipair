import { t } from '../../lib/i18n'

// マッチングの候補の絞り込み条件（形式と放送年）。端末に保存する

export type FormatGroup = 'tv' | 'movie' | 'ova'

export const FORMAT_GROUPS: readonly { id: FormatGroup; label: string; formats: readonly string[] }[] = [
  { id: 'tv', label: 'TV', formats: ['TV'] },
  { id: 'movie', get label() { return t('劇場版', 'Movie') }, formats: ['MOVIE'] },
  { id: 'ova', get label() { return t('OVA・配信', 'OVA / ONA') }, formats: ['OVA', 'ONA'] },
]

// null は「すべて」
export const FROM_YEARS: readonly { year: number | null; label: string }[] = [
  { year: null, get label() { return t('すべて', 'All') } },
  { year: 2000, get label() { return t('2000年以降', '2000 or later') } },
  { year: 2010, get label() { return t('2010年以降', '2010 or later') } },
  { year: 2020, get label() { return t('2020年以降', '2020 or later') } },
]

export interface MatchFilter {
  // 1つ以上（0にはしない）
  formats: FormatGroup[]
  fromYear: number | null
}

export const DEFAULT_FILTER: MatchFilter = { formats: FORMAT_GROUPS.map((g) => g.id), fromYear: null }

export function isDefaultFilter(f: MatchFilter): boolean {
  return f.fromYear === null && FORMAT_GROUPS.every((g) => f.formats.includes(g.id))
}

// 保存された値を検証して読む。壊れていれば既定に戻す（形式が0個・知らない年もここで弾く）
export function parseMatchFilter(value: unknown): MatchFilter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_FILTER, formats: [...DEFAULT_FILTER.formats] }
  const { formats, fromYear } = value as Record<string, unknown>
  const ids = FORMAT_GROUPS.map((g) => g.id)
  const picked = Array.isArray(formats) ? ids.filter((id) => formats.includes(id)) : []
  const year = FROM_YEARS.some((y) => y.year === fromYear) ? (fromYear as number | null) : null
  return { formats: picked.length > 0 ? picked : [...ids], fromYear: year }
}

// 条件に合う作品か。形式や放送年が分からない作品は、その条件が「すべて」のときだけ通す
export function matchesFilter(m: { format: string | null; seasonYear: number | null }, f: MatchFilter): boolean {
  if (f.formats.length < FORMAT_GROUPS.length) {
    const group = m.format ? FORMAT_GROUPS.find((g) => g.formats.includes(m.format!)) : undefined
    if (!group || !f.formats.includes(group.id)) return false
  }
  if (f.fromYear !== null && (m.seasonYear === null || m.seasonYear < f.fromYear)) return false
  return true
}
