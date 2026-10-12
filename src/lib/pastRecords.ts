import { fetchMyRecordsPage, type RatingState } from './annict'

// 記録済みの話の「前回の評価」（いちばん新しい自分の記録の評価と日時）。
// Annict の API は自分の記録を話で絞れないので、自分の記録を新しい順に読んで、話ごとに最初に出たものを控える。
// 読むのは MAX_PAGES × 50 件まで（それより古い記録は「Annict で見られます」と案内する）。読んだページは同じトークンのあいだ使い回し、
// 足りないときだけ次のページを読む。記録を付けた・取り消したら forgetPastRecords で捨てる（控えが古くなるため）
export type PastRecord = { rating: RatingState | null; createdAt: string }

const MAX_PAGES = 6

type Scan = { token: string; byEpisode: Map<string, PastRecord>; next: string | null; pages: number; done: boolean; chain: Promise<unknown> }
let scan: Scan | null = null

function scanFor(token: string): Scan {
  if (!scan || scan.token !== token) scan = { token, byEpisode: new Map(), next: null, pages: 0, done: false, chain: Promise.resolve() }
  return scan
}

// その話の前回の記録。読める範囲に無ければ null
export function findPastRecord(token: string, episodeId: string): Promise<PastRecord | null> {
  const s = scanFor(token)
  // 同時に頼まれても、ページは1つずつ順に読む（同じページを二重に読まない）
  const run = s.chain.then(async () => {
    while (!s.byEpisode.has(episodeId) && !s.done && s.pages < MAX_PAGES) {
      const page = await fetchMyRecordsPage(token, s.next)
      // 読んでいるあいだに捨てられたら、古い結果を控えに入れない
      if (scan !== s) return null
      for (const r of page.records) if (!s.byEpisode.has(r.episodeId)) s.byEpisode.set(r.episodeId, { rating: r.rating, createdAt: r.createdAt })
      s.pages++
      s.next = page.next
      s.done = page.next === null
    }
    return s.byEpisode.get(episodeId) ?? null
  })
  s.chain = run.catch(() => undefined)
  return run
}

export function forgetPastRecords(): void {
  scan = null
}
