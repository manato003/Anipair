import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCovers, quickCovers } from '../../lib/covers'
import { browseWorks, fetchLibrary, type BrowseOrder, type BrowseWork, type RatingState } from '../../lib/annict'
import { getMyReviews } from '../../lib/myReviews'
import { nextSeason, seasonOf, toSlug, type Season } from '../../lib/season'
import { fetchMedia, type Media } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { hasPendingWrites, messageOf } from '../../lib/useWriteQueue'
import { malIdOf } from '../match/taste'
import { forgetTaste, loadTaste } from '../match/tasteLoader'
import { OLDEST_YEAR } from '../rate/queue'
import { NO_PERIOD, periodActive, periodSlugs, type BrowsePeriod } from './browseFilter'
import { rankByTaste, scoreOf, sortByScore, sortFor, type BrowseMode, type BrowseScore, type BrowseSort } from './browseSort'

const DEBOUNCE_MS = 400
// 評価順は全件の点数が要るので、まとめて読む。上限はクール1つぶん（200作品前後）が収まる数
const MAX_FOR_SCORE = 300

// おすすめ順の手がかりが無いときの注意（好きな作品が1件も無い）
export const NO_LIKES_NOTE = '好みの手がかりがまだありません。評価画面で、好きな作品を評価すると使えます。'

// 上限まで集めたときの注意（期間が広いと、クールより作品が多い）
export const CAPPED_NOTE = `作品が多いので、人気の上位${MAX_FOR_SCORE}作品を並べています。期間をしぼると、ほかの作品も並びます。`

// Annict に頼む条件。期間があればそのクールをまとめて、無ければ上のクール1つ（タイトル検索のときは期間だけ。期間が無ければ全期間）
function filterOf(query: string, season: Season, period: BrowsePeriod): { titles?: string[]; seasons?: string[] } {
  const latestYear = nextSeason(seasonOf(new Date())).year
  const seasons = periodActive(period) ? periodSlugs(period, OLDEST_YEAR, latestYear) : query ? undefined : [toSlug(season)]
  return { ...(query ? { titles: [query] } : {}), ...(seasons ? { seasons } : {}) }
}

// 作品を、50件ずつ上限（MAX_FOR_SCORE）まで集める（評価順とおすすめ順が、全件を手元で並べるために使う）。
// capped: 上限で打ち切った（まだ続きがある）。途中で取り消されたら null
async function collectAll(token: string, filter: ReturnType<typeof filterOf>, isCancelled: () => boolean): Promise<{ works: BrowseWork[]; capped: boolean } | null> {
  const all: BrowseWork[] = []
  let after: string | null = null
  for (;;) {
    const page = await browseWorks(token, filter, { after, first: 50 })
    if (isCancelled()) return null
    all.push(...page.works)
    if (!page.hasNext) return { works: all, capped: false }
    if (all.length >= MAX_FOR_SCORE) return { works: all, capped: true }
    after = page.endCursor
  }
}

