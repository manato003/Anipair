import { useEffect, useMemo, useState } from 'react'
import { fetchSeasonTops, SEASON_TOPS_BATCH, type ViewerStats } from '../../lib/annict'
import type { RecordRow } from '../records/recordList'
import { allSeasonSlugs, isStale, loadSeasonTops, fixDecadeEarned, rememberEarned, saveSeasonTops, type SeasonTop } from './achievementStore'
import { coverageFor, evaluatedTitlesFor, liveStatsOf, statsOf, withEarned } from './titleCheck'
import type { Coverage, Title } from './titles'

const AWAKEN_WAIT_MS = 15_000

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
  const [statsDone, setStatsDone] = useState(false)
  const [tops, setTops] = useState<Map<string, SeasonTop>>(() => loadSeasonTops())
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null)
  const [scanDone, setScanDone] = useState(false)
  // クールの一覧を、途中で失敗せずに最後まで読めた。年代の称号は割合で決まるので、一部のクールだけで解放して覚えないために使う
  const [scanComplete, setScanComplete] = useState(false)
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
      (s) => {
        if (cancelled) return
        setStats(s)
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
      let complete = true
      for (let i = 0; i < stale.length; i += SEASON_TOPS_BATCH) {
        try {
          const got = await fetchSeasonTops(token, stale.slice(i, i + SEASON_TOPS_BATCH))
          const at = Date.now()
          for (const [slug, ids] of got) current.set(slug, { at, ids })
          saveSeasonTops(current)
        } catch {
          // 読めなかった分は次に開いたときに読み直す。読めた分で計算する
          complete = false
          break
        }
        if (cancelled) return
        setTops(new Map(current))
        setScan({ done: Math.min(i + SEASON_TOPS_BATCH, stale.length), total: stale.length })
      }
      if (cancelled) return
      setScan(null)
      setScanComplete(complete)
      setScanDone(true)
    })()
    return () => {
      cancelled = true
    }
  }, [token, active])

  const coverage = useMemo(() => (rows ? coverageFor(rows, tops) : null), [rows, tops])
  const liveStats = useMemo(() => liveStatsOf(stats, rows), [stats, rows])
  // 手に入れた印を混ぜる前の判定。印の作り直しと覚える側はこちらを使う（混ぜたあとだと、誤って覚えた分も「解放済み」に入る）
  const evaluated = useMemo(() => (rows && coverage ? evaluatedTitlesFor(rows, liveStats, coverage) : null), [rows, liveStats, coverage])
  const [earnedRev, setEarnedRev] = useState(0)
  // earned を読むのは計算のときだけなので、印を作り直したら計算し直す
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const titles = useMemo(() => (evaluated ? withEarned(evaluated) : null), [evaluated, earnedRev])

  const unlockedKey = (evaluated ?? [])
    .filter((t) => t.unlocked)
    .map((t) => t.id)
    .join(',')
  // 一度だけ、年代の称号の印を、一覧を最後まで読んだ結果で作り直す（一部のクールで誤って解放したものを外す）
  useEffect(() => {
    if (!scanComplete || !evaluated) return
    // 端末の保存領域（外の状態）を書き換えたので、画面の計算を読み直させる。一度きりで、回り続けない
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fixDecadeEarned(evaluated.filter((x) => x.unlocked).map((x) => x.id))) setEarnedRev((n) => n + 1)
  }, [scanComplete, evaluated])
  useEffect(() => {
    if (!unlockedKey) return
    // 年代の称号は、クールの一覧を最後まで読むまで覚えない（一部のクールだけの割合で解放しても、あとで手放さないため残ってしまう）
    const ids = unlockedKey.split(',').filter((id) => scanComplete || !id.startsWith('decade-'))
    if (ids.length > 0) rememberEarned(ids)
  }, [unlockedKey, scanComplete])

  return { titles, coverage, stats: liveStats, scan, ready: titles !== null && statsDone && (scanDone || waitedLong) }
}
