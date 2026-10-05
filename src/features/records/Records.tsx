import { useMemo, useState, type ReactNode } from 'react'
import { FilterIcon, ListIcon, TrophyIcon } from '../../components/Icons'
import { Achievements } from '../achievements/Achievements'
import { loadTitlesState } from '../achievements/achievementStore'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { HelpButton } from '../../components/Help'
import { SaveStatus } from '../../components/SaveStatus'
import type { RatingState, StatusState } from '../../lib/annict'
import { RATING_LABEL } from '../../lib/reviewOps'
import type { Cover } from '../../lib/storage'
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
  type RecordFilter,
  type RecordRow,
  type SortChoice,
  type SortKey,
} from './recordList'
import { EpisodeRecorder } from './EpisodeRecords'
import { RecordFilterSheet } from './RecordFilterSheet'
import { useEpisodes } from './useEpisodes'
import { useMediaInfo } from './useMediaInfo'
import { TrendsSheet } from './TrendsSheet'
import { useRecords } from './useRecords'
import { useTaste, useWannaScores } from './useTaste'
import { orderByScore } from './wannaRank'

export function Records({ token, active }: { token: string; active: boolean }) {
  const r = useRecords(token, active)
  // 記録の一覧か、実績（称号）か
  const [view, setView] = useState<'records' | 'achievements'>('records')
  // まだ一度も実績を開いていない（覚醒を見ていない）あいだは、切り替えの「実績」に光る点を付けて気づかせる
  const [achievementsUnseen, setAchievementsUnseen] = useState(() => !loadTitlesState().awakened)
  const showView = (next: 'records' | 'achievements') => {
    setView(next)
    if (next === 'achievements') setAchievementsUnseen(false)
  }
  const [bucket, setBucket] = useState<Bucket>('watched')
  // 並べ替えは状態ごとに持つ（見たは評価順、ほかは記録順から）。押している並べ替えをもう一度押すと、昇順と降順が入れ替わる。
  // 見たいのおすすめ順は好みを調べてから並べる（重いので、選んだときだけ）
  const [sortBy, setSortBy] = useState<Record<Bucket, SortChoice>>({
    watched: { key: 'rating', dir: 'desc' },
    wanna: { key: 'recorded', dir: 'desc' },
    watching: { key: 'recorded', dir: 'desc' },
    other: { key: 'recorded', dir: 'desc' },
  })
  const sort = sortBy[bucket]
  const chooseSort = (key: SortKey) =>
    setSortBy((cur) => ({ ...cur, [bucket]: cur[bucket].key === key ? { key, dir: cur[bucket].dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' } }))
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  // 絞り込み（どの状態にも効く）。ジャンル・制作会社は、シートを開いたときかその条件をかけているときだけ Shikimori から読む
  const [filter, setFilter] = useState<RecordFilter>(EMPTY_FILTER)
  const [filterOpen, setFilterOpen] = useState(false)
  const entries = useMemo(() => (r.rows ? r.rows.map((row) => row.entry) : null), [r.rows])
  const media = useMediaInfo(entries, filterOpen || filter.genres.length > 0 || filter.studios.length > 0)
  // 「見てる」の作品の話の一覧（見てるの一覧を開いたときだけ読む）。話ごとの記録は、記録ページの書き込みの列で送る
  // 「話ごとに記録」を開いている作品（Annict の作品の ID）。普段は行を縮めて一覧を見やすく、開いた作品の話の一覧だけを読む
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const toggleExpanded = (annictId: number) =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(annictId)) next.delete(annictId)
      else next.add(annictId)
      return next
    })
  const expandedIds = useMemo(() => (r.rows ?? []).filter((row) => expanded.has(row.entry.annictId)).map((row) => row.entry.workId), [r.rows, expanded])
  const eps = useEpisodes(token, expandedIds, r.enqueue)
  const [trendsOpen, setTrendsOpen] = useState(false)
  // 詳細のシートを開いている記録。開いた時点の手がかりを持つので、一覧の読み直しやシートでの変更で消えても、シートは閉じない
  // （手がかりの参照が変わるとシートが読み直すので、毎回作り直さない）
  const [open, setOpen] = useState<{ seed: WorkSeed; cover: Cover | null } | null>(null)
  const openRow = ({ entry, cover }: RecordRow) =>
    setOpen({ seed: { id: entry.workId, annictId: entry.annictId, title: entry.title, malAnimeId: entry.malAnimeId, viewerStatusState: entry.state }, cover })

  // 絞り込んだあとの記録（状態ごとの件数も、これで数える）
  const filtered = useMemo(() => applyFilter(r.rows ?? [], filter, media.info), [r.rows, filter, media.info])
  const counts = useMemo(() => countBuckets(filtered), [filtered])
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
    const rows = sortRows(filterRows(filtered, bucket, query), sort.key, sort.dir)
    if (!scores) return rows
    // おすすめ順: 点数のある作品を点数の順に（昇順なら逆に）、点数の無い作品は最後
    const ranked = orderByScore(rows, (row) => malIdOf(row.entry), scores)
    if (sort.dir === 'desc') return ranked
    const scored = ranked.filter((row) => scores.has(malIdOf(row.entry) ?? -1))
    return [...scored.reverse(), ...ranked.filter((row) => !scores.has(malIdOf(row.entry) ?? -1))]
  }, [filtered, bucket, query, sort, scores])
  const filterCount = activeFilterCount(filter)
  // おすすめ順の読み込みの状況（読み込み中・失敗）
  const tasteError = byTaste ? (taste.state.status === 'error' ? taste.state.message : wanna.error) : null
  const tasteLoading = byTaste && !tasteError && !scores

  return (
    <section className={view === 'achievements' ? 'records records--achievements' : 'records'}>
      <header className="records__head">
        <h1 className="visually-hidden">{view === 'records' ? '記録' : '実績'}</h1>
        {/* 記録の一覧と実績（称号）の切り替え。ひと続きの枠で、選んでいる方を塗って、押せば切り替わると分かるようにする */}
        <div className="viewswitch" role="tablist" aria-label="記録と実績">
          <button type="button" role="tab" className="viewswitch__tab" aria-selected={view === 'records'} onClick={() => showView('records')}>
            <ListIcon />
            記録
          </button>
          <button type="button" role="tab" className="viewswitch__tab viewswitch__tab--trophy" aria-selected={view === 'achievements'} onClick={() => showView('achievements')}>
            <TrophyIcon />
            実績
            {achievementsUnseen && <span className="viewswitch__dot" aria-label="まだ見ていません" />}
          </button>
        </div>
        <div className="records__actions">
          {view === 'records' && (
            <div className="records__buttons">
              <button type="button" className="btn" onClick={() => setTrendsOpen(true)} disabled={!r.rows}>
                傾向
              </button>
              <button type="button" className={editing ? 'btn btn--primary' : 'btn'} onClick={() => setEditing((e) => !e)} disabled={!r.rows}>
                {editing ? '完了' : '編集'}
              </button>
            </div>
          )}
          <HelpButton topic="records" active={active} />
        </div>
      </header>

      {view === 'achievements' ? (
        <Achievements token={token} rows={r.rows} loadError={r.loadError} onReload={r.reload} active={active} />
      ) : (
        <>
          <div className="records__controls">
            <div className="chips" role="tablist" aria-label="状態">
              {BUCKETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={bucket === b.id}
                  className="chip"
                  onClick={() => setBucket(b.id)}
                >
                  {b.label}
                  <span className="chip__count">{counts[b.id]}</span>
                </button>
              ))}
            </div>
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
            {/* 並べ替え。押している方をもう一度押すと、昇順と降順が入れ替わる（矢印で向きを示す） */}
            <div className="toggle toggle--full records__sort" role="group" aria-label="並べ替え">
              {sortOptions(bucket).map((o) => {
                const on = sort.key === o.key
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => chooseSort(o.key)}
                    title={on ? 'もう一度押すと、並びの向きが逆になります' : undefined}
                  >
                    {o.label}
                    {on && (
                      <span className="sortdir" aria-label={sort.dir === 'desc' ? '降順' : '昇順'}>
                        {sort.dir === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="note records__sortnote">{sortNote(sort)}</p>
            {filterCount > 0 && <ActiveFilters filter={filter} onChange={setFilter} />}
            {tasteLoading && <p className="note">好みを調べています</p>}
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
            <SaveStatus pending={r.pending} failed={r.failed} onRetry={r.retryFailed} onDismiss={r.dismissFailed} />
          </div>

          <div className="records__list">
            {r.loadError ? (
              <Empty title="記録を読み込めませんでした" body={r.loadError}>
                <button type="button" className="btn" onClick={r.reload}>
                  もう一度読み込む
                </button>
              </Empty>
            ) : !r.rows ? (
              <p className="records__loading">Annict の記録を読んでいます</p>
            ) : visible.length === 0 ? (
              query || filterCount > 0 ? (
                <Empty title="当てはまる作品がありません" body={filterCount > 0 ? '絞り込みの条件をゆるめてください。' : '別の言葉で絞り込んでください。'}>
                  {filterCount > 0 && (
                    <button type="button" className="btn" onClick={() => setFilter(EMPTY_FILTER)}>
                      絞り込みを解除する
                    </button>
                  )}
                </Empty>
              ) : (
                <Empty title="まだありません" body="評価画面やマッチングで記録すると、ここに並びます。" />
              )
            ) : (
              <ul className={editing ? 'rows rows--edit' : 'rows'}>
                {visible.map((row) => (
                  <RecordItem
                    key={row.entry.annictId}
                    row={row}
                    note={scores?.get(malIdOf(row.entry) ?? -1)?.reason ?? null}
                    editing={editing}
                    onOpen={() => openRow(row)}
                    onRate={(rating) => r.setRating(row, rating)}
                    onState={(state) => r.setState(row, state)}
                    episodeToggle={
                      (row.entry.state === 'WATCHING' || row.entry.state === 'WATCHED') && !editing ? (
                        <EpisodeToggle open={expanded.has(row.entry.annictId)} onToggle={() => toggleExpanded(row.entry.annictId)} />
                      ) : null
                    }
                    episodes={
                      (row.entry.state === 'WATCHING' || row.entry.state === 'WATCHED') && !editing && expanded.has(row.entry.annictId) ? (
                          <EpisodeRecorder
                            data={eps.byWork.get(row.entry.workId)}
                            error={eps.errors.get(row.entry.workId) ?? null}
                            watching={row.entry.state === 'WATCHING'}
                            undoable={eps.undoable}
                            onRecord={(ep, rating) => eps.record(row.entry.title, row.entry.workId, ep, rating)}
                            onUndo={(ep) => eps.undo(row.entry.title, row.entry.workId, ep)}
                            onFinish={(rating) => (rating ? r.setRating(row, rating) : r.setState(row, 'WATCHED'))}
                            onRetry={eps.retry}
                            active={active}
                          />
                      ) : null
                    }
                    expanded={expanded.has(row.entry.annictId)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

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

      {trendsOpen && r.rows && <TrendsSheet token={token} rows={r.rows} active={active} onClose={() => setTrendsOpen(false)} />}

      {open && (
        <WorkDetail
          key={open.seed.annictId}
          token={token}
          work={open.seed}
          cover={open.cover}
          active={active}
          enqueue={r.enqueue}
          onChange={(patch) => r.patchRecord(open.seed.annictId, patch)}
          onRelatedChange={(work, patch) => r.noteRelatedChange(work.annictId, patch)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}

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
      <button type="button" className="link" onClick={() => onChange(EMPTY_FILTER)}>
        すべて解除
      </button>
    </div>
  )
}

// 「話ごとに記録」の開閉。普段は縮めておき（一覧を見やすく）、開いたときだけ行の下に記録欄を出す
function EpisodeToggle(props: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="eptoggle__button" aria-expanded={props.open} onClick={props.onToggle}>
      話ごとに記録
      <span className="eptoggle__chevron" aria-hidden>
        ▾
      </span>
    </button>
  )
}

function RecordItem(props: {
  row: RecordRow
  // 一覧に添える一言（おすすめ順の理由）
  note: string | null
  editing: boolean
  onOpen: () => void
  onRate: (rating: RatingState | null) => void
  onState: (state: StatusState) => void
  // 見た・見てるの作品の「話ごとに記録」の開閉ボタンと、開いたときの記録欄（行の下に横幅いっぱいで出す）
  episodeToggle?: ReactNode
  episodes?: ReactNode
  // 話ごとの記録を開いているか（PC のタイルでは、その行を横いっぱいに広げる）
  expanded?: boolean
}) {
  const { entry, review, cover } = props.row
  const rating = review?.ratingOverallState ?? null
  return (
    <li className={props.expanded ? 'row row--expanded' : 'row'}>
      <button type="button" className="row__thumb" onClick={props.onOpen} tabIndex={-1} aria-hidden>
        {cover && <CoverImage cover={cover} size="thumb" lazy />}
      </button>
      <div className="row__body">
        <button type="button" className="row__open" onClick={props.onOpen} aria-label={`${entry.title}の詳細`}>
          <span className="row__title">{entry.title}</span>
        </button>
        {!props.editing && (
          <span className="row__date">
            {[workMeta({ seasonYear: entry.seasonYear, seasonName: entry.seasonName }), entry.stateAt ? `${formatDate(entry.stateAt)}に記録` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        {props.note && <span className="row__reason">{props.note}</span>}
        {props.episodeToggle}
        {props.editing && (
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
        )}
      </div>
      {!props.editing && rating && <span className={`badge badge--${rating.toLowerCase()}`}>{RATING_LABEL[rating]}</span>}
      {props.episodes && <div className="row__episodes">{props.episodes}</div>}
    </li>
  )
}
