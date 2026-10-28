import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCovers, quickCovers } from '../../lib/covers'
import { browseWorks, fetchLibrary, type BrowseOrder, type BrowseWork, type RatingState } from '../../lib/annict'
import { getMyReviews } from '../../lib/myReviews'
import { t } from '../../lib/i18n'
import { compareSeasons, nextSeason, seasonOf, seasonOfWork, toSlug, type Season } from '../../lib/season'
import { fetchMedia, searchTitles, type Media } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { hasPendingWrites, messageOf } from '../../lib/useWriteQueue'
import { malIdOf } from '../../lib/malId'
import { forgetTaste, loadTaste } from '../match/tasteLoader'
import { OLDEST_SEASON } from '../rate/queue'
import { NO_PERIOD, periodActive, periodSlugs, type BrowsePeriod } from './browseFilter'
import { rankByTaste, reverseScored, scoreOf, sortByScore, sortFor, type BrowseMode, type BrowseScore, type BrowseSort } from './browseSort'
import { FIND_MAX_WORKS, findPage, type FindOrder, type Narrow } from './conditionSearch'
import type { SortDir } from '../../components/SortRow'

const DEBOUNCE_MS = 400
// ジャンル・制作会社のチップを続けて押すあいだは、Shikimori に問い合わせない（押し終わってから1回）
const NARROW_DEBOUNCE_MS = 700
// 評価順は全件の点数が要るので、まとめて読む。上限はクール1つぶん（200作品前後）が収まる数
const MAX_FOR_SCORE = 300

// おすすめ順の手がかりが無いときの注意（好きな作品が1件も無い）
// （画面の言語で変わるので、関数にしてある）
export function noLikesNote(): string {
  return t('好みの手がかりがまだありません。評価画面で、好きな作品を評価すると使えます。', 'No taste data yet. Rate anime you like on the Rate screen and this will start working.')
}

// 上限まで集めたときの注意（期間が広いと、クールより作品が多い）
export function cappedNote(limit = MAX_FOR_SCORE): string {
  return t(
    `作品が多いので、人気の上位${limit}作品を並べています。期間をしぼると、ほかの作品も並びます。`,
    `There are a lot of anime, so this shows the top ${limit} by popularity. Narrow the period to see others.`,
  )
}

// Annict に頼む条件。keep は、届いた作品のうち一覧に残すもの（無ければ全部）
interface BrowseFilter {
  titles?: string[]
  seasons?: string[]
  keep?: (w: BrowseWork) => boolean
}

// かな・漢字を含まず、英字を含む語は、英語かローマ字の題名とみなす
const JA_TEXT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/
export function isLatinQuery(query: string): boolean {
  return !JA_TEXT.test(query) && /[a-z]/i.test(query)
}

const fold = (s: string) => s.normalize('NFKC').toLowerCase()

// 検索の語を、Annict に頼む題名に。Annict の検索は日本語の題名と読みにしか当たらないので、英語・ローマ字の語は
// Shikimori で日本語の題名を引いて併せて頼む。そのときは、Shikimori が返した作品（MyAnimeList の ID）か、
// 題名に語そのものを含む作品だけを残す（短い日本語の題名で、関係ない作品まで当たらないように）。Shikimori に聞けなければ、語だけで探す
export async function searchFilter(query: string): Promise<Pick<BrowseFilter, 'titles' | 'keep'>> {
  if (!isLatinQuery(query)) return { titles: [query] }
  const hits = await searchTitles(query).catch(() => [])
  const japanese = [...new Set(hits.flatMap((h) => (h.japanese ? [h.japanese] : [])))]
  if (japanese.length === 0) return { titles: [query] }
  const ids = new Set(hits.map((h) => h.malId))
  const needle = fold(query)
  return {
    titles: [query, ...japanese],
    keep: (w) => {
      const id = malIdOf(w)
      return (id !== null && ids.has(id)) || fold(w.title).includes(needle) || (!!w.titleEn && fold(w.titleEn).includes(needle))
    },
  }
}

