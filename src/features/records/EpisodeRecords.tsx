import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import type { Episode, RatingState, WorkEpisodes } from '../../lib/annict'
import { RATINGS } from '../rate/queue'
import { episodeLabel, episodeProgress, episodeWindow, startIndex } from './episodes'

// 記録ページで開いた作品（見た・見てる）の、話ごとの記録欄。
// 高さを固定した3段（選んでいる話・4段階のボタン・直前の記録）で、評価を押すと同じ位置のまま次の話に切り替わる
// （続けて記録するときに、ボタンを探し直さなくてよいように）。◀ ▶ と、進み具合から開く話の一覧で、ほかの話も選べる
export function EpisodeRecorder(props: {
  data: WorkEpisodes | undefined
  error: string | null
  // 見てる作品か（最終話まで記録したら「見た」にするかを聞く）
  watching: boolean
  undoable: ReadonlySet<string>
  onRecord: (episode: Episode, rating: RatingState) => void
  onUndo: (episode: Episode) => void
  onFinish: (rating: RatingState | null) => void
  onRetry: () => void
  active: boolean
}) {
  const { data } = props
  // 選んでいる話の位置（話の数と同じなら、最後まで記録し終えたところ）。読み終えたら次に見る話から
  const [index, setIndex] = useState<number | null>(null)
  // この欄で直前に記録した話（取り消せるのは、それがこの画面で付けたものの間だけ）
  const [last, setLast] = useState<{ episode: Episode; rating: RatingState } | null>(null)
  const [listOpen, setListOpen] = useState(false)

  if (props.error) {
    return (
      <p className="ep__note">
        話の一覧を読めませんでした（{props.error}）。
        <button type="button" className="link" onClick={props.onRetry}>
          もう一度
        </button>
      </p>
    )
  }
  if (!data) return <p className="ep__note">話を読んでいます</p>
  if (data.noEpisodes || data.episodes.length === 0) return <p className="ep__note">この作品には話の情報がありません。</p>

  const episodes = data.episodes
  const at = Math.min(index ?? startIndex(episodes), episodes.length)
  const current = episodes[at] ?? null
  const { tracked, total } = episodeProgress(episodes)
  const select = (i: number) => setIndex(Math.max(0, Math.min(i, episodes.length)))
  const rate = (rating: RatingState) => {
    if (!current) return
    props.onRecord(current, rating)
    setLast({ episode: current, rating })
    select(at + 1)
  }
  const undo = () => {
    if (!last) return
    props.onUndo(last.episode)
    select(episodes.indexOf(last.episode))
    setLast(null)
  }
  const ratingLabel = (r: RatingState) => RATINGS.find((x) => x.rating === r)?.label ?? ''

  return (
    <div className="ep">
      <button type="button" className="ep__progress" onClick={() => setListOpen(true)} aria-label={`${tracked}/${total}話を記録。話の一覧を開く`}>
        <span className="ep__bar" aria-hidden>
          <span className="ep__fill" style={{ transform: `scaleX(${total ? tracked / total : 0})` }} />
        </span>
        <span className="ep__count">
          {tracked}
          <span className="count__of">/{total}話</span>
        </span>
      </button>

      <div className="ep__box">
        {/* 1段目: 選んでいる話。◀ ▶ で前後の話に */}
        <div className="ep__head">
          <button type="button" className="ep__step" onClick={() => select(at - 1)} disabled={at === 0} aria-label="前の話">
            ‹
          </button>
          <p className="ep__current" aria-live="polite">
            {current ? (
              <>
                <strong>{episodeLabel(current)}</strong>
                {current.title && <span className="ep__title">{current.title}</span>}
                {current.viewerDidTrack && <span className="ep__tracked">記録済み</span>}
              </>
            ) : (
              <strong>最終話まで記録しました</strong>
            )}
          </p>
          <button type="button" className="ep__step" onClick={() => select(at + 1)} disabled={at >= episodes.length} aria-label="次の話">
            ›
          </button>
        </div>

        {/* 2段目: 4段階のボタン（いつも同じ位置）。最後まで記録したら、見てる作品は作品の評価を付けて「見た」にできる */}
        {current ? (
          <Ratings label={`${episodeLabel(current)}の評価`} onRate={rate} />
        ) : props.watching ? (
          <Ratings label="作品の評価" onRate={(r) => props.onFinish(r)} />
        ) : (
          <div className="ep__placeholder" aria-hidden />
        )}

        {/* 3段目: 直前の記録と取り消し。何も無いときも高さを取っておく（ボタンの位置を動かさない） */}
        <p className="ep__last" role="status">
          {last ? (
            <>
              {episodeLabel(last.episode)}を「{ratingLabel(last.rating)}」で記録しました
              {props.undoable.has(last.episode.id) && (
                <button type="button" className="link" onClick={undo}>
                  取り消す
                </button>
              )}
            </>
          ) : !current && props.watching ? (
            <>
              作品の評価を付けて「見た」にします。
              <button type="button" className="link" onClick={() => props.onFinish(null)}>
                評価せずに「見た」にする
              </button>
            </>
          ) : null}
        </p>
      </div>

      {listOpen && (
        <EpisodeSheet
          data={data}
          selected={current}
          active={props.active}
          onSelect={(e) => {
            select(episodes.indexOf(e))
            setListOpen(false)
          }}
          onClose={() => setListOpen(false)}
        />
      )}
    </div>
  )
}

