import { useState } from 'react'
import type { Episode, RatingState, WorkEpisodes } from '../../lib/annict'
import { CommentIcon } from '../../components/Icons'
import { RATINGS } from '../rate/queue'
import { clearEpisodeDraft, loadEpisodeDraft, saveEpisodeDraft } from './episodeDrafts'
import { episodeLabel, episodeProgress, episodeWindow, startIndex } from './episodes'
import { Loading } from '../../components/Loading'

// 作品の詳細のシート（見た・見てるの作品）の、話ごとの記録欄。
// 高さを固定した3段（選んでいる話・4段階のボタン・直前の記録）で、評価を押すと同じ位置のまま次の話に切り替わる
// （続けて記録するときに、ボタンを探し直さなくてよいように）。◀ ▶ と、下に並べた話の一覧で、ほかの話も選べる
export function EpisodeRecorder(props: {
  data: WorkEpisodes | undefined
  error: string | null
  // 見てる作品か（最終話まで記録したら「見た」にするかを聞く）
  watching: boolean
  undoable: ReadonlySet<string>
  // この画面で付けた記録のうち、感想を付けた話
  commented: ReadonlySet<string>
  // comment: 評価の前に「感想を書く」で書いていたら、一緒に記録する
  onRecord: (episode: Episode, rating: RatingState, comment?: string) => void
  // 記録した話に、あとから感想を付ける（書きたい人だけ）
  onComment: (episode: Episode, rating: RatingState, text: string) => void
  onUndo: (episode: Episode) => void
  onFinish: (rating: RatingState | null) => void
  onRetry: () => void
}) {
  const { data } = props
  // 選んでいる話の位置（話の数と同じなら、最後まで記録し終えたところ）。読み終えたら次に見る話から
  const [index, setIndex] = useState<number | null>(null)
  // この欄で直前に記録した話（取り消せるのは、それがこの画面で付けたものの間だけ）
  const [last, setLast] = useState<{ episode: Episode; rating: RatingState } | null>(null)
  // 感想を書いている話（続けてほかの話を記録しても、書いている先は変わらない）と、その本文（下書きは端末に残す）。
  // rating が null なら、まだ記録していない話（評価を押すと感想と一緒に記録する）
  const [writing, setWriting] = useState<{ episode: Episode; rating: RatingState | null } | null>(null)
  const [text, setText] = useState('')
  const [savedFor, setSavedFor] = useState<string | null>(null)

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
  if (!data) return <Loading className="ep__note" label="話の一覧を読み込み中" />
  if (data.noEpisodes || data.episodes.length === 0) return <p className="ep__note">この作品には話の情報がありません。</p>

  const episodes = data.episodes
  const at = Math.min(index ?? startIndex(episodes), episodes.length)
  const current = episodes[at] ?? null
  const { tracked, total } = episodeProgress(episodes)
  const select = (i: number) => setIndex(Math.max(0, Math.min(i, episodes.length)))
  const rate = (rating: RatingState) => {
    if (!current) return
    // 評価の前に書いていた感想は、一緒に記録する
    const withComment = writing && writing.rating === null && writing.episode.id === current.id ? text.trim() : ''
    props.onRecord(current, rating, withComment || undefined)
    if (writing && writing.rating === null && writing.episode.id === current.id) {
      clearEpisodeDraft(current.id)
      setWriting(null)
    }
    setSavedFor(withComment ? current.id : null)
    setLast({ episode: current, rating })
    select(at + 1)
  }
  const openComment = (target: { episode: Episode; rating: RatingState | null }) => {
    setWriting(target)
    setText(loadEpisodeDraft(target.episode.id))
    setSavedFor(null)
  }
  const saveComment = () => {
    if (!writing || writing.rating === null || !text.trim()) return
    props.onComment(writing.episode, writing.rating, text.trim())
    clearEpisodeDraft(writing.episode.id)
    setSavedFor(writing.episode.id)
    setWriting(null)
  }
  const undo = () => {
    if (!last) return
    if (writing?.episode.id === last.episode.id) setWriting(null)
    props.onUndo(last.episode)
    // 記録すると話の中身（記録数）が新しいものに差し替わるので、ID で探す（2026-10-06 の点検: 取り消すと第1話に飛んでいた）
    select(episodes.findIndex((e) => e.id === last.episode.id))
    setLast(null)
  }
  const ratingLabel = (r: RatingState) => RATINGS.find((x) => x.rating === r)?.label ?? ''
  // 「感想を書く」の行き先: この画面で記録したばかりの話があればそれ（あとから付ける）、無ければいま選んでいる話（書いてから評価する）。
  // 評価の前から見える場所に置く（記録のあとにだけ出していると、見つけられない）
  const commentTarget = last && props.undoable.has(last.episode.id) ? last : !last && current ? { episode: current, rating: null } : null
  const showCommentButton = commentTarget !== null && writing?.episode.id !== commentTarget.episode.id

  return (
    <div className="ep">
      <div className="ep__progress" aria-label={`${tracked}/${total}話を記録`}>
        <span className="ep__bar" aria-hidden>
          <span className="ep__fill" style={{ transform: `scaleX(${total ? tracked / total : 0})` }} />
        </span>
        <span className="ep__count" aria-hidden>
          {tracked}
          <span className="count__of">/{total}話</span>
        </span>
      </div>

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

        {/* 3段目: 直前の記録と取り消し、右端に「感想を書く」。何も無いときも高さを取っておく（ボタンの位置を動かさない） */}
        <div className="ep__last">
          <p className="ep__msg" role="status">
            {last ? (
              <>
                {episodeLabel(last.episode)}を「{ratingLabel(last.rating)}」で記録{savedFor === last.episode.id || props.commented.has(last.episode.id) ? '・感想つき' : ''}
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
          {showCommentButton && commentTarget && (
            <button type="button" className="ep__commentbtn" onClick={() => openComment(commentTarget)}>
              <CommentIcon />
              {commentTarget.rating !== null && props.commented.has(commentTarget.episode.id) ? '感想を直す' : '感想を書く'}
            </button>
          )}
        </div>
      </div>

      {writing && (
        <div className="ep__comment">
          <label className="ep__comment-label" htmlFor={`ep-comment-${writing.episode.id}`}>
            {episodeLabel(writing.episode)}の感想
            {writing.rating === null && <span className="ep__comment-hint">書いたら、上の評価を押してください。感想と一緒に記録します</span>}
          </label>
          <textarea
            id={`ep-comment-${writing.episode.id}`}
            className="ep__comment-text"
            rows={3}
            value={text}
            placeholder="この話の感想（Annict の記録に付きます）"
            onChange={(e) => {
              setText(e.target.value)
              saveEpisodeDraft(writing.episode.id, e.target.value)
            }}
          />
          <div className="ep__comment-actions">
            <button type="button" className="link" onClick={() => setWriting(null)}>
              閉じる
            </button>
            {writing.rating !== null && (
              <button type="button" className="btn btn--primary" disabled={!text.trim()} onClick={saveComment}>
                保存
              </button>
            )}
          </div>
        </div>
      )}

      <EpisodeList episodes={episodes} selected={current} onSelect={(e) => select(episodes.indexOf(e))} />
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

// 一度に並べる話の数（長い作品は、次の話の少し前から。前後は押して広げる）
const WINDOW = 12

// 話の一覧（記録欄の下にそのまま並べる）。押すと、その話を記録欄で選ぶ（評価はいつも同じ位置の記録欄で付ける）
function EpisodeList(props: { episodes: readonly Episode[]; selected: Episode | null; onSelect: (episode: Episode) => void }) {
  const { episodes } = props
  const [range, setRange] = useState(() => episodeWindow(episodes, WINDOW, 3))
  return (
    <div className="eplist__wrap">
      {range.start > 0 && (
        <button type="button" className="link eplist__more" onClick={() => setRange((r) => ({ ...r, start: Math.max(0, r.start - WINDOW) }))}>
          前の話を見る
        </button>
      )}
      <ol className="eplist" aria-label="話の一覧">
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
        <button type="button" className="link eplist__more" onClick={() => setRange((r) => ({ ...r, end: Math.min(episodes.length, r.end + WINDOW) }))}>
          後の話を見る
        </button>
      )}
    </div>
  )
}