// 期間があればそのクールをまとめて、無ければ上のクール1つ（タイトル検索のときは期間だけ。期間が無ければ全期間）
async function filterOf(query: string, season: Season, period: BrowsePeriod): Promise<BrowseFilter> {
  const seasons = periodActive(period) ? periodSlugs(period, OLDEST_SEASON, nextSeason(seasonOf(new Date()))) : query ? undefined : [toSlug(season)]
  return { ...(query ? await searchFilter(query) : {}), ...(seasons ? { seasons } : {}) }
}

async function fetchPage(token: string, filter: BrowseFilter, opts: Parameters<typeof browseWorks>[2]) {
  const { keep, ...asked } = filter
  const page = await browseWorks(token, asked, opts)
  return keep ? { ...page, works: page.works.filter(keep) } : page
}

// 続きの位置から1ページ読む（Annict の一覧か、条件検索）。capped: 読める上限まで来たが、まだ続きがありそう
type Loader = (after: string | null) => Promise<{ works: BrowseWork[]; endCursor: string | null; hasNext: boolean; capped?: boolean }>

// 期間の始めと終わりのクール（Annict の書き方）。期間がアプリの扱う範囲の外なら null
function periodBounds(period: BrowsePeriod): { from: string; to: string } | null {
  const slugs = periodSlugs(period, OLDEST_SEASON, nextSeason(seasonOf(new Date())))
  return slugs.length > 0 ? { from: slugs[0], to: slugs[slugs.length - 1] } : null
}

// 条件検索のページ。期間が範囲の外なら空
function findLoader(token: string, narrow: Narrow, period: BrowsePeriod, order: FindOrder): Loader {
  const bounds = periodBounds(period)
  return async (after) => (bounds ? findPage(token, narrow, bounds, order, after ? Number(after) : 1) : { works: [], endCursor: null, hasNext: false })
}

// 放送時期の古い順（時期の分からない作品は最後）
function oldestFirst(works: readonly BrowseWork[]): BrowseWork[] {
  return [...works].sort((a, b) => {
    const sa = seasonOfWork(a)
    const sb = seasonOfWork(b)
    if (!sa || !sb) return sa ? -1 : sb ? 1 : 0
    return compareSeasons(sa, sb)
  })
}

// 作品を、50件ずつ上限（MAX_FOR_SCORE）まで集める（評価順とおすすめ順が、全件を手元で並べるために使う）。
// capped: 上限で打ち切った（まだ続きがある）。途中で取り消されたら null
async function collectAll(load: Loader, isCancelled: () => boolean): Promise<{ works: BrowseWork[]; capped: boolean } | null> {
  const all: BrowseWork[] = []
  let after: string | null = null
  for (;;) {
    const page = await load(after)
    if (isCancelled()) return null
    all.push(...page.works.filter((w) => !all.some((x) => x.id === w.id)))
    if (!page.hasNext) return { works: all, capped: page.capped ?? false }
    if (all.length >= MAX_FOR_SCORE) return { works: all, capped: true }
    after = page.endCursor
  }
}

