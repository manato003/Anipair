import { useEffect } from 'react'
import { fetchViewerStats, type ViewerStats } from '../../lib/annict'
import type { RecordRow } from '../records/recordList'
import { activeUnseenIds } from '../rate/unseen'
import { loadLocalUnseen } from '../rate/unseenStore'
import { useLang } from '../../lib/i18n'
import { allSeasonSlugs, loadFeats, loadSeasonTops, loadTitlesState, saveTitlesState, type SeasonTop } from './achievementStore'
import { announceEarned } from './titleToast'
import { coverageOf, evaluateTitles, type Coverage, type Title } from './titles'

// 称号の計算（実績の画面と、裏で新しい称号を見つけて知らせる仕組みで共有する）

// 自分の Annict の数値（1起動に1回。トークンごと）
const statsCache = new Map<string, Promise<ViewerStats>>()
export function statsOf(token: string): Promise<ViewerStats> {
  let p = statsCache.get(token)
  if (!p) {
    p = fetchViewerStats(token)
    p.catch(() => statsCache.delete(token))
    statsCache.set(token, p)
  }
  return p
}

// クールごとの答えた数。答えた作品: Annict に記録がある作品と「見てない」にした作品
export function coverageFor(rows: readonly RecordRow[], tops: ReadonlyMap<string, SeasonTop>): Map<string, Coverage> {
  const answered = new Set<number>(rows.map((r) => r.entry.annictId))
  for (const id of activeUnseenIds(loadLocalUnseen())) answered.add(id)
  return coverageOf(new Map([...tops].map(([slug, t]) => [slug, t.ids])), answered)
}

// 状態ごとの作品数は、手元の記録（ライブラリ）から数える。Annict の数値は1起動に1回しか読まないので、
// アプリの中で記録した分が、開き直すまで称号に効かなかった（10本目を見たにしても「見た10本」が解放されなかった）
export function liveStatsOf(stats: ViewerStats | null, rows: readonly RecordRow[] | null): ViewerStats | null {
  return stats && rows ? { ...stats, ...stateCounts(rows) } : stats
}

// いまの条件だけで見た判定（手に入れた印は混ぜない）
export function evaluatedTitlesFor(rows: readonly RecordRow[], stats: ViewerStats | null, coverage: Map<string, Coverage>): Title[] {
  const watchedYears = rows.filter((r) => r.entry.state === 'WATCHED' && r.entry.seasonYear).map((r) => r.entry.seasonYear as number)
  return evaluateTitles({ stats, watchedYears, coverage, feats: loadFeats(), now: new Date() })
}

// 一度手に入れた称号は、条件から外れても手放さない
export function withEarned(evaluated: readonly Title[]): Title[] {
  const earned = new Set(loadTitlesState().earned ?? [])
  return evaluated.map((t) => (!t.unlocked && earned.has(t.id) ? { ...t, unlocked: true, progress: null } : t))
}

export function titlesFor(rows: readonly RecordRow[], stats: ViewerStats | null, coverage: Map<string, Coverage>): Title[] {
  return withEarned(evaluatedTitlesFor(rows, stats, coverage))
}

// 記録が変わるたびに（記録の画面で読み込んだ・変えた）、裏で称号を計算し、新しく手に入れた称号を右上に知らせる。
// クールの人気作の一覧は、実績の画面が端末に控えたものを使う（ここでは読みに行かない）
export function useTitleWatch(token: string, rows: readonly RecordRow[] | null): void {
  const lang = useLang()
  useEffect(() => {
    if (!rows || !loadTitlesState().awakened) return
    let cancelled = false
    statsOf(token)
      .catch(() => null)
      .then((stats) => {
        if (cancelled) return
        const tops = loadSeasonTops()
        const titles = titlesFor(rows, liveStatsOf(stats, rows), coverageFor(rows, tops))
        // 端末の控えに全クールがそろっていないあいだは、年代の称号を知らせも覚えもしない
        // （一部しか無い控えで判定すると、あとで外れる称号を誤って知らせる）
        const complete = allSeasonSlugs(new Date()).every((slug) => tops.has(slug))
        const visible = titles.filter((t) => t.unlocked && (complete || !t.id.startsWith('decade-')))
        announceEarned(visible)
        syncEquipped(visible, stats !== null && complete)
      })
    return () => {
      cancelled = true
    }
  }, [token, rows, lang])
}

// 掲げている称号の控え（名前・レア度。傾向と1年のふり返りの共有の画像が使う）を、いまの言語と判定にそろえる。
// 言語を替えたあと実績を開かなくても名前が合うように、ここでも直す。条件を満たさなくなった称号は掲げていない扱いにする
// （実績の画面と同じ。判定が確かなとき［Annict の数値を読めて、年代の控えがそろっているとき］だけ外す）
function syncEquipped(unlocked: readonly Title[], reliable: boolean): void {
  const current = loadTitlesState()
  if (!current.equipped) return
  const now = unlocked.find((t) => t.id === current.equipped)
  if (now) {
    if (current.equippedName === now.name && current.equippedRarity === now.rarity) return
    saveTitlesState({ ...current, equippedName: now.name, equippedRarity: now.rarity })
  } else if (reliable) {
    saveTitlesState({ ...current, equipped: null, equippedName: null, equippedRarity: null })
  }
}

function stateCounts(rows: readonly RecordRow[]): Pick<ViewerStats, 'watchedCount' | 'watchingCount' | 'wannaWatchCount' | 'onHoldCount' | 'stopWatchingCount'> {
  const count = (state: string) => rows.filter((r) => r.entry.state === state).length
  return {
    watchedCount: count('WATCHED'),
    watchingCount: count('WATCHING'),
    wannaWatchCount: count('WANNA_WATCH'),
    onHoldCount: count('ON_HOLD'),
    stopWatchingCount: count('STOP_WATCHING'),
  }
}
