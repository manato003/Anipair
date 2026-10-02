// 放送クール。Annict は "2026-summer" の形で受け取る
export type SeasonName = 'winter' | 'spring' | 'summer' | 'autumn'

export interface Season {
  year: number
  name: SeasonName
}

const ORDER: readonly SeasonName[] = ['winter', 'spring', 'summer', 'autumn']

const LABELS: Record<SeasonName, string> = {
  winter: '冬',
  spring: '春',
  summer: '夏',
  autumn: '秋',
}

// 1〜3月が冬、4〜6月が春、7〜9月が夏、10〜12月が秋
export function seasonOf(date: Date): Season {
  return { year: date.getFullYear(), name: ORDER[Math.floor(date.getMonth() / 3)] }
}

export function previousSeason(season: Season): Season {
  const i = ORDER.indexOf(season.name)
  return i === 0
    ? { year: season.year - 1, name: 'autumn' }
    : { year: season.year, name: ORDER[i - 1] }
}

export function nextSeason(season: Season): Season {
  const i = ORDER.indexOf(season.name)
  return i === ORDER.length - 1
    ? { year: season.year + 1, name: 'winter' }
    : { year: season.year, name: ORDER[i + 1] }
}

export function sameSeason(a: Season, b: Season): boolean {
  return a.year === b.year && a.name === b.name
}

// 冬 → 春 → 夏 → 秋 の順。プルダウンの並びに使う
export const SEASON_NAMES: readonly SeasonName[] = ORDER

export function seasonNameLabel(name: SeasonName): string {
  return LABELS[name]
}

// 古い方が負、同じなら 0
export function compareSeasons(a: Season, b: Season): number {
  return a.year !== b.year ? a.year - b.year : ORDER.indexOf(a.name) - ORDER.indexOf(b.name)
}

// min〜max の範囲に収める。プルダウンで年だけ変えて、先のクールになってしまったときに使う
export function clampSeason(season: Season, min: Season, max: Season): Season {
  if (compareSeasons(season, min) < 0) return min
  if (compareSeasons(season, max) > 0) return max
  return season
}

// 新しい年から古い年へ（プルダウンの並び）
export function yearsDescending(min: Season, max: Season): number[] {
  const years: number[] = []
  for (let y = max.year; y >= min.year; y--) years.push(y)
  return years
}

export function toSlug(season: Season): string {
  return `${season.year}-${season.name}`
}

export function parseSlug(slug: unknown): Season | null {
  if (typeof slug !== 'string') return null
  const m = /^(\d{4})-(winter|spring|summer|autumn)$/.exec(slug)
  return m ? { year: Number(m[1]), name: m[2] as SeasonName } : null
}

export function seasonLabel(season: Season): string {
  return `${season.year}年 ${LABELS[season.name]}`
}