// active: 画面が表示されているか（隠れているだけで残っているタブは、評価のバッジを読み直さない）。
// narrow: 絞り込みのジャンル・制作会社（Shikimori の ID）。期間を選んでいるときだけ、期間の全作品からこの条件で探す（conditionSearch.ts）
export function useBrowse(token: string, active = true, narrow: Narrow | null = null) {
  const [season, setSeasonState] = useState<Season>(() => seasonOf(new Date()))
  const [query, setQuery] = useState('')
  // 絞り込みの期間（始めと終わりのクール）。あれば上のクールの代わりに、その期間の作品を読む
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
  // 並べる向き。いまの並べ方をもう一度押すと入れ替わり、ほかの並べ方を選ぶと降順に戻る
  const [dir, setDir] = useState<SortDir>('desc')
  // 評価順で並べたときの、作品（Annict の ID）ごとの点数と出どころ
  const [scores, setScores] = useState<Map<number, BrowseScore>>(new Map())
  const [progress, setProgressState] = useState<string | null>(null)
  // 進み具合が数で分かる手順（好みの読み込みで、似た作品を問い合わせているあいだ）だけ。画面が残り時間を見積もる
  const [progressWork, setProgressWork] = useState<{ done: number; total: number } | undefined>(undefined)
  const setProgress = useCallback((label: string | null, work?: { done: number; total: number }) => {
    setProgressState(label)
    setProgressWork(work)
  }, [])
  // おすすめ順で並べたときの、作品（Annict の ID）ごとの理由
  const [reasons, setReasons] = useState<Map<number, string>>(new Map())
  // 評価順・おすすめ順で、思いどおりに並べられなかったときの注意（好みの手がかりが無い・好みを読めない・Shikimori の点数を読めない）
  const [sortNote, setSortNote] = useState<string | null>(null)
  // 評価順・おすすめ順で、上限まで集めて打ち切った
  const [capped, setCapped] = useState(false)
  const mode: BrowseMode = searched ? 'search' : periodActive(period) ? 'period' : 'cour'
  const effectiveSort = sortFor(sort, mode)
  const order: BrowseOrder = effectiveSort === 'newest' ? 'SEASON' : 'WATCHERS_COUNT'
  // 条件検索の条件。チップを押しているあいだは前の条件のまま（画面は読み込んだ作品の中で絞って見せる）、押し終わってから切り替える。
  // 条件を外したとき（期間をやめた・チップを全部外した）はすぐ戻す
  const wantNarrow = mode === 'period' && narrow ? JSON.stringify(narrow) : ''
  const [narrowedState, setNarrowed] = useState('')
  const narrowed = wantNarrow === '' ? '' : narrowedState
  useEffect(() => {
    if (wantNarrow === '' || wantNarrow === narrowedState) return
    const timer = setTimeout(() => {
      setWorks(null)
      setError(null)
      setNarrowed(wantNarrow)
    }, NARROW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [wantNarrow, narrowedState])
  // 条件検索のあいだ、絞り込みのシートに選択肢を出すための、期間の作品（Annict の人気順の1ページ目）。期間ごと
  const [base, setBase] = useState<{ key: string; works: BrowseWork[] } | null>(null)
  const baseKey = useRef('')

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = query.trim()
      if (q === searchedRef.current) return
      searchedRef.current = q
      setWorks(null)
      setError(null)
      setSearched(q)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // 表紙は Annict の作品 ID ごと。Annict の画像は手元にあるので先に出し、Shikimori のポスターは取れてから足す
  const addCovers = useCallback(async (list: BrowseWork[]) => {
    setCovers((cur) => new Map([...cur, ...quickCovers(list)]))
    // 取れた分から足す（何年分もまとめて出すと作品が多く、全部を待つと長く表紙が出ない）
    const got = await fetchCovers(list, { onProgress: (part) => setCovers((cur) => new Map([...cur, ...part])) })
    setCovers((cur) => new Map([...cur, ...got]))
  }, [])

  useEffect(() => {
    let cancelled = false
    listGen.current++
    ;(async () => {
      try {
        const per = JSON.parse(periodKey) as BrowsePeriod
        const filter = await filterOf(searched, season, per)
        if (cancelled) return
        setMoreError(null)
        setLoadingMore(false)
        // 前の並べ方の読み込み中の文言を残さない（評価順の途中で人気順に変えたときなど）
        setProgress(null)
        setSortNote(null)
        setCapped(false)
        const narrowNow = narrowed ? (JSON.parse(narrowed) as Narrow) : null
        // 条件検索のあいだも、シートの選択肢のために期間の作品を1ページ読んでおく（期間が変わったときだけ。読めなくても条件検索は続ける）
        if (narrowNow && baseKey.current !== periodKey) {
          baseKey.current = periodKey
          fetchPage(token, filter, { first: 50 }).then(
            (page) => setBase({ key: periodKey, works: page.works }),
            () => undefined,
          )
        }
        // 評価順・おすすめ順で全件を集める読み方。条件検索は人気順で、中継の上限（4ページ）まで
        const loadAll: Loader = narrowNow ? findLoader(token, narrowNow, per, 'popularity') : (after) => fetchPage(token, filter, { after, first: 50 })
        // 一覧が読めたら、期間の作品として覚える（条件検索に切り替えたときの、シートの選択肢）
        const noteBase = (list: BrowseWork[]) => {
          if (narrowNow || searched || !periodActive(per)) return
          baseKey.current = periodKey
          setBase({ key: periodKey, works: list })
        }
        if (effectiveSort === 'score') {
          setProgress(t('作品を読み込み中', 'Loading anime'))
          const collected = await collectAll(loadAll, () => cancelled)
          if (!collected) return
          const all = collected.works
          // Annict の満足度が無い作品だけ、Shikimori の点数を取る
          const lacking = all.filter((w) => !(typeof w.satisfactionRate === 'number' && w.satisfactionRate > 0)).map(malIdOf).filter((n): n is number => n !== null)
          setProgress(t(`評価の点数を読み込み中（${all.length}作品）`, `Loading scores (${all.length} anime)`))
          // Shikimori が読めなくても、Annict の満足度だけで並べる（一覧ごと失敗にしない）
          let media = new Map<number, Media>()
          try {
            if (lacking.length > 0) media = await fetchMedia(lacking)
          } catch (e) {
            if (cancelled) return
            setSortNote(t(`Shikimoriの点数を読み込めませんでした（${messageOf(e)}）。Annictの満足度だけで並べています。`, `Couldn’t load Shikimori scores (${messageOf(e)}). Sorting by Annict satisfaction only.`))
          }
          if (cancelled) return
          const shikimori = new Map<number, number | null>([...media].map(([id, m]) => [id, m.score]))
          const counts = new Map<number, number | null>([...media].map(([id, m]) => [id, m.scoreCount ?? null]))
          const got = new Map<number, BrowseScore>()
          for (const w of all) {
            const sc = scoreOf(w, shikimori)
            if (sc) got.set(w.annictId, sc)
          }
          setScores((cur) => new Map([...cur, ...got]))
          setCapped(collected.capped)
          noteBase(all)
          const byScore = sortByScore(all, shikimori, counts)
          setWorks(dir === 'asc' ? reverseScored(byScore, (w) => got.has(w.annictId)) : byScore)
          setCursor({ endCursor: null, hasNext: false })
          setProgress(null)
          await addCovers(all)
        } else if (effectiveSort === 'taste') {
          // 評価順と同じく、全件を集めてから手元で並べる（「もっと見る」は無い）。
          // 好みは見たいのおすすめ順と共通（起動中は使い回す）。好みを調べられなくても、一覧は人気順で見せる
          setProgress(t('作品を読み込み中', 'Loading anime'))
          const collected = await collectAll(loadAll, () => cancelled)
          if (!collected) return
          const all = collected.works
          let ordered = all
          let why = new Map<number, string>()
          let note: string | null = null
          setProgress(t('好みを分析しています', 'Analyzing your taste'))
          try {
            const taste = await loadTaste(token, (step, _note, work) => {
              if (!cancelled) setProgress(step, work)
            })
            if (cancelled) return
            if (!taste.seeds.some((s) => s.weight > 0)) {
              note = noLikesNote()
            } else {
              setProgress(t(`作品のデータを整理しています（${all.length}作品）`, `Preparing anime data (${all.length} anime)`))
              const malIds = all.map(malIdOf).filter((n): n is number => n !== null)
              const details = malIds.length > 0 ? await fetchMedia(malIds) : new Map()
              if (cancelled) return
              const ranking = rankByTaste(all, details, taste)
              ordered = dir === 'asc' ? reverseScored(ranking.works, (w) => ranking.scored.has(w.annictId)) : ranking.works
              why = ranking.reasons
            }
          } catch (e) {
            if (cancelled) return
            note = t(`好みを読み込めませんでした（${messageOf(e)}）。人気順で並べています。`, `Couldn’t load your taste (${messageOf(e)}). Sorting by popularity instead.`)
          }
          setReasons(why)
          setSortNote(note)
          setCapped(collected.capped)
          noteBase(all)
          setWorks(ordered)
          setCursor({ endCursor: null, hasNext: false })
          setProgress(null)
          await addCovers(all)
        } else if (narrowNow && dir === 'asc') {
          // Shikimori は逆の向きに並べられないので、人気順で上限まで集めて手元で並べる（人気の低い順・放送時期の古い順）
          setProgress(t('作品を読み込み中', 'Loading anime'))
          const collected = await collectAll(loadAll, () => cancelled)
          if (!collected) return
          setCapped(collected.capped)
          setWorks(effectiveSort === 'newest' ? oldestFirst(collected.works) : [...collected.works].reverse())
          setCursor({ endCursor: null, hasNext: false })
          setProgress(null)
          await addCovers(collected.works)
        } else {
          const page = narrowNow
            ? await findLoader(token, narrowNow, per, effectiveSort === 'newest' ? 'aired_on' : 'popularity')(null)
            : await fetchPage(token, filter, { order, direction: dir === 'asc' ? 'ASC' : 'DESC' })
          if (cancelled) return
          setWorks(page.works)
          noteBase(page.works)
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
  }, [token, searched, season, periodKey, reloadTick, effectiveSort, order, dir, addCovers, narrowed])

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
  // いまの並べ方をもう一度押したら、向きを入れ替えて読み直す。ほかの並べ方は降順から。
  // いまの場合で使えない並べ方（クールでの新しい順）は人気順のままなので、一覧を空にしない（空にすると読み直しが起きず戻らない）
  const setSort = useCallback(
    (s: BrowseSort) => {
      if (s === effectiveSort) {
        setWorks(null)
        setError(null)
        setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
        return
      }
      if (sortFor(s, mode) !== effectiveSort) {
        setWorks(null)
        setError(null)
        setDir('desc')
      }
      setSortState(s)
    },
    [mode, effectiveSort],
  )

  const retry = useCallback(() => {
    setWorks(null)
    setError(null)
    setReloadTick((n) => n + 1)
  }, [])

  // 届くまでに条件を変えていたら、届いた続きは捨てる（前の条件の作品を混ぜない・前の条件の続きの位置で読まない）
  const loadMore = useCallback(async () => {
    if (!cursor.hasNext || loadingMore) return
    const gen = listGen.current
    setLoadingMore(true)
    setMoreError(null)
    try {
      const page = narrowed
        ? await findLoader(token, JSON.parse(narrowed) as Narrow, period, effectiveSort === 'newest' ? 'aired_on' : 'popularity')(cursor.endCursor)
        : await fetchPage(token, await filterOf(searched, season, period), { after: cursor.endCursor, order, direction: dir === 'asc' ? 'ASC' : 'DESC' })
      if (gen !== listGen.current) return
      setWorks((cur) => [...(cur ?? []), ...page.works.filter((w) => !cur?.some((c) => c.id === w.id))])
      setCursor({ endCursor: page.endCursor, hasNext: page.hasNext })
      await addCovers(page.works)
    } catch (e) {
      if (gen === listGen.current) setMoreError(messageOf(e))
    } finally {
      if (gen === listGen.current) setLoadingMore(false)
    }
  }, [token, searched, season, period, order, dir, cursor, loadingMore, addCovers, narrowed, effectiveSort])

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

  // 絞り込みのシートの選択肢に使う作品。条件検索のあいだは、期間の作品と条件検索の結果を合わせる（制作会社は「どれか」なので、選んでいない会社も出す）
  const pool = narrowed && works && base?.key === periodKey ? [...works, ...base.works.filter((b) => !works.some((w) => w.id === b.id))] : works

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
    // 上限の作品数（「人気の上位◯作品」の注意に出す）
    capLimit: narrowed ? FIND_MAX_WORKS : MAX_FOR_SCORE,
    // 期間の全作品から、ジャンル・制作会社の条件で探しているか
    narrowed: narrowed !== '',
    pool,
    sort: effectiveSort,
    dir,
    setSort,
    scores,
    reasons,
    sortNote,
    progress,
    progressWork,
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
