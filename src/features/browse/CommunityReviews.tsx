import { useEffect, useState } from 'react'
import { annictUserUrl, annictWorkReviewsUrl, fetchWorkReviews, type CommunityReview, type WorkReviews } from '../../lib/annict'
import { useNearScreen } from '../../lib/useNearScreen'
import { RATINGS } from '../rate/queue'

// 作品の詳細の「みんなの感想」。Annict の満足度と感想の件数（数字なのでネタバレにならず、見るか迷っている人の手がかりになる）と、
// いいねの多い本文つきの感想を3件。本文は、見た作品では開いて出し、まだ見ていない作品ではネタバレを避けて押したときだけ出す。
// ほかの人が書いた文章なので、書いた人の名前（Annict のページへ）と、Annict の感想の一覧へのリンクを添える。
// 詳細は何度も開くので、欄が画面に近づいてから読む

// 長い感想は、最初はこの文字数を超えたら畳む（全文は押して広げる）
const FOLD_CHARS = 140

type Loaded = { workId: string; value: WorkReviews | 'error' }

export function CommunityReviews(props: { token: string; workId: string; annictId: number; watched: boolean }) {
  const { token, workId } = props
  const [ref, near] = useNearScreen<HTMLDivElement>()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  // まだ見ていない作品で、本文を出すと決めたか
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!near) return
    let cancelled = false
    fetchWorkReviews(token, workId).then(
      (value) => !cancelled && setLoaded({ workId, value }),
      () => !cancelled && setLoaded({ workId, value: 'error' }),
    )
    return () => {
      cancelled = true
    }
  }, [near, token, workId])

  const current = loaded?.workId === workId ? loaded.value : null
  // 読み込むまでは、位置を測るための空の箱だけ。読めなかったときは欄ごと出さない（作品のほかの情報の邪魔をしない）
  if (current === null) return <div ref={ref} className="near-probe" aria-hidden />
  if (current === 'error') return null
  const { satisfactionRate, reviewsCount, reviews } = current
  const showBodies = props.watched || open

  return (
    <section className="detail__section community">
      <h3 className="detail__label">みんなの感想</h3>
      {reviewsCount === 0 && satisfactionRate === null ? (
        <p className="detail__hint">まだ Annict に感想がありません。</p>
      ) : (
        <p className="community__summary">
          {satisfactionRate !== null && (
            <span className="community__stat">
              満足度 <strong>{formatRate(satisfactionRate)}%</strong>
            </span>
          )}
          <span className="community__stat">
            感想 <strong>{reviewsCount.toLocaleString('ja-JP')}</strong>件
          </span>
        </p>
      )}
      {reviews.length > 0 &&
        (showBodies ? (
          <ol className="community__list">
            {reviews.map((r) => (
              <ReviewItem key={r.annictId} review={r} />
            ))}
          </ol>
        ) : (
          <p className="detail__more">
            <span className="detail__spoiler">ネタバレを含むことがあります</span>
            <button type="button" className="link" onClick={() => setOpen(true)} aria-expanded={false}>
              感想を読む
            </button>
          </p>
        ))}
      {reviewsCount > 0 && (
        <p className="detail__source">
          Annict の利用者の感想です（
          <a href={annictWorkReviewsUrl(props.annictId)} target="_blank" rel="noreferrer">
            Annict で感想をすべて読む
          </a>
          ）
        </p>
      )}
    </section>
  )
}

function ReviewItem({ review }: { review: CommunityReview }) {
  const [expanded, setExpanded] = useState(false)
  const long = review.body.length > FOLD_CHARS
  const rating = review.rating ? RATINGS.find((x) => x.rating === review.rating)?.label : null
  return (
    <li className="community__item">
      <p className="community__head">
        <a className="community__who" href={annictUserUrl(review.user.username)} target="_blank" rel="noreferrer">
          {review.user.name || review.user.username}
        </a>
        {rating && <span className={`community__rating community__rating--${review.rating!.toLowerCase()}`}>{rating}</span>}
        {review.likesCount > 0 && <span className="community__likes">いいね {review.likesCount}</span>}
      </p>
      <p className={long && !expanded ? 'community__body community__body--folded' : 'community__body'}>{review.body}</p>
      {long && (
        <button type="button" className="link community__more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'たたむ' : '全文を読む'}
        </button>
      )}
    </li>
  )
}

// 満足度は整数の % に丸める（96.55 → 97。要約の数字なので細かい桁は出さない）
function formatRate(rate: number): string {
  return String(Math.round(rate))
}
