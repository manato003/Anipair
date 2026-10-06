import type { Episode } from '../../lib/annict'

// 記録ページの「見てる」で、話ごとに記録するための純粋な関数

// 話の呼び名。Annict の表記（「#6」「第6話」）を優先し、無ければ番号、それも無ければ題名
export function episodeLabel(e: Pick<Episode, 'number' | 'numberText' | 'title'>): string {
  if (e.numberText?.trim()) return e.numberText.trim()
  if (typeof e.number === 'number') return `第${e.number}話`
  return e.title?.trim() || '話'
}

// 「次は 第5話「題名」」（見てる作品の行と、評価の画面の見てるカード）
export function nextLabel(e: Pick<Episode, 'number' | 'numberText' | 'title'>): string {
  const label = episodeLabel(e)
  const title = e.title?.trim()
  return title && title !== label ? `次は ${label}「${title}」` : `次は ${label}`
}

// 進み具合（記録した話の数と、全部の話の数）
export function episodeProgress(episodes: readonly Episode[]): { tracked: number; total: number } {
  return { tracked: episodes.filter((e) => e.viewerDidTrack).length, total: episodes.length }
}

// 次に見る話。最後に記録した話（放送順でいちばん後ろ）の次。まだ1話も記録していなければ最初の話。最後まで記録していれば null。
// 途中を飛ばして見た人でも、Annict の「次のエピソード」と同じく、いちばん先まで見た話の次を出す
export function nextEpisode(episodes: readonly Episode[]): Episode | null {
  let last = -1
  episodes.forEach((e, i) => {
    if (e.viewerDidTrack) last = i
  })
  return episodes[last + 1] ?? null
}

// 記録欄で最初に選んでおく話の位置。次に見る話。最後まで記録してあれば最初の話（見た作品を振り返って1話ずつ評価するため）
export function startIndex(episodes: readonly Episode[]): number {
  const next = nextEpisode(episodes)
  return next ? episodes.indexOf(next) : 0
}

// 話の一覧のシートで、最初に見せる範囲（長い作品は、次の話のあたりから）。start は含み、end は含まない
export function episodeWindow(episodes: readonly Episode[], size: number, before = 5): { start: number; end: number } {
  const next = nextEpisode(episodes)
  const at = next ? episodes.indexOf(next) : episodes.length
  const start = Math.max(0, Math.min(at - before, episodes.length - size))
  return { start, end: Math.min(episodes.length, start + size) }
}
