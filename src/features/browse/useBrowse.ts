import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCovers, quickCovers } from '../../lib/covers'
import { browseWorks, type BrowseOrder, type BrowseWork, type RatingState } from '../../lib/annict'
import { getMyReviews } from '../../lib/myReviews'
import { seasonOf, toSlug, type Season } from '../../lib/season'
import { fetchMedia } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { malIdOf } from '../match/taste'
import { forgetTaste, loadTaste } from '../match/tasteLoader'
import { rankByTaste, scoreOf, sortByScore, type BrowseScore, type BrowseSort } from './browseSort'

const DEBOUNCE_MS = 400
// 評価順は全件の点数が要るので、まとめて読む。上限はクール1つぶん（200作品前後）が収まる数
const MAX_FOR_SCORE = 300

// 好み順の手がかりが無いときの注意（好きな作品が1件も無い）
export const NO_LIKES_NOTE = '好みの手がかりがまだありません。評価画面で、好きな作品を評価すると使えます。'

function filterOf(query: string, season: Season) {
  return query ? { titles: [query] } : { seasons: [toSlug(season)] }
}

// クールの作品を、50件ずつ上限（MAX_FOR_SCORE）まで集める（評価順と好み順が、全件を手元で並べるために使う）。
// 途中で取り消されたら null
async function collectAll(token: string, filter: ReturnType<typeof filterOf>, isCancelled: () => boolean): Promise<BrowseWork[] | null> {
  const all: BrowseWork[] = []
  let after: string | null = null
  for (;;) {
    const page = await browseWorks(token, filter, { after, first: 50 })
    if (isCancelled()) return null
    all.push(...page.works)
    if (!page.hasNext || all.length >= MAX_FOR_SCORE) break
    after = page.endCursor
  }
  return all
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
  // 評価順で並べたときの、作品（Annict の ID）ごとの点数と出どころ
  const [scores, setScores] = useState<Map<number, BrowseScore>>(new Map())
  const [progress, setProgress] = useState<string | null>(null)
  // 好み順で並べたときの、作品（Annict の ID）ごとの理由と、並べられなかったときの注意（好みの手がかりが無い・好みを読めない）
  const [reasons, setReasons] = useState<Map<number, string>>(new Map())
  const [tasteNote, setTasteNote] = useState<string | null>(null)
  // 新しい順はタイトル検索のときだけ、好み順はクール一覧のときだけ（クール一覧はすべて同じ時期。好み順はクールの全作品を並べる）
  const effectiveSort: BrowseSort = (sort === 'newest' && !searched) || (sort === 'taste' && searched) ? 'popular' : sort
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

  // 表紙は Annict の作品 ID ごと。Annict の画像は手元にあるので先に出し、Shikimori のポスターは取れてから足す
  const addCovers = useCallback(async (list: BrowseWork[]) => {
    setCovers((cur) => new Map([...cur, ...quickCovers(list)]))
    const got = await fetchCovers(list)
    setCovers((cur) => new Map([...cur, ...got]))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const filter = filterOf(searched, season)
        if (effectiveSort === 'score') {
          setProgress('作品を集めています')
          const all = await collectAll(token, filter, () => cancelled)
          if (!all) return
          // Annict の満足度が無い作品だけ、Shikimori の点数を取る
          const lacking = all.filter((w) => !(typeof w.satisfactionRate === 'number' && w.satisfactionRate > 0)).map(malIdOf).filter((n): n is number => n !== null)
          setProgress(`Shikimori の点数を集めています（${all.length}作品）`)
          const media = lacking.length > 0 ? await fetchMedia(lacking) : new Map()
          if (cancelled) return
          const shikimori = new Map<number, number | null>([...media].map(([id, m]) => [id, m.score]))
          const got = new Map<number, BrowseScore>()
          for (const w of all) {
            const sc = scoreOf(w, shikimori)
            if (sc) got.set(w.annictId, sc)
          }
          setScores((cur) => new Map([...cur, ...got]))
          setWorks(sortByScore(all, shikimori))
          setCursor({ endCursor: null, hasNext: false })
          setProgress(null)
          await addCovers(all)
        } else if (effectiveSort === 'taste') {
          // 評価順と同じく、全件を集めてから手元で並べる（「もっと見る」は無い）。
          // 好みは見たいのおすすめ順と共通（起動中は使い回す）。好みを調べられなくても、一覧は人気順で見せる
          setTasteNote(null)
          setProgress('作品を集めています')
          const all = await collectAll(token, filter, () => cancelled)
          if (!all) return
          let ordered = all
          let why = new Map<number, string>()
          let note: string | null = null
          setProgress('好みを調べています')
          try {
            const taste = await loadTaste(token, (step) => {
              if (!cancelled) setProgress(step)
            })
            if (cancelled) return
            if (!taste.seeds.some((s) => s.weight > 0)) {
              note = NO_LIKES_NOTE
            } else {
              setProgress(`作品の情報を集めています（${all.length}作品）`)
              const malIds = all.map(malIdOf).filter((n): n is number => n !== null)
              const details = malIds.length > 0 ? await fetchMedia(malIds) : new Map()
              if (cancelled) return
              const ranking = rankByTaste(all, details, taste)
              ordered = ranking.works
              why = ranking.reasons
            }
          } catch (e) {
            if (cancelled) return
            note = `好みを読み込めませんでした（${messageOf(e)}）。人気順で並べています。`
          }
          setReasons(why)
          setTasteNote(note)
          setWorks(ordered)
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

  // 隠れていたタブが再び表示されたときは、好みの控えを捨てる（そのあいだに評価が増えているかもしれない。次に好み順にしたときに読み直す）
  const wasHidden = useRef(false)
  useEffect(() => {
    if (!active) {
      wasHidden.current = true
    } else if (wasHidden.current) {
      wasHidden.current = false
      forgetTaste()
    }
  }, [active])

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
    reasons,
    tasteNote,
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
