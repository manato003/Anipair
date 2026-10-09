import type { Media } from './shikimori'

// 作品の要点（放送中・全◯話・一気見の目安）。次に見る1本を決める手がかり（2026-10-07、myanimecheck.com の「データで見る」を参考に）。
// 話数と1話の長さは Shikimori（表紙と同じ問い合わせ）。費用も作り直しも要らない

// 分を「約11時間12分」「約24分」に。OP・ED を含む長さなので「約」を付ける
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `約${m}分`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `約${h}時間` : `約${h}時間${rest}分`
}

type EpisodeSource = Pick<Media, 'format' | 'status'> & Partial<Pick<Media, 'episodes' | 'episodesAired' | 'duration'>>

// 一気見の目安（分）。話数と1話の長さが分かる、放送を終えた作品だけ（放送中は全話がまだ見られない）
export function bingeMinutes(m: EpisodeSource, fallbackEpisodes?: number): number | null {
  if (m.format === 'MOVIE' || m.status === 'RELEASING' || m.status === 'NOT_YET_RELEASED') return null
  const episodes = m.episodes || fallbackEpisodes || 0
  return episodes > 1 && m.duration ? episodes * m.duration : null
}

// 画面に並べる短い要点。劇場版は上映時間だけ。fallbackEpisodes は Shikimori に話数が無いときの Annict の話数
export function episodeFacts(m: EpisodeSource, fallbackEpisodes?: number): string[] {
  if (m.format === 'MOVIE') return m.duration ? [`上映 ${formatMinutes(m.duration)}`] : []
  const episodes = m.episodes || fallbackEpisodes || 0
  const out: string[] = []
  if (m.status === 'RELEASING') out.push(m.episodesAired ? `放送中（第${m.episodesAired}話まで）` : '放送中')
  if (episodes > 0) out.push(`全${episodes}話`)
  const binge = bingeMinutes(m, fallbackEpisodes)
  if (binge) out.push(`一気見 ${formatMinutes(binge)}`)
  else if (episodes === 1 && m.duration && m.status !== 'RELEASING') out.push(formatMinutes(m.duration))
  return out
}
