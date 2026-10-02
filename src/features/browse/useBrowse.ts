import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCovers, fetchScores } from '../../lib/anilist'
import { browseWorks, type BrowseOrder, type BrowseWork, type RatingState } from '../../lib/annict'
import { getMyReviews } from '../../lib/myReviews'
import { seasonOf, toSlug, type Season } from '../../lib/season'
import type { Cover } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { malIdOf } from '../match/taste'
import { sortByScore, type BrowseSort } from './browseSort'

const DEBOUNCE_MS = 400
// 評価順は全件の点数が要るので、まとめて読む。上限はクール1つぶん（200作品前後）が収まる数
const MAX_FOR_SCORE = 300

function filterOf(query: string, season: Season) {
  return query ? { titles: [query] } : { seasons: [toSlug(season)] }
}

// active: 画面が表示されているか（隠れているだけで残っているタブは、評価のバッジを読み直さない）
export function useBrowse(token: string, active = true) {
  const [season, setSeasonState] = useState<Season>(() => seasonOf(new Date()))
  const [query, setQuery] = useState('')
  // 実際に検索している語。入力のたびには検索せず、打ち終わってから変える
  const [searched, setSearched] = useState('')
  const searchedRef = useRef('')
  const [reloadTick, setReloadTick] = useState(0)
  const [works, setWorks] = useState<BrowseWork[] | null>(null)
  const [cursor, setCursor] = useState<{ endCursor: string | null; hasNext: boolean }>({ endCursor: null, hasNext: false })
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [covers, setCovers] = useState<Map<number, Cover>>(new Map())
  const [ratings, setRatings] = useState<Map<number, RatingState>>(new Map())
  const [sort, setSortState] = useState<BrowseSort>('popular')
  const [scores, setScores] = useState<Map<number, number | null>>(new Map())
  const [progress, setProgress] = useState<string | null>(null)
  // 新しい順はタイトル検索のときだけ（クール一覧はすべて同じ時期）
  const effectiveSort: BrowseSort = sort === 'newest' && !searched ? 'popular' : sort
  const order: BrowseOrder = effectiveSort === 'newest' ? 'SEASON' : 'WATCHERS_COUNT'

  useEffect(() => {
    const t = setTimeout(() => {
      const q = query.trim()
      if (q === searchedRef.current) return
      searchedRef.current = q
      setWorks(null)
      setError(null)
      setSearched(q)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const addCovers = useCallback(async (list: BrowseWork[]) => {
    const got = await fetchCovers(list.map(malIdOf).filter((n): n is number => n !== null))
    setCovers((cur) => new Map([...cur, ...got]))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const filter = filterOf(searched, season)
        if (effectiveSort === 'score') {
          setProgress('作品を集めています')
          const all: BrowseWork[] = []
          let after: string | null = null
          for (;;) {
            const page = await browseWorks(token, filter, { after, first: 50 })
            if (cancelled) return
            all.push(...page.works)
            if (!page.hasNext || all.length >= MAX_FOR_SCORE) break
            after = page.endCursor
          }
          setProgress(`AniList の平均点を集めています（${all.length}作品）`)
          const got = await fetchScores(all.map(malIdOf).filter((n): n is number => n !== null))
          if (cancelled) return
          setScores((cur) => new Map([...cur, ...got]))
          setWorks(sortByScore(all, got))
          setCursor({ endCursor: null, hasNext: false })
          setProgress(null)
          await addCovers(all)
        } else {
          const page = await browseWorks(token, filter, { order })
          if (cancelled) return
          setWorks(page.works)
          setCursor({ endCursor: page.endCursor, hasNext: page.hasNext })
          await addCovers(page.works)
        }
      } catch (e) {
        if (!cancelled) {
          setProgress(null)
          setError(messageOf(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, searched, season, reloadTick, effectiveSort, order, addCovers])

  // 自分の評価をバッジに出す（読めなくても一覧は使える）。ほかの画面で評価を変えることがあるので、表示されるたびに共有の控えから読み直す
  useEffect(() => {
    if (!active) return
    let cancelled = false
    getMyReviews(token)
      .then((map) => {
        if (cancelled) return
        const out = new Map<number, RatingState>()
        for (const [id, r] of map) if (r.ratingOverallState) out.set(id, r.ratingOverallState)
        setRatings(out)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token, active])

  const setSeason = useCallback((s: Season) => {
    setWorks(null)
    setError(null)
    setSeasonState(s)
  }, [])

  const setSort = useCallback((s: BrowseSort) => {
    setWorks(null)
    setError(null)
    setSortState(s)
  }, [])

  const retry = useCallback(() => {
    setWorks(null)
    setError(null)
    setReloadTick((t) => t + 1)
  }, [])

  const loadMore = useCallback(async () => {
    if (!cursor.hasNext || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await browseWorks(token, filterOf(searched, season), { after: cursor.endCursor, order })
      setWorks((cur) => [...(cur ?? []), ...page.works.filter((w) => !cur?.some((c) => c.id === w.id))])
      setCursor({ endCursor: page.endCursor, hasNext: page.hasNext })
      await addCovers(page.works)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setLoadingMore(false)
    }
  }, [token, searched, season, order, cursor, loadingMore, addCovers])

  // 詳細画面で状態や評価を変えたら、一覧の表示も合わせる
  const patchWork = useCallback((annictId: number, patch: { state?: BrowseWork['viewerStatusState']; rating?: RatingState | null }) => {
    const { state, rating } = patch
    if (state !== undefined) {
      setWorks((cur) => cur?.map((w) => (w.annictId === annictId ? { ...w, viewerStatusState: state } : w)) ?? cur)
    }
    if (rating !== undefined) {
      setRatings((cur) => {
        const next = new Map(cur)
        if (rating) next.set(annictId, rating)
        else next.delete(annictId)
        return next
      })
    }
  }, [])

  return {
    season,
    setSeason,
    query,
    setQuery,
    searching: searched !== '',
    sort: effectiveSort,
    setSort,
    scores,
    progress,
    works,
    hasMore: cursor.hasNext,
    loadingMore,
    loadMore,
    error,
    retry,
    covers,
    ratings,
    patchWork,
  }
}
