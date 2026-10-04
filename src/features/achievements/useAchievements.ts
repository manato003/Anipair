import { useEffect, useMemo, useState } from 'react'
import { fetchSeasonTops, fetchViewerStats, SEASON_TOPS_BATCH, type ViewerStats } from '../../lib/annict'
import { fetchIsSupporter } from '../../lib/annictPage'
import type { RecordRow } from '../records/recordList'
import { activeUnseenIds } from '../rate/unseen'
import { loadLocalUnseen } from '../rate/unseenStore'
import { allSeasonSlugs, isStale, loadFeats, loadSeasonTops, saveSeasonTops, type SeasonTop } from './achievementStore'
import { coverageOf, evaluateTitles, type Coverage, type Title } from './titles'

const AWAKEN_WAIT_MS = 15_000

// 自分の Annict の数値（1起動に1回。トークンごと）
const statsCache = new Map<string, Promise<ViewerStats>>()
function statsOf(token: string): Promise<ViewerStats> {
  let p = statsCache.get(token)
  if (!p) {
    p = fetchViewerStats(token)
    p.catch(() => statsCache.delete(token))
    statsCache.set(token, p)
  }
  return p
}

export interface Achievements {
  titles: Title[] | null
  // クールごとの答えた数（クールの紋章の表に使う）
  coverage: Map<string, Coverage> | null
  stats: ViewerStats | null
  // クールの一覧の読み込み（読み終わったら null）
  scan: { done: number; total: number } | null
  // 称号の計算に必要なもの（記録・数値・クールの一覧）がそろったか
  ready: boolean
}

// 実績の画面の材料。記録（ライブラリ）は記録タブが読んだものを使う。
// クールの人気作の一覧は、古いものや無いものだけを裏の優先度で16クールずつ読み、端末に控える
export function useAchievements(token: string, rows: RecordRow[] | null, active: boolean): Achievements {
  const [stats, setStats] = useState<ViewerStats | null>(null)
  const [supporter, setSupporter] = useState<boolean | null>(null)
  const [statsDone, setStatsDone] = useState(false)
  const [tops, setTops] = useState<Map<string, SeasonTop>>(() => loadSeasonTops())
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null)
  const [scanDone, setScanDone] = useState(false)
  // 初回の覚醒は、クールの一覧を読み終えるのをこの長さまで待つ（Annict の回数の制限で待たされたときなど）。過ぎたら、そろった分で出す
  const [waitedLong, setWaitedLong] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setWaitedLong(true), AWAKEN_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [active])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    statsOf(token).then(
      async (s) => {
        if (cancelled) return
        setStats(s)
        // サポーターかは、プロフィールページから読む（読めなくても、ほかの称号は出す）
        const isSupporter = await fetchIsSupporter(s.username).catch(() => null)
        if (cancelled) return
        setSupporter(isSupporter)
        setStatsDone(true)
      },
      // 読めなくても、Annict の数値を使わない称号は出す
      () => !cancelled && setStatsDone(true),
    )
    return () => {
      cancelled = true
    }
  }, [token, active])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      const now = new Date()
      const current = loadSeasonTops()
      const stale = allSeasonSlugs(now).filter((slug) => isStale(slug, current.get(slug), now))
      if (cancelled) return
      if (stale.length > 0) setScan({ done: 0, total: stale.length })
      for (let i = 0; i < stale.length; i += SEASON_TOPS_BATCH) {
        try {
          const got = await fetchSeasonTops(token, stale.slice(i, i + SEASON_TOPS_BATCH))
          const at = Date.now()
          for (const [slug, ids] of got) current.set(slug, { at, ids })
          saveSeasonTops(current)
        } catch {
          // 読めなかった分は次に開いたときに読み直す。読めた分で計算する
          break
        }
        if (cancelled) return
        setTops(new Map(current))
        setScan({ done: Math.min(i + SEASON_TOPS_BATCH, stale.length), total: stale.length })
      }
      if (cancelled) return
      setScan(null)
      setScanDone(true)
    })()
    return () => {
      cancelled = true
    }
  }, [token, active])

  const coverage = useMemo(() => {
    if (!rows) return null
    // 答えた作品: Annict に記録がある作品と「見てない」にした作品
    const answered = new Set<number>(rows.map((r) => r.entry.annictId))
    for (const id of activeUnseenIds(loadLocalUnseen())) answered.add(id)
    return coverageOf(new Map([...tops].map(([slug, t]) => [slug, t.ids])), answered)
  }, [rows, tops])

  const titles = useMemo(() => {
    if (!rows || !coverage) return null
    const watchedYears = rows.filter((r) => r.entry.state === 'WATCHED' && r.entry.seasonYear).map((r) => r.entry.seasonYear as number)
    return evaluateTitles({ stats, supporter, watchedYears, coverage, feats: loadFeats(), now: new Date() })
  }, [rows, stats, supporter, coverage])

  return { titles, coverage, stats, scan, ready: titles !== null && statsDone && (scanDone || waitedLong) }
}
