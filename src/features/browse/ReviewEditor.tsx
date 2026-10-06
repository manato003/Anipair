import { useEffect, useState } from 'react'
import { Loading } from '../../components/Loading'
import { fetchReview, type RatingState } from '../../lib/annict'
import { getMyReviews, rememberReview } from '../../lib/myReviews'
import { clearDraft, loadDraft, saveDraft, type DraftAxes } from '../../lib/reviewDrafts'
import { AXIS_LABEL, saveReview } from '../../lib/reviewOps'
import { messageOf } from '../../lib/useWriteQueue'
import { RATINGS } from '../rate/queue'
import type { Enqueue } from './WorkDetail'

// 作品の詳細の「項目別の評価と感想」。普段は畳んでおき（総合の1タップ評価の手軽さを保つ）、開いたら Annict から最新の感想を読む。
// 映像・キャラクター・ストーリー・音楽の4段階と本文を「保存」で送る（総合は上のボタンのまま。lib/reviewOps.ts の saveReview）。
// 保存していない入力は端末に下書きとして残す（lib/reviewDrafts.ts）。感想は Annict で公開されるので、そのことを書く

const AXES = ['ratingAnimationState', 'ratingCharacterState', 'ratingStoryState', 'ratingMusicState'] as const

interface Form {
  axes: DraftAxes
  body: string
}

const EMPTY: Form = { axes: { ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }, body: '' }
const same = (a: Form, b: Form) => a.body === b.body && AXES.every((k) => a.axes[k] === b.axes[k])

type Loaded = { kind: 'closed' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; saved: Form; fromDraft: boolean }

export function ReviewEditor(props: { token: string; workId: string; annictId: number; title: string; overall: RatingState | null; enqueue: Enqueue }) {
  const { token, annictId } = props
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'closed' })
  const [form, setForm] = useState<Form>(EMPTY)
  const [note, setNote] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // 開いたら（と「もう一度」で）読む: 共有の控えに感想があれば、Annict から最新を読み直す（Annict のサイトで書き直した本文を出す）
  useEffect(() => {
    if (loaded.kind !== 'loading') return
    let cancelled = false
    ;(async () => {
      try {
        const cached = (await getMyReviews(token)).get(annictId) ?? null
        const latest = cached?.id ? await fetchReview(token, cached.id) : null
        if (cancelled) return
        const saved: Form = latest
          ? { axes: { ratingStoryState: latest.ratingStoryState, ratingAnimationState: latest.ratingAnimationState, ratingMusicState: latest.ratingMusicState, ratingCharacterState: latest.ratingCharacterState }, body: latest.body }
          : EMPTY
        const draft = loadDraft(annictId)
        const useDraft = draft !== null && !same(draft, saved)
        setForm(useDraft ? { axes: draft.axes, body: draft.body } : saved)
        setLoaded({ kind: 'ready', saved, fromDraft: useDraft })
      } catch (e) {
        if (!cancelled) setLoaded({ kind: 'error', message: messageOf(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loaded.kind, token, annictId, tick])

  function change(next: Form) {
    setForm(next)
    setNote(null)
    if (loaded.kind !== 'ready') return
    // 保存したものと同じに戻したら下書きは要らない
    if (same(next, loaded.saved)) clearDraft(annictId)
    else saveDraft(annictId, next)
  }

  function save() {
    if (loaded.kind !== 'ready') return
    const sent = form
    const overall = props.overall
    setLoaded({ ...loaded, saved: sent, fromDraft: false })
    setNote('保存しました')
    const content = { axes: { ...sent.axes, ratingOverallState: overall }, body: sent.body }
    props.enqueue(
      `「${props.title}」の感想`,
      async () => {
        // 送信の時点での共有の控えを渡す（saveReview が Annict から最新を読み直してから送る）
        const cached = (await getMyReviews(token)).get(annictId) ?? null
        const after = await saveReview(token, props.workId, cached, content)
        await rememberReview(token, annictId, after)
        clearDraft(annictId)
      },
      [{ kind: 'review', workId: props.workId, annictId, content }],
    )
  }

  function discardDraft() {
    if (loaded.kind !== 'ready') return
    clearDraft(annictId)
    setForm(loaded.saved)
    setLoaded({ ...loaded, fromDraft: false })
  }

  if (loaded.kind === 'closed') {
    return (
      <button type="button" className="review__open link" onClick={() => setLoaded({ kind: 'loading' })} aria-expanded={false}>
        項目別の評価と感想を書く
      </button>
    )
  }

  const dirty = loaded.kind === 'ready' && !same(form, loaded.saved)
  return (
    <div className="review">
      <button type="button" className="review__open link" onClick={() => setLoaded({ kind: 'closed' })} aria-expanded>
        項目別の評価と感想をたたむ
      </button>
      {loaded.kind === 'loading' && <Loading label="感想を読み込み中" />}
      {loaded.kind === 'error' && (
        <p className="settings__error">
          感想を読み込めませんでした（{loaded.message}）。
          <button
            type="button"
            className="link"
            onClick={() => {
              setLoaded({ kind: 'loading' })
              setTick((t) => t + 1)
            }}
          >
            もう一度
          </button>
        </p>
      )}
      {loaded.kind === 'ready' && (
        <>
          {loaded.fromDraft && (
            <p className="review__draft">
              保存していない下書きを表示しています。
              <button type="button" className="link" onClick={discardDraft}>
                下書きを捨てる
              </button>
            </p>
          )}
          {AXES.map((k) => (
            <div key={k} className="review__axis">
              <span className="review__axis-name">{AXIS_LABEL[k]}</span>
              <div className="mini-ratings" role="group" aria-label={AXIS_LABEL[k]}>
                {RATINGS.map((r) => (
                  <button
                    key={r.rating}
                    type="button"
                    className={`mini-rating mini-rating--${r.rating.toLowerCase()}`}
                    aria-pressed={form.axes[k] === r.rating}
                    onClick={() => change({ ...form, axes: { ...form.axes, [k]: form.axes[k] === r.rating ? null : r.rating } })}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="review__body">
            <span className="review__axis-name">感想</span>
            <textarea value={form.body} rows={5} placeholder="感じたことを自由に（書かなくても保存できます）" onChange={(e) => change({ ...form, body: e.target.value })} />
          </label>
          <p className="note">項目別の評価と感想は、総合評価と同じく Annict に保存され、Annict の作品ページなどで公開されます。選んでいる評価をもう一度押すと外せます。</p>
          <div className="review__foot">
            {note && !dirty && <span className="note">{note}</span>}
            <button type="button" className="btn btn--primary" onClick={save} disabled={!dirty}>
              保存
            </button>
          </div>
        </>
      )}
    </div>
  )
}
