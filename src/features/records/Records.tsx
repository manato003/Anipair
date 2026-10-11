import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BackIcon, CalendarIcon, ChartIcon, CheckIcon, FilterIcon, PauseIcon, PlayIcon, TrophyIcon } from '../../components/Icons'
import { Bookmark } from '../../components/Bookmark'
import { loadTitlesState } from '../achievements/achievementStore'
import { useTitleWatch } from '../achievements/titleCheck'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { HeadActions } from '../../components/ControlCenter'
import { SaveStatus } from '../../components/SaveStatus'
import type { Episode, RatingState, StatusState } from '../../lib/annict'
import { RATING_LABEL } from '../../lib/reviewOps'
import type { Media } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { rememberScroll, restoreScroll, scrollToTop } from '../../lib/pageScroll'
import { useSwipeIntercept } from '../../lib/useSwipeNav'
import { useWide } from '../../lib/useWide'
import { seasonLabel, type Season } from '../../lib/season'
import { CourNav } from '../../components/CourNav'
import { PinnedLine } from '../../components/PinnedLine'
import { formatMinutes } from '../../lib/watchFacts'
import { workMeta } from '../browse/detail'
import { WorkDetail, type WorkSeed } from '../browse/WorkDetail'
import { malIdOf } from '../match/taste'
import { genreName } from '../match/taste'
import { RATINGS } from '../rate/queue'
import {
  BUCKETS,
  EMPTY_FILTER,
  MEDIA_KINDS,
  SEASON_KEYS,
  STATE_OPTIONS,
  activeFilterCount,
  applyFilter,
  countBuckets,
  filterRows,
  formatDate,
  optionState,
  sortNote,
  sortOptions,
  sortRows,
  type Bucket,
  type MediaInfo,
  type RecordFilter,
  type RecordRow,
  type SortChoice,
  type SortKey,
} from './recordList'
import { RecordFilterSheet } from './RecordFilterSheet'
import { useEpisodes } from './useEpisodes'
import { useMediaInfo } from './useMediaInfo'
import { useRecords } from './useRecords'
import { useTaste, useWannaScores } from './useTaste'
import { useTrendsData } from './useTrendsData'
import { orderByScore } from './wannaRank'
import { Loading } from '../../components/Loading'
import { episodeLabel, episodesLeft, nextEpisode, nextLabel } from './episodes'
import type { GithubConnection } from '../../lib/github'
import { useCoalescedTask } from '../../lib/useCoalescedTask'
import { noteOf, priorityFirst } from './wannaNotes'
import { loadLocalWannaNotes, setWannaNote, syncWannaNotes } from './wannaNoteStore'
import { WannaNoteSheet } from './WannaNoteSheet'
import { StaleNote } from '../../components/StaleNote'
import { SortRow } from '../../components/SortRow'
import { reducedMotion, useViewingSeason } from '../../lib/theme'

// 傾向・ふり返り（図と共有の画像）と実績は、開いたときに別のファイルから読む（記録の一覧を早く出す）
const TrendsView = lazy(() => import('./TrendsView').then((m) => ({ default: m.TrendsView })))
const YearReview = lazy(() => import('./YearReview').then((m) => ({ default: m.YearReview })))
const Achievements = lazy(() => import('../achievements/Achievements').then((m) => ({ default: m.Achievements })))

// 記録の項目。作品の4つ（状態）と、まとめの3つ（傾向・ふり返り・実績）。
// スマホは上に作品の4つ＋「まとめ」（まとめは一覧を挟む: 'summary' がその一覧）。PC は右の縦の列に7つを並べる
type SummaryItem = 'trends' | 'year' | 'achievements'
type Item = Bucket | 'summary' | SummaryItem

const SUMMARY: readonly { id: SummaryItem; label: string; sub: string; icon: ReactNode }[] = [
  { id: 'trends', label: '傾向', sub: 'ジャンル・声優・季節の図。画像で共有', icon: <ChartIcon /> },
  { id: 'year', label: 'ふり返り', sub: '1年に見た本数と、よかった作品', icon: <CalendarIcon /> },
  { id: 'achievements', label: '実績', sub: '称号の一覧と、掲げる称号', icon: <TrophyIcon /> },
]

const BUCKET_ICON: Record<Bucket, ReactNode> = { watching: <PlayIcon />, watched: <CheckIcon />, wanna: <Bookmark />, other: <PauseIcon /> }

const isSummary = (item: Item): item is SummaryItem | 'summary' => item === 'summary' || SUMMARY.some((s) => s.id === item)
// 項目の並び（払う・中身が入る向きに使う）。まとめの中はひとまとまり
const order = (item: Item) => (isSummary(item) ? BUCKETS.length + Math.max(0, SUMMARY.findIndex((s) => s.id === item)) : BUCKETS.findIndex((b) => b.id === item))

function labelOf(item: Item): string {
  if (item === 'summary') return 'まとめ'
  return BUCKETS.find((b) => b.id === item)?.label ?? SUMMARY.find((s) => s.id === item)?.label ?? ''
}

