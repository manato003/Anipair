import { useMemo, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { SaveStatus } from '../../components/SaveStatus'
import type { RatingState, StatusState } from '../../lib/annict'
import { RATING_LABEL } from '../../lib/reviewOps'
import type { Cover } from '../../lib/storage'
import { workMeta } from '../browse/detail'
import { WorkDetail, type WorkSeed } from '../browse/WorkDetail'
import { malIdOf } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { BUCKETS, STATE_OPTIONS, countBuckets, filterRows, formatDate, optionState, sortRows, type Bucket, type RecordRow, type SortKey } from './recordList'
import { TrendsSheet } from './TrendsSheet'
import { useRecords } from './useRecords'
import { useTaste, useWannaScores } from './useTaste'
import { orderByScore } from './wannaRank'

export function Records({ token, active }: { token: string; active: boolean }) {
  const r = useRecords(token, active)
  const [bucket, setBucket] = useState<Bucket>('watched')
  const [sort, setSort] = useState<SortKey>('rating')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  // 見たいの並べ替え。おすすめ順は好みを調べてから並べる（重いので、選んだときだけ）
  const [wannaSort, setWannaSort] = useState<'recent' | 'taste'>('recent')
  const [trendsOpen, setTrendsOpen] = useState(false)
  // 詳細のシートを開いている記録。開いた時点の手がかりを持つので、一覧の読み直しやシートでの変更で消えても、シートは閉じない
  // （手がかりの参照が変わるとシートが読み直すので、毎回作り直さない）
  const [open, setOpen] = useState<{ seed: WorkSeed; cover: Cover | null } | null>(null)
  const openRow = ({ entry, cover }: RecordRow) =>
    setOpen({ seed: { id: entry.workId, annictId: entry.annictId, title: entry.title, malAnimeId: entry.malAnimeId, viewerStatusState: entry.state }, cover })

  const counts = useMemo(() => countBuckets(r.rows ?? []), [r.rows])
  const byTaste = bucket === 'wanna' && wannaSort === 'taste'
  const taste = useTaste(token, byTaste || trendsOpen, active)
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
    const rows = sortRows(filterRows(r.rows ?? [], bucket, query), bucket === 'watched' ? sort : 'recent')
    return scores ? orderByScore(rows, (row) => malIdOf(row.entry), scores) : rows
  }, [r.rows, bucket, query, sort, scores])
  // おすすめ順の読み込みの状況（読み込み中・失敗）
  const tasteError = byTaste ? (taste.state.status === 'error' ? taste.state.message : wanna.error) : null
  const tasteLoading = byTaste && !tasteError && !scores

  return (
    <section className="records">
      <header className="records__head">
        <h1 className="season">記録</h1>
        <div className="records__actions">
          <button type="button" className="btn" onClick={() => setTrendsOpen(true)} disabled={!r.rows}>
            傾向
          </button>
          <button type="button" className={editing ? 'btn btn--primary' : 'btn'} onClick={() => setEditing((e) => !e)} disabled={!r.rows}>
            {editing ? '完了' : '編集'}
          </button>
        </div>
      </header>

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
          {bucket === 'watched' && (
            <div className="toggle" role="group" aria-label="並べ替え">
              <button type="button" aria-pressed={sort === 'rating'} onClick={() => setSort('rating')}>
                評価順
              </button>
              <button type="button" aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}>
                新しい順
              </button>
            </div>
          )}
          {bucket === 'wanna' && (
            <div className="toggle" role="group" aria-label="並べ替え">
              <button type="button" aria-pressed={wannaSort === 'recent'} onClick={() => setWannaSort('recent')}>
                新しい順
              </button>
              <button type="button" aria-pressed={wannaSort === 'taste'} onClick={() => setWannaSort('taste')}>
                おすすめ順
              </button>
            </div>
          )}
        </div>
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
          <Empty title={query ? '当てはまる作品がありません' : 'まだありません'} body={query ? '別の言葉で絞り込んでください。' : '評価画面やマッチングで記録すると、ここに並びます。'} />
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
              />
            ))}
          </ul>
        )}
      </div>

      {trendsOpen && <TrendsSheet state={taste.state} onRetry={taste.retry} active={active} onClose={() => setTrendsOpen(false)} />}

      {open && (
        <WorkDetail
          key={open.seed.annictId}
          token={token}
          work={open.seed}
          cover={open.cover}
          active={active}
          enqueue={r.enqueue}
          onChange={(patch) => r.patchRecord(open.seed.annictId, patch)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
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
        {!props.editing && (
          <span className="row__date">
            {[workMeta({ seasonYear: entry.seasonYear, seasonName: entry.seasonName }), entry.stateAt ? `${formatDate(entry.stateAt)}に記録` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        {props.note && <span className="row__reason">{props.note}</span>}
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
    </li>
  )
}