// 4段階の評価のボタン。押すとすぐ記録する（評価が記録の一部）
function Ratings(props: { label: string; onRate: (rating: RatingState) => void }) {
  return (
    <div className="mini-ratings" role="group" aria-label={props.label}>
      {RATINGS.map((r) => (
        <button key={r.rating} type="button" className={`mini-rating mini-rating--${r.rating.toLowerCase()}`} onClick={() => props.onRate(r.rating)}>
          {r.label}
        </button>
      ))}
    </div>
  )
}

// 一度に並べる話の数（長い作品は、次の話のあたりから。前後は押して広げる）
const WINDOW = 40

// 話の一覧。押すと、その話を記録欄で選ぶ（評価はいつも同じ位置の記録欄で付ける）
export function EpisodeSheet(props: { data: WorkEpisodes; selected: Episode | null; active: boolean; onSelect: (episode: Episode) => void; onClose: () => void }) {
  const { episodes } = props.data
  const [range, setRange] = useState(() => episodeWindow(episodes, WINDOW))
  const { tracked, total } = episodeProgress(episodes)
  return (
    <Sheet label="話の一覧" size="large" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">話の一覧</h2>
      <p className="detail__meta">
        {tracked}/{total}話を記録しています。話を押すと、記録欄でその話を選びます。
      </p>
      {range.start > 0 && (
        <button type="button" className="btn ep__more" onClick={() => setRange((r) => ({ ...r, start: Math.max(0, r.start - WINDOW) }))}>
          前の話を見る
        </button>
      )}
      <ol className="eplist">
        {episodes.slice(range.start, range.end).map((e) => (
          <li key={e.id}>
            <button type="button" className="eplist__item" aria-current={e === props.selected ? 'true' : undefined} onClick={() => props.onSelect(e)}>
              <span className="eplist__label">{episodeLabel(e)}</span>
              <span className="eplist__title">{e.title ?? ''}</span>
              <span className="eplist__done">{e.viewerDidTrack ? `✓${e.viewerRecordsCount > 1 ? ` ${e.viewerRecordsCount}回` : ''}` : ''}</span>
            </button>
          </li>
        ))}
      </ol>
      {range.end < episodes.length && (
        <button type="button" className="btn ep__more" onClick={() => setRange((r) => ({ ...r, end: Math.min(episodes.length, r.end + WINDOW) }))}>
          後の話を見る
        </button>
      )}
    </Sheet>
  )
}