export function Records({ token, github = null, active }: { token: string; github?: GithubConnection | null; active: boolean }) {
  const r = useRecords(token, active)
  const wide = useWide()
  // 記録が変わったら、裏で称号を計算し、新しく手に入れた称号を右上に知らせる
  useTitleWatch(token, r.rows)
  // 見たいの「優先して見る」とメモ（端末の控え。GitHub と連携していれば、開いたときと変えたあとに同期する）
  const [notes, setNotes] = useState(() => loadLocalWannaNotes())
  const [noteFor, setNoteFor] = useState<RecordRow | null>(null)
  const syncNotes = useMemo(() => (github ? async () => setNotes(await syncWannaNotes(github)) : null), [github])
  const syncNotesLater = useCoalescedTask(r.enqueue, '見たいの印とメモの GitHub への保存', syncNotes)
  const syncedWith = useRef<GithubConnection | null>(null)
  useEffect(() => {
    if (!active || !github || syncedWith.current === github) return
    syncedWith.current = github
    syncNotesLater()
  }, [active, github, syncNotesLater])
  const saveNote = (row: RecordRow, value: { priority: boolean; memo: string }) => {
    setNotes(setWannaNote(row.entry.annictId, value))
    syncNotesLater()
  }
  // まだ一度も実績を開いていない（覚醒を見ていない）あいだは、「まとめ」と「実績」に光る点を付けて気づかせる
  const [achievementsUnseen, setAchievementsUnseen] = useState(() => !loadTitlesState().awakened)

  // 選んだ項目（選ぶまでは null: 「見てる」があれば見てる、無ければ「見た」。記録ページの用事でいちばん多いのは、今期見ている作品の話ごとの記録なので）
  const [picked, setPicked] = useState<Item | null>(null)
  // まとめを一度でも開いたら、傾向とふり返りに使う作品の情報を読む（ふり返りと傾向で一度だけ）
  const [summarySeen, setSummarySeen] = useState(false)
  // 並べ替えは状態ごとに持つ（見たは評価順、ほかは記録順から）。押している並べ替えをもう一度押すと、昇順と降順が入れ替わる。
  // 見たいのおすすめ順は好みを調べてから並べる（重いので、選んだときだけ）
  const [sortBy, setSortBy] = useState<Record<Bucket, SortChoice>>({
    watched: { key: 'rating', dir: 'desc' },
    wanna: { key: 'recorded', dir: 'desc' },
    watching: { key: 'recorded', dir: 'desc' },
    other: { key: 'recorded', dir: 'desc' },
  })
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  // 絞り込み（どの状態にも効く）。ジャンル・制作会社は、シートを開いたときかその条件をかけているときだけ Shikimori から読む
  const [filter, setFilter] = useState<RecordFilter>(EMPTY_FILTER)
  // 地の色を、絞っているクールの季節に（「すべて」のときは、いまの季節）
  useViewingSeason(filter.cour?.name ?? null, active)
  const [filterOpen, setFilterOpen] = useState(false)
  const entries = useMemo(() => (r.rows ? r.rows.map((row) => row.entry) : null), [r.rows])
  const media = useMediaInfo(entries, filterOpen || filter.genres.length > 0 || filter.studios.length > 0)
  // 詳細のシートを開いている記録。開いた時点の手がかりを持つので、一覧の読み直しやシートでの変更で消えても、シートは閉じない
  // （手がかりの参照が変わるとシートが読み直すので、毎回作り直さない）
  const [open, setOpen] = useState<{ seed: WorkSeed; cover: Cover | null } | null>(null)
  // 詳細で開いている見たいの作品の、優先とメモ（詳細の「あなたの記録」から変えられる）
  const openWannaRow = open ? r.rows?.find((row) => row.entry.annictId === open.seed.annictId && row.entry.state === 'WANNA_WATCH') : undefined
  const openNote = openWannaRow ? noteOf(notes, openWannaRow.entry.annictId) : null
  const openWanna = openWannaRow
    ? {
        priority: openNote?.priority === true,
        memo: openNote?.memo ?? '',
        onTogglePriority: () => saveNote(openWannaRow, { priority: !openNote?.priority, memo: openNote?.memo ?? '' }),
        onEditMemo: () => setNoteFor(openWannaRow),
      }
    : undefined
  const openRow = ({ entry, cover }: RecordRow) =>
    setOpen({ seed: { id: entry.workId, annictId: entry.annictId, title: entry.title, malAnimeId: entry.malAnimeId, viewerStatusState: entry.state }, cover })

  // 絞り込んだあとの記録（状態ごとの件数も、これで数える）
  const filtered = useMemo(() => applyFilter(r.rows ?? [], filter, media.info), [r.rows, filter, media.info])
  const counts = useMemo(() => countBuckets(filtered), [filtered])
  const fallback: Item = !r.rows || counts.watching > 0 ? 'watching' : 'watched'
  // PC には「まとめ」の一覧が無い（縦の列に3つとも並ぶ）ので、傾向を出す
  const item: Item = picked === 'summary' && wide ? 'trends' : (picked ?? fallback)
  const bucket: Bucket | null = isSummary(item) ? null : item
  const trendsData = useTrendsData(token, r.rows, summarySeen)

  // 話ごとの記録。話の一覧は、詳細で開いた「見た」「見てる」の作品と、見てるの棚に並んだ作品の分だけ読み、閉じても控えておく
  // （一覧の「次は 第5話」を、記録した話に合わせるため。送信は記録ページの書き込みの列）
  const openState = open ? r.rows?.find((row) => row.entry.annictId === open.seed.annictId)?.entry.state : undefined
  const watchingRows = useMemo(() => (r.rows ?? []).filter((row) => row.entry.state === 'WATCHING'), [r.rows])
  const showWatching = active && item === 'watching'
  const episodeIds = useMemo(() => {
    const ids = showWatching ? watchingRows.map((row) => row.entry.workId) : []
    if (open && (openState === 'WATCHING' || openState === 'WATCHED')) ids.push(open.seed.id)
    return ids
  }, [open, openState, showWatching, watchingRows])
  const eps = useEpisodes(token, episodeIds, r.enqueue)
  // 見てる作品の1話の長さ（残りの時間の目安）。見てるを開いたときだけ、見てる作品の分を読む
  const watchingEntries = useMemo(() => watchingRows.map((row) => row.entry), [watchingRows])
  const watchMedia = useMediaInfo(watchingEntries, showWatching)
  // 見てるのカードから記録した話（作品ごと。取り消せるあいだ「取り消す」を出す）
  const [lastRecorded, setLastRecorded] = useState<ReadonlyMap<string, Episode>>(new Map())

  const sort = sortBy[bucket ?? 'watched']
  const chooseSort = (key: SortKey) => {
    if (!bucket) return
    setSortBy((cur) => ({ ...cur, [bucket]: cur[bucket].key === key ? { key, dir: cur[bucket].dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' } }))
  }
  const byTaste = bucket === 'wanna' && sort.key === 'taste'
  const taste = useTaste(token, byTaste, active)
  const wannaKey = useMemo(
    () =>
      [...new Set((r.rows ?? []).filter((row) => row.entry.state === 'WANNA_WATCH').map((row) => malIdOf(row.entry)).filter((n): n is number => n !== null))]
        .sort((a, b) => a - b)
        .join(','),
    [r.rows],
  )
  const wanna = useWannaScores(byTaste && taste.state.status === 'ready' ? taste.state.taste : null, wannaKey)
  const scores = byTaste ? wanna.scores : null
  const visible = useMemo(() => {
    if (!bucket) return []
    const sorted = sortRows(filterRows(filtered, bucket, query), sort.key, sort.dir)
    // 見たいは「優先して見る」の作品を先に（それぞれの中は選んだ並べ方のまま）
    const rows = bucket === 'wanna' ? priorityFirst(sorted, (row) => noteOf(notes, row.entry.annictId)?.priority === true) : sorted
    if (!scores) return rows
    // おすすめ順: 点数のある作品を点数の順に（昇順なら逆に）、点数の無い作品は最後
    const ranked = orderByScore(rows, (row) => malIdOf(row.entry), scores)
    const isPriority = (row: RecordRow) => noteOf(notes, row.entry.annictId)?.priority === true
    if (sort.dir === 'desc') return priorityFirst(ranked, isPriority)
    const scored = ranked.filter((row) => scores.has(malIdOf(row.entry) ?? -1))
    return priorityFirst([...scored.reverse(), ...ranked.filter((row) => !scores.has(malIdOf(row.entry) ?? -1))], isPriority)
  }, [filtered, bucket, query, sort, scores, notes])
  const filterCount = activeFilterCount(filter)
  // 一覧の上で選ぶクール。選ぶと、絞り込みのシートの放送年の範囲と季節は外す（条件が重なるので）
  const chooseCour = (cour: Season | null) => setFilter((f) => (cour ? { ...f, cour, yearFrom: null, yearTo: null, seasons: [] } : { ...f, cour: null }))
  // クールと並べ替えの帯。スマホで流して見えなくなったら、上のタブの下に細い1行で出す
  const barRef = useRef<HTMLDivElement>(null)
  const rtabsRef = useRef<HTMLDivElement>(null)
  // 見てる作品の次の話。話の一覧を読み込んだ作品はその値（この画面で記録した直後も合う）、まだならライブラリの次の話
  const watchNext = (row: RecordRow): string | null => {
    const data = eps.byWork.get(row.entry.workId)
    if (data && !data.noEpisodes && data.episodes.length > 0) {
      const n = nextEpisode(data.episodes)
      return n ? nextLabel(n) : '最後の話まで記録しました'
    }
    return row.entry.nextEpisode ? nextLabel(row.entry.nextEpisode) : null
  }
  // おすすめ順の読み込みの状況（読み込み中・失敗）
  const tasteError = byTaste ? (taste.state.status === 'error' ? taste.state.message : wanna.error) : null
  const tasteLoading = byTaste && !tasteError && !scores

  // 項目を替える。流した位置は項目ごとに覚えて戻し、中身は替えた向きから入る（スマホは横、PC は縦。XMB の動き）
  const bodyRef = useRef<HTMLDivElement>(null)
  const [headSlot, setHeadSlot] = useState<HTMLSpanElement | null>(null)
  const slide = useRef<'next' | 'prev' | null>(null)
  const select = (next: Item) => {
    // いまの項目をもう一度押したら、いちばん上へ
    if (next === item) {
      scrollToTop()
      return
    }
    rememberScroll(`records:${item}`)
    slide.current = order(next) > order(item) ? 'next' : order(next) < order(item) ? 'prev' : null
    setPicked(next)
    setEditing(false)
    if (isSummary(next)) setSummarySeen(true)
    if (next === 'achievements') setAchievementsUnseen(false)
  }
  useLayoutEffect(() => {
    if (!active) return
    restoreScroll(`records:${item}`)
    const dir = slide.current
    slide.current = null
    const el = bodyRef.current
    if (!dir || !el || typeof el.animate !== 'function' || reducedMotion()) return
    const sign = dir === 'next' ? 1 : -1
    el.animate([{ opacity: 0, transform: wide ? `translateY(${sign * 16}%)` : `translateX(${sign * 24}%)` }, { opacity: 1, transform: 'none' }], {
      duration: wide ? 320 : 280,
      easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)',
    })
    // 項目を替えたときだけ動かす（active・wide の変化では動かさない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  // スマホでは、払うとまず上の項目を替える。端の項目からさらに払うと、隣の分類へ（App の払い）
  const tabs: Item[] = [...BUCKETS.map((b) => b.id), 'summary']
  useSwipeIntercept((dir) => {
    if (wide) return false
    // まとめの中（傾向・ふり返り・実績）では、左へ払うとまずまとめの一覧に戻る
    if (dir === 'prev' && isSummary(item) && item !== 'summary') {
      select('summary')
      return true
    }
    const i = isSummary(item) ? tabs.length - 1 : tabs.indexOf(item)
    const next = tabs[i + (dir === 'next' ? 1 : -1)]
    if (!next) return false
    select(next)
    return true
  }, active)

  const countOf = (b: Bucket) => counts[b]
  const dot = achievementsUnseen && <span className="viewswitch__dot" aria-label="まだ見ていません" />

  return (
    <section className="records records--items">
      <h1 className="visually-hidden">記録</h1>
      {wide ? (
        // PC: 右端の縦の列（ブラウザの縦タブの形）
        <nav className="rrail" aria-label="記録の項目">
          {[...BUCKETS.map((b) => ({ id: b.id as Item, label: b.label, icon: BUCKET_ICON[b.id] })), ...SUMMARY].map((x) => (
            <button key={x.id} type="button" className="rrail__item" aria-current={item === x.id ? 'true' : undefined} onClick={() => select(x.id)}>
              {x.icon}
              <span>{x.label}</span>
              {x.id === 'achievements' && dot}
            </button>
          ))}
        </nav>
      ) : (
        // スマホ: 上に作品の4つ＋まとめ
        <div className="rtabs" role="tablist" aria-label="記録の項目" ref={rtabsRef}>
          {BUCKETS.map((b) => (
            <button key={b.id} type="button" role="tab" className="rtabs__tab" aria-selected={item === b.id} onClick={() => select(b.id)}>
              {BUCKET_ICON[b.id]}
              <span>{b.label}</span>
            </button>
          ))}
          <button type="button" role="tab" className="rtabs__tab rtabs__tab--summary" aria-selected={isSummary(item)} onClick={() => select('summary')}>
            <ChartIcon />
            <span>まとめ</span>
            {dot}
          </button>
        </div>
      )}

      <div className="records__body" ref={bodyRef}>
        <header className="rhead">
          {!wide && isSummary(item) && item !== 'summary' && (
            <button type="button" className="rhead__back" onClick={() => select('summary')}>
              <BackIcon />
              まとめ
            </button>
          )}
          <h2 className="rhead__title">
            {labelOf(item)}
            {bucket && r.rows && <span className="rhead__count">{countOf(bucket)}</span>}
          </h2>
          <span className="rhead__actions">
            {/* 傾向・ふり返りの「画像で共有」の置き場 */}
            <span className="rhead__slot" ref={setHeadSlot} />
            {bucket && (
              <button type="button" className={editing ? 'btn btn--primary rhead__edit' : 'btn rhead__edit'} onClick={() => setEditing((e) => !e)} disabled={!r.rows}>
                {editing ? '完了' : '編集'}
              </button>
            )}
            <HeadActions topic="records" active={active} />
          </span>
        </header>

        {bucket ? (
          <>
            <div className="records__controls">
              <div className="records__tools">
                <input
                  className="search"
                  type="search"
                  placeholder="タイトルで絞り込む"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="タイトルで絞り込む"
                />
                <button type="button" className="btn records__filterbtn" aria-pressed={filterCount > 0} onClick={() => setFilterOpen(true)}>
                  <FilterIcon />
                  絞り込み
                  {filterCount > 0 && <span className="chip__count">{filterCount}</span>}
                </button>
              </div>
            </div>

            {/* クールと並べ替えの帯（ブラウズと同じ形）。記録はもともと全クールなので「すべて」から。
                PC は流しても上に残す（貼りつきは親の箱の中でしか効かないので、操作の欄の外に置く） */}
            <div className="browse__bar records__bar" ref={barRef}>
              <CourNav value={filter.cour ?? null} onChange={chooseCour} allowAll />
              <SortRow options={sortOptions(bucket)} value={sort.key} dir={sort.dir} onChoose={chooseSort} />
            </div>
            <PinnedLine
              target={barRef}
              under={rtabsRef}
              enabled={active && !wide}
              label={`${filter.cour ? seasonLabel(filter.cour) : 'すべてのクール'} · ${sortOptions(bucket).find((o) => o.key === sort.key)?.label ?? ''}${sort.dir === 'desc' ? '↓' : '↑'}`}
            />

            <div className="records__controls records__controls--notes">
              <p className="note records__sortnote">
                {sortNote(sort)}
                {bucket === 'wanna' && visible.some((row) => noteOf(notes, row.entry.annictId)?.priority) ? '★優先の作品を先に並べています。' : ''}
              </p>
              {filterCount > 0 && <ActiveFilters filter={filter} onChange={setFilter} />}
              {tasteLoading && <Loading label="好みを分析しています" />}
              {tasteError && (
                <p className="note">
                  好みを調べられませんでした（{tasteError}）。新しい順で並べています。
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      taste.retry()
                      wanna.retry()
                    }}
                  >
                    もう一度
                  </button>
                </p>
              )}
            </div>

            <div className="records__list">
              {r.loadError ? (
                <Empty mood="trouble" title="記録を読み込めませんでした" body={r.loadError}>
                  <button type="button" className="btn" onClick={r.reload}>
                    もう一度読み込む
                  </button>
                </Empty>
              ) : !r.rows ? (
                <Loading block label="Annict の記録を読み込み中" />
              ) : visible.length === 0 ? (
                query || filterCount > 0 || filter.cour ? (
                  <Empty
                    mood="empty"
                    title="当てはまる作品がありません"
                    body={filterCount > 0 ? '絞り込みの条件をゆるめてください。' : filter.cour ? `${seasonLabel(filter.cour)}の作品は、ここにはありません。` : '別の言葉で絞り込んでください。'}
                  >
                    {filterCount > 0 && (
                      <button type="button" className="btn" onClick={() => setFilter({ ...EMPTY_FILTER, cour: filter.cour ?? null })}>
                        絞り込みを解除する
                      </button>
                    )}
                    {filter.cour && (
                      <button type="button" className="btn" onClick={() => chooseCour(null)}>
                        すべてのクールにする
                      </button>
                    )}
                  </Empty>
                ) : (
                  <Empty mood="empty" title="まだありません" body="評価画面やマッチングで記録すると、ここに並びます。" />
                )
              ) : editing ? (
                // 編集は1行ずつの形（評価・状態・記録から外す・見たいのメモを、その場で変える）
                <ul className="rows rows--edit">
                  {visible.map((row) => (
                    <RecordItem
                      key={row.entry.annictId}
                      row={row}
                      onOpen={() => openRow(row)}
                      onRate={(rating) => r.setRating(row, rating)}
                      onState={(state) => r.setState(row, state)}
                      wanna={row.entry.state === 'WANNA_WATCH' ? (noteOf(notes, row.entry.annictId) ?? { priority: false, memo: '' }) : null}
                      onWannaPriority={() => {
                        const cur = noteOf(notes, row.entry.annictId)
                        saveNote(row, { priority: !cur?.priority, memo: cur?.memo ?? '' })
                      }}
                      onWannaMemo={() => setNoteFor(row)}
                    />
                  ))}
                </ul>
              ) : bucket === 'watching' ? (
                <ul className="watchcards">
                  {visible.map((row) => {
                    const data = eps.byWork.get(row.entry.workId)
                    const episodes = data && !data.noEpisodes ? data.episodes : null
                    const last = lastRecorded.get(row.entry.workId) ?? null
                    return (
                      <WatchCard
                        key={row.entry.annictId}
                        row={row}
                        next={watchNext(row)}
                        episodes={episodes}
                        episodesError={eps.errors.get(row.entry.workId) ?? null}
                        noEpisodes={data?.noEpisodes === true}
                        onRetry={eps.retry}
                        media={watchMedia.info ? (watchMedia.info.get(malIdOf(row.entry) ?? -1) ?? null) : watchMedia.error ? null : undefined}
                        undoable={last !== null && eps.undoable.has(last.id) ? last : null}
                        onOpen={() => openRow(row)}
                        onRecord={(ep, rating) => {
                          eps.record(row.entry.title, row.entry.workId, ep, rating)
                          setLastRecorded((cur) => new Map(cur).set(row.entry.workId, ep))
                        }}
                        onUndo={(ep) => eps.undo(row.entry.title, row.entry.workId, ep)}
                      />
                    )
                  })}
                </ul>
              ) : (
                <ul className="shelf">
                  {visible.map((row) => (
                    <ShelfItem
                      key={row.entry.annictId}
                      row={row}
                      note={scores?.get(malIdOf(row.entry) ?? -1)?.reason ?? null}
                      onOpen={() => openRow(row)}
                      wanna={row.entry.state === 'WANNA_WATCH' ? (noteOf(notes, row.entry.annictId) ?? { priority: false, memo: '' }) : null}
                      onWannaPriority={() => {
                        const cur = noteOf(notes, row.entry.annictId)
                        saveNote(row, { priority: !cur?.priority, memo: cur?.memo ?? '' })
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : item === 'summary' ? (
          // スマホの「まとめ」: 傾向・ふり返り・実績の一覧から開く
          <ul className="folders">
            {SUMMARY.map((s) => (
              <li key={s.id}>
                <button type="button" className="folder" onClick={() => select(s.id)}>
                  {s.icon}
                  <b>{s.label}</b>
                  <small>{s.sub}</small>
                  {/* まとめのタブの光る点が、どれのことかを言葉で示す（点だけでは、どれを押せば消えるか分からなかった。Issue #23） */}
                  {s.id === 'achievements' && achievementsUnseen && <span className="folder__new">まだ開いていません</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : !r.rows ? (
          r.loadError ? (
            <Empty mood="trouble" title="記録を読み込めませんでした" body={r.loadError}>
              <button type="button" className="btn" onClick={r.reload}>
                もう一度読み込む
              </button>
            </Empty>
          ) : (
            <Loading block label="Annict の記録を読み込み中" />
          )
        ) : (
          <Suspense fallback={<Loading block label="読み込み中" />}>
            {item === 'trends' && <TrendsView rows={r.rows} data={trendsData} active={active} actions={headSlot} />}
            {item === 'year' && <YearReview rows={r.rows} media={trendsData.media ?? EMPTY_MEDIA} credits={trendsData.credits} active={active} actions={headSlot} />}
            {item === 'achievements' && <Achievements token={token} rows={r.rows} loadError={r.loadError} onReload={r.reload} active={active} />}
          </Suspense>
        )}
      </div>

      <SaveStatus pending={r.pending} failed={r.failed} onRetry={r.retryFailed} onDismiss={r.dismissFailed} />
      <StaleNote at={active ? r.staleAt : null} error={r.refreshError} onRetry={r.retryRefresh} />

      {filterOpen && r.rows && (
        <RecordFilterSheet
          rows={r.rows}
          filter={filter}
          info={media.info}
          infoError={media.error}
          resultCount={visible.length}
          active={active}
          onChange={setFilter}
          onClose={() => setFilterOpen(false)}
        />
      )}


      {open && (
        <WorkDetail
          key={open.seed.annictId}
          token={token}
          work={open.seed}
          cover={open.cover}
          active={active && noteFor === null}
          enqueue={r.enqueue}
          episodes={eps}
          onChange={(patch) => r.patchRecord(open.seed.annictId, patch)}
          onRelatedChange={(work, patch) => r.noteRelatedChange(work.annictId, patch)}
          wanna={openWanna}
          onClose={() => setOpen(null)}
        />
      )}

      {/* メモのシートは、詳細の上に重ねて開くことがあるので、詳細より後に描く */}
      {noteFor && (
        <WannaNoteSheet
          title={noteFor.entry.title}
          priority={noteOf(notes, noteFor.entry.annictId)?.priority ?? false}
          memo={noteOf(notes, noteFor.entry.annictId)?.memo ?? ''}
          githubRepo={github?.repo ?? null}
          active={active}
          onSave={(value) => saveNote(noteFor, value)}
          onClose={() => setNoteFor(null)}
        />
      )}
    </section>
  )
}

const EMPTY_MEDIA: ReadonlyMap<number, Media> = new Map()


// かけている絞り込みの条件。1つずつ外せる
function ActiveFilters({ filter: f, onChange }: { filter: RecordFilter; onChange: (next: RecordFilter) => void }) {
  const items: { label: string; clear: () => void }[] = []
  if (f.ratings.length > 0)
    items.push({ label: `評価: ${f.ratings.map((x) => (x === 'NONE' ? '評価なし' : RATING_LABEL[x])).join('・')}`, clear: () => onChange({ ...f, ratings: [] }) })
  if (f.yearFrom !== null || f.yearTo !== null)
    items.push({
      label: f.yearFrom !== null && f.yearTo !== null ? `${f.yearFrom}〜${f.yearTo}年` : f.yearFrom !== null ? `${f.yearFrom}年〜` : `〜${f.yearTo}年`,
      clear: () => onChange({ ...f, yearFrom: null, yearTo: null }),
    })
  if (f.seasons.length > 0)
    items.push({ label: `季節: ${SEASON_KEYS.filter((x) => f.seasons.includes(x.id)).map((x) => x.label).join('・')}`, clear: () => onChange({ ...f, seasons: [] }) })
  if (f.media.length > 0)
    items.push({ label: `形式: ${MEDIA_KINDS.filter((x) => f.media.includes(x.id)).map((x) => x.label).join('・')}`, clear: () => onChange({ ...f, media: [] }) })
  if (f.genres.length > 0) items.push({ label: `ジャンル: ${f.genres.map(genreName).join('・')}`, clear: () => onChange({ ...f, genres: [] }) })
  if (f.studios.length > 0) items.push({ label: `制作会社: ${f.studios.join('・')}`, clear: () => onChange({ ...f, studios: [] }) })
  return (
    <div className="activefilters">
      {items.map((it) => (
        <button key={it.label} type="button" className="activefilter" onClick={it.clear} aria-label={`${it.label} の条件を外す`}>
          {it.label}
          <span aria-hidden>×</span>
        </button>
      ))}
      <button type="button" className="link" onClick={() => onChange({ ...EMPTY_FILTER, cour: f.cour ?? null })}>
        すべて解除
      </button>
    </div>
  )
}

// 棚の1作品（表紙と題名）。見たは評価、見たいは優先の印（押して付け外し）とメモを添える
function ShelfItem(props: {
  row: RecordRow
  // おすすめ順の理由
  note: string | null
  onOpen: () => void
  wanna: { priority: boolean; memo: string } | null
  onWannaPriority: () => void
}) {
  const { entry, review, cover } = props.row
  const rating = review?.ratingOverallState ?? null
  return (
    <li className="shelf__item">
      <button type="button" className="shelf__open" onClick={props.onOpen} aria-label={`${entry.title}の詳細`}>
        <span className="shelf__cover">
          {cover ? <CoverImage cover={cover} size="thumb" lazy fallback={<span className="shelf__noimage">{entry.title}</span>} /> : <span className="shelf__noimage">{entry.title}</span>}
        </span>
        <span className="shelf__title" aria-hidden>
          {entry.title}
        </span>
      </button>
      {/* 見たいの作品は右上を優先の印に使う（ふつう評価は付かないが、付いていても重ねない） */}
      {rating && !props.wanna && <span className={`shelf__badge badge--${rating.toLowerCase()}`}>{RATING_LABEL[rating]}</span>}
      {/* 優先の印は表紙の右上に、上端から下がるしおりの形で（見たいの作品には評価の印が付かないので、右上が空いている）。
          押せる範囲は、しおりより大きく取る */}
      {props.wanna && (
        <button
          type="button"
          className="shelf__star"
          aria-pressed={props.wanna.priority}
          aria-label={`${entry.title}を優先して見る`}
          title="優先して見る"
          onClick={props.onWannaPriority}
        >
          <span className="shelf__ribbon" aria-hidden>
            {props.wanna.priority ? '★' : '☆'}
          </span>
        </button>
      )}
      {props.wanna?.memo && <span className="shelf__memo">{props.wanna.memo}</span>}
      {props.note && <span className="shelf__reason">{props.note}</span>}
    </li>
  )
}

// 見てる作品のカード: 次の話・残りの話数と時間の目安・進み具合。次の話は、その場で4段階の評価を押して記録する
// （詳細の「話ごとの記録」と同じく、評価が記録の一部。評価を付けずに記録されてしまわないように）
function WatchCard(props: {
  row: RecordRow
  next: string | null
  // 話の一覧（読み込んだら）。読めなかったときの理由と、Annict に話の情報が無い作品か
  episodes: readonly Episode[] | null
  episodesError: string | null
  noEpisodes: boolean
  onRetry: () => void
  // 1話の長さ・全話数・放送中か（Shikimori。読み込み中は undefined、情報が無い・読めなければ null）
  media: MediaInfo | null | undefined
  // このカードで記録して、まだ取り消せる話
  undoable: Episode | null
  onOpen: () => void
  onRecord: (episode: Episode, rating: RatingState) => void
  onUndo: (episode: Episode) => void
}) {
  const { entry, cover } = props.row
  const eps = props.episodes
  // 放送中かが分かるまでは、残りと進み具合を出さない（放送済みの話だけで数えた棒が、あとから縮むのを見せない）
  const counted = eps && eps.length > 0 && props.media !== undefined ? episodesLeft(eps) : null
  // 放送中の作品は、Annict に載っているのが放送済みの話だけ。進み具合の棒は全話数（Shikimori）で描き、残りは「放送済みの残り」と書く
  const airing = props.media?.airing === true
  const progress = counted && { ...counted, total: Math.max(counted.total, props.media?.episodes ?? 0) }
  const next = eps ? nextEpisode(eps) : null
  const minutes = props.media?.minutes ?? null
  const undoable = props.undoable
  const left =
    counted && counted.left > 0
      ? [`${airing ? '放送済みの残り' : '残り'}${counted.left}話`, minutes ? formatMinutes(counted.left * minutes) : null].filter(Boolean).join('・')
      : null
  return (
    <li className="watchcard">
      <button type="button" className="watchcard__cover" onClick={props.onOpen} tabIndex={-1} aria-hidden>
        {cover && <CoverImage cover={cover} size="thumb" lazy />}
      </button>
      <div className="watchcard__body">
        <button type="button" className="watchcard__title" onClick={props.onOpen} aria-label={`${entry.title}の詳細`}>
          {entry.title}
        </button>
        {props.next && <p className="watchcard__next">{props.next}</p>}
        {left && <p className="watchcard__left">{left}</p>}
        {progress && (
          <span className="watchcard__bar" role="img" aria-label={`${progress.total}話のうち${progress.done}話まで`}>
            <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </span>
        )}
        {/* 話の一覧を読むまでは、記録のボタンを出せない。読み込み中と失敗は黙らずに出す */}
        {!eps && !props.noEpisodes && !props.episodesError && <p className="watchcard__left">話の一覧を読み込み中…</p>}
        {props.episodesError && (
          <p className="watchcard__left">
            話の一覧を読み込めませんでした（{props.episodesError}）。
            <button type="button" className="link" onClick={props.onRetry}>
              もう一度
            </button>
          </p>
        )}
        {props.noEpisodes && <p className="watchcard__left">Annict に話の情報が無いので、ここでは記録できません。</p>}
        {next && (
          <div className="watchcard__rate">
            <p className="watchcard__ratelabel">{episodeLabel(next)}を評価して記録</p>
            <div className="mini-ratings" role="group" aria-label={`${episodeLabel(next)}の評価`}>
              {RATINGS.map((r) => (
                <button key={r.rating} type="button" className={`mini-rating mini-rating--${r.rating.toLowerCase()}`} onClick={() => props.onRecord(next, r.rating)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {undoable && (
          <div className="watchcard__actions">
            <button type="button" className="link" onClick={() => props.onUndo(undoable)}>
              {episodeLabel(undoable)}の記録を取り消す
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

// 編集の1行: 評価・状態・記録から外す。見たいは優先とメモも
function RecordItem(props: {
  row: RecordRow
  onOpen: () => void
  onRate: (rating: RatingState | null) => void
  onState: (state: StatusState) => void
  // 見たいの作品の「優先して見る」とメモ（見たい以外は null）
  wanna?: { priority: boolean; memo: string } | null
  onWannaPriority?: () => void
  onWannaMemo?: () => void
}) {
  const { entry, review, cover } = props.row
  const rating = review?.ratingOverallState ?? null
  return (
    <li className="row">
      <button type="button" className="row__thumb" onClick={props.onOpen} tabIndex={-1} aria-hidden>
        {cover && <CoverImage cover={cover} size="thumb" lazy />}
      </button>
      <div className="row__body">
        <button type="button" className="row__open" onClick={props.onOpen} aria-label={`${entry.title}の詳細`}>
          <span className="row__title">{entry.title}</span>
        </button>
        <span className="row__date">
          {[workMeta({ seasonYear: entry.seasonYear, seasonName: entry.seasonName }), entry.stateAt ? `${formatDate(entry.stateAt)}に記録` : ''].filter(Boolean).join(' · ')}
        </span>
        {props.wanna && (
          <span className="row__wanna">
            <button type="button" className="row__star" aria-pressed={props.wanna.priority} onClick={props.onWannaPriority} title="優先して見る">
              {props.wanna.priority ? '★ 優先' : '☆ 優先'}
            </button>
            <button type="button" className="link row__memo" onClick={props.onWannaMemo}>
              {props.wanna.memo ? props.wanna.memo : 'メモ'}
            </button>
          </span>
        )}
        <div className="row__edit">
          <div className="mini-ratings" role="group" aria-label="評価">
            {RATINGS.map((r) => (
              <button
                key={r.rating}
                type="button"
                className={`mini-rating mini-rating--${r.rating.toLowerCase()}`}
                aria-pressed={rating === r.rating}
                onClick={() => props.onRate(rating === r.rating ? null : r.rating)}
                title={rating === r.rating ? 'もう一度押すと評価を消します' : undefined}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="row__actions">
            <select value={optionState(entry.state) ?? entry.state} onChange={(e) => props.onState(e.target.value as StatusState)} aria-label="状態">
              {STATE_OPTIONS.map((o) => (
                <option key={o.state} value={o.state}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="link"
              onClick={() => {
                if (confirm(`「${entry.title}」を記録から外しますか？ 評価は Annict に残ります。`)) props.onState('NO_STATE')
              }}
            >
              記録から外す
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}