// active: 画面が表示されているか（隠れているだけで残っているタブは、評価のバッジを読み直さない）
export function useBrowse(token: string, active = true) {
  const [season, setSeasonState] = useState<Season>(() => seasonOf(new Date()))
  const [query, setQuery] = useState('')
  // 絞り込みの期間（放送年と季節）。あれば上のクールの代わりに、その期間の作品を読む
  const [period, setPeriodState] = useState<BrowsePeriod>(NO_PERIOD)
  // 作品を読み直すかどうかは、期間の中身で比べる（同じ期間を選び直しても読み直さない）
  const periodKey = JSON.stringify(period)
  // 実際に検索している語。入力のたびには検索せず、打ち終わってから変える
  const [searched, setSearched] = useState('')
  const searchedRef = useRef('')
  const [reloadTick, setReloadTick] = useState(0)
  const [works, setWorks] = useState<BrowseWork[] | null>(null)
  const [cursor, setCursor] = useState<{ endCursor: string | null; hasNext: boolean }>({ endCursor: null, hasNext: false })
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 「もっと見る」の失敗。読めている一覧はそのまま残し、ボタンのそばに出す
  const [moreError, setMoreError] = useState<string | null>(null)
  // 一覧を読み直した回数。「もっと見る」の途中で条件（クール・期間・検索・並び）を変えたら、届いた続きを捨てるのに使う
  const listGen = useRef(0)
  const [covers, setCovers] = useState<Map<number, Cover>>(new Map())
  const [ratings, setRatings] = useState<Map<number, RatingState>>(new Map())
  const [sort, setSortState] = useState<BrowseSort>('popular')
  // 評価順で並べたときの、作品（Annict の ID）ごとの点数と出どころ
  const [scores, setScores] = useState<Map<number, BrowseScore>>(new Map())
  const [progress, setProgress] = useState<string | null>(null)
  // おすすめ順で並べたときの、作品（Annict の ID）ごとの理由
  const [reasons, setReasons] = useState<Map<number, string>>(new Map())
  // 評価順・おすすめ順で、思いどおりに並べられなかったときの注意（好みの手がかりが無い・好みを読めない・Shikimori の点数を読めない）
  const [sortNote, setSortNote] = useState<string | null>(null)
  // 評価順・おすすめ順で、上限まで集めて打ち切った
  const [capped, setCapped] = useState(false)
  const mode: BrowseMode = searched ? 'search' : periodActive(period) ? 'period' : 'cour'
  const effectiveSort = sortFor(sort, mode)
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
    listGen.current++
    ;(async () => {
      try {
        const filter = filterOf(searched, season, JSON.parse(periodKey) as BrowsePeriod)
        setMoreError(null)
        setLoadingMore(false)
        // 前の並べ方の読み込み中の文言を残さない（評価順の途中で人気順に変えたときなど）
        setProgress(null)
        setSortNote(null)
        setCapped(false)
        if (effectiveSort === 'score') {
          setProgress('作品を読み込み中')
          const collected = await collectAll(token, filter, () => cancelled)
          if (!collected) return
          const all = collected.works
          // Annict の満足度が無い作品だけ、Shikimori の点数を取る
          const lacking = all.filter((w) => !(typeof w.satisfactionRate === 'number' && w.satisfactionRate > 0)).map(malIdOf).filter((n): n is number => n !== null)
          setProgress(`評価の点数を読み込み中（${all.length}作品）`)
          // Shikimori が読めなくても、Annict の満足度だけで並べる（一覧ごと失敗にしない）
          let media = new Map<number, Media>()
          try {
            if (lacking.length > 0) media = await fetchMedia(lacking)
          } catch (e) {
            if (cancelled) return
            setSortNote(`Shikimori の点数を読み込めませんでした（${messageOf(e)}）。Annict の満足度だけで並べています。`)
          }
          if (cancelled) return
          const shikimori = new Map<number, number | null>([...media].map(([id, m]) => [id, m.score]))
          const got = new Map<number, BrowseScore>()
          for (const w of all) {
            const sc = scoreOf(w, shikimori)
            if (sc) got.set(w.annictId, sc)
          }
          setScores((cur) => new Map([...cur, ...got]))
          setCapped(collected.capped)
          setWorks(sortByScore(all, shikimori))
          setCursor({ endCursor: null, hasNext: false })
          setProgress(null)
          await addCovers(all)
        } else if (effectiveSort === 'taste') {
          // 評価順と同じく、全件を集めてから手元で並べる（「もっと見る」は無い）。
          // 好みは見たいのおすすめ順と共通（起動中は使い回す）。好みを調べられなくても、一覧は人気順で見せる
          setProgress('作品を読み込み中')
          const collected = await collectAll(token, filter, () => cancelled)
          if (!collected) return
          const all = collected.works
          let ordered = all
          let why = new Map<number, string>()
          let note: string | null = null
          setProgress('好みを分析しています')
          try {
            const taste = await loadTaste(token, (step) => {
              if (!cancelled) setProgress(step)
            })
            if (cancelled) return
            if (!taste.seeds.some((s) => s.weight > 0)) {
              note = NO_LIKES_NOTE
            } else {
              setProgress(`作品のデータを整理しています（${all.length}作品）`)
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
          setSortNote(note)
          setCapped(collected.capped)
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
  }, [token, searched, season, periodKey, reloadTick, effectiveSort, order, addCovers])

  // 隠れていたタブが再び表示されたときは、好みの控えを捨てる（そのあいだに評価が増えているかもしれない。次におすすめ順にしたときに読み直す）。
  // 一覧の記録の状態も、ほかの画面で変えたかもしれないので、自分のライブラリに合わせ直す（2026-10-06 の点検: 戻るまで古いままだった）。
  // 送信待ちがあるあいだは、書く前のライブラリを読むことになるので合わせない
  const wasHidden = useRef(false)
  useEffect(() => {
    if (!active) {
      wasHidden.current = true
      return
    }
    if (!wasHidden.current) return
    wasHidden.current = false
    forgetTaste()
    if (hasPendingWrites()) return
    let cancelled = false
    fetchLibrary(token)
      .then((library) => {
        if (cancelled || hasPendingWrites()) return
        const states = new Map(library.map((e) => [e.annictId, e.state]))
        setWorks((cur) => cur?.map((w) => ({ ...w, viewerStatusState: states.get(w.annictId) ?? null })) ?? cur)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [active, token])

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

  // 中身が同じなら何もしない（読み直しも起きないので、一覧を空にすると戻らない）
  const setPeriod = useCallback(
    (p: BrowsePeriod) => {
      if (JSON.stringify(p) === periodKey) return
      setWorks(null)
      setError(null)
      setPeriodState(p)
    },
    [periodKey],
  )

  // 実際の並べ方が変わらないなら、一覧を空にしない（読み直しも起きないので、空にすると戻らない。
  // 選んでいる並び順をもう一度押したときや、期間で選んだ並び順がクールでは使えず人気順になっているとき。2026-10-06 の点検）
  const setSort = useCallback(
    (s: BrowseSort) => {
      if (sortFor(s, mode) !== effectiveSort) {
        setWorks(null)
        setError(null)
      }
      setSortState(s)
    },
    [mode, effectiveSort],
  )

  const retry = useCallback(() => {
    setWorks(null)
    setError(null)
    setReloadTick((t) => t + 1)
  }, [])

  // 届くまでに条件を変えていたら、届いた続きは捨てる（前の条件の作品を混ぜない・前の条件の続きの位置で読まない）
  const loadMore = useCallback(async () => {
    if (!cursor.hasNext || loadingMore) return
    const gen = listGen.current
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = await browseWorks(token, filterOf(searched, season, period), { after: cursor.endCursor, order })
      if (gen !== listGen.current) return
      setWorks((cur) => [...(cur ?? []), ...page.works.filter((w) => !cur?.some((c) => c.id === w.id))])
      setCursor({ endCursor: page.endCursor, hasNext: page.hasNext })
      await addCovers(page.works)
    } catch (e) {
      if (gen === listGen.current) setMoreError(messageOf(e))
    } finally {
      if (gen === listGen.current) setLoadingMore(false)
    }
  }, [token, searched, season, period, order, cursor, loadingMore, addCovers])

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
    period,
    setPeriod,
    mode,
    capped,
    sort: effectiveSort,
    setSort,
    scores,
    reasons,
    sortNote,
    progress,
    works,
    hasMore: cursor.hasNext,
    loadingMore,
    loadMore,
    moreError,
    error,
    retry,
    covers,
    ratings,
    patchWork,
  }
}
