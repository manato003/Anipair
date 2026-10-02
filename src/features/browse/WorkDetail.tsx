import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { fetchDescription } from '../../lib/anilist'
import { fetchWorkPage, type WorkPage } from '../../lib/annictPage'
import { annictWorkUrl, fetchWorkDetail, updateStatus, type RatingState, type StatusState, type WorkDetail as Detail } from '../../lib/annict'
import { getMyReviews, rememberReview } from '../../lib/myReviews'
import { changeRating } from '../../lib/reviewOps'
import type { Cover } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { GENRE_JA, malIdOf } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { STATE_OPTIONS } from '../records/recordList'
import { STATUS_LABEL, cleanDescription, mainStaff, safeHttpUrl, workMeta, xUrl } from './detail'

// シートを開く作品の手がかり。詳細を読み込むまでは、ここにある項目だけで出す（分からない項目は省く）
export interface WorkSeed {
  id: string
  annictId: number
  title: string
  malAnimeId: string | null
  media?: string
  seasonYear?: number | null
  seasonName?: string | null
  watchersCount?: number
  viewerStatusState?: StatusState | null
}

type Editable = {
  readOnly?: false
  enqueue: (label: string, task: () => Promise<void>) => void
  onChange: (patch: { state?: StatusState | null; rating?: RatingState | null }) => void
}
// 読むだけのシート。状態と評価は出さない（評価画面・マッチングでは、答えを下のボタンで付ける）
type ReadOnly = { readOnly: true; enqueue?: undefined; onChange?: undefined }

// 作品の詳細。下から出るシートで、閉じると元の画面に戻る。読むだけでなければ、状態と評価をここから直接変えられる。
// active が false（隠れたタブに開いたまま残っている）のあいだは Esc に反応しない
export function WorkDetail(
  props: {
    token: string
    work: WorkSeed
    cover: Cover | null
    active?: boolean
    onClose: () => void
  } & (Editable | ReadOnly),
) {
  const { token, work } = props
  const readOnly = props.readOnly === true
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 作品ページの内容（あらすじと配信サービス）。読み込み中は undefined、読めなかったときは null。
  // あらすじは Annict の日本語のもの。AniList はジャンルと、Annict にあらすじが無いときの代わりにだけ使う
  const [page, setPage] = useState<WorkPage | null | undefined>(undefined)
  const [about, setAbout] = useState<{ description: string; genres: string[] } | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Annict は未記録を null ではなく NO_STATE で返す。画面では「記録なし」にそろえる
  const [state, setState] = useState<StatusState | null>(work.viewerStatusState && work.viewerStatusState !== 'NO_STATE' ? work.viewerStatusState : null)
  const [rating, setRating] = useState<RatingState | null>(null)
  const touched = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetchWorkDetail(token, work.id)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(messageOf(e)))
    fetchWorkPage(work.annictId)
      .then((p) => !cancelled && setPage(p))
      .catch(() => !cancelled && setPage(null))
    const mal = malIdOf(work)
    if (mal) {
      fetchDescription(mal).then((a) => !cancelled && a && setAbout({ description: cleanDescription(a.description), genres: a.genres }))
    }
    // 読むだけのシートは、自分の評価を読まない（アクティビティを全部辿るので重い）
    if (!readOnly) {
      getMyReviews(token)
        .then((map) => {
          if (cancelled || touched.current) return
          setRating(map.get(work.annictId)?.ratingOverallState ?? null)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [token, work, readOnly])

  function changeState(next: StatusState) {
    if (props.readOnly) return
    const value = next === state ? 'NO_STATE' : next
    setState(value === 'NO_STATE' ? null : value)
    props.onChange({ state: value === 'NO_STATE' ? null : value })
    props.enqueue(`「${work.title}」の状態`, () => updateStatus(token, work.id, value))
  }

  function changeRatingTo(next: RatingState) {
    if (props.readOnly) return
    const value = next === rating ? null : next
    const becomesWatched = value !== null && state !== 'WATCHED'
    touched.current = true
    setRating(value)
    if (becomesWatched) setState('WATCHED')
    props.onChange({ rating: value, ...(becomesWatched ? { state: 'WATCHED' as const } : {}) })
    props.enqueue(`「${work.title}」の評価`, async () => {
      if (becomesWatched) await updateStatus(token, work.id, 'WATCHED')
      // 送信の時点での実際の感想を、共有の控えから読む（画面は先に変えている）。
      // 読み込み前に押されても、ここで読み込みを待つので、既存の評価を重複させない
      const current = (await getMyReviews(token)).get(work.annictId) ?? null
      await rememberReview(token, work.annictId, await changeRating(token, work.id, current, value))
    })
  }

  const official = safeHttpUrl(detail?.officialSiteUrl)
  const wikipedia = safeHttpUrl(detail?.wikipediaUrl)
  const x = xUrl(detail?.twitterUsername)
  const genres = (about?.genres ?? []).map((g) => GENRE_JA[g]).filter(Boolean)
  const staff = mainStaff(detail?.staffs ?? [])
  const synopsis = page?.synopsis
  const vods = page?.vods ?? []
  // 詳細を読み込むまでは、手元の項目だけで出す
  const watchers = detail?.watchersCount ?? work.watchersCount
  const meta = workMeta(detail ?? work, detail?.episodesCount)

  return (
    <Sheet label={work.title} size="large" active={props.active} onClose={props.onClose}>
      <header className="detail__head">
        <div className="detail__cover">{props.cover && <img src={props.cover.url} alt="" />}</div>
        <div className="detail__titles">
          <h2 className="detail__title">{work.title}</h2>
          {detail?.titleKana && <p className="detail__kana">{detail.titleKana}</p>}
          {meta && <p className="detail__meta">{meta}</p>}
          {watchers !== undefined && <p className="detail__meta">Annict で{watchers.toLocaleString()}人が記録</p>}
        </div>
      </header>

      {!readOnly && (
        <>
          <section className="detail__section">
            <h3 className="detail__label">状態</h3>
            <div className="state-chips">
              {STATE_OPTIONS.map((o) => (
                <button key={o.state} type="button" className="chip" aria-selected={state === o.state} onClick={() => changeState(o.state)}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="detail__hint">{state ? `選んでいる「${STATUS_LABEL[state]}」をもう一度押すと、記録から外します。` : 'まだ記録していません。'}</p>
          </section>

          <section className="detail__section">
            <h3 className="detail__label">評価</h3>
            <div className="mini-ratings">
              {RATINGS.map((r) => (
                <button
                  key={r.rating}
                  type="button"
                  className={`mini-rating mini-rating--${r.rating.toLowerCase()}`}
                  aria-pressed={rating === r.rating}
                  onClick={() => changeRatingTo(r.rating)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {vods.length > 0 && (
        <section className="detail__section">
          <h3 className="detail__label">配信</h3>
          <div className="vods">
            {vods.map((v) => (
              <a key={v.url} className="chip chip--link" href={v.url} target="_blank" rel="noreferrer">
                {v.name}
              </a>
            ))}
          </div>
        </section>
      )}

      {error && <p className="settings__error">{error}</p>}

      {(genres.length > 0 || synopsis || about?.description) && (
        <section className="detail__section">
          {genres.length > 0 && <p className="detail__genres">{genres.join('・')}</p>}
          {synopsis ? (
            <>
              <h3 className="detail__label">あらすじ</h3>
              <p className={expanded ? 'detail__text' : 'detail__text detail__text--clamped'}>{synopsis.text}</p>
              <div className="detail__row">
                <button type="button" className="link" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? '閉じる' : '続きを読む'}
                </button>
                {synopsis.source && (
                  <a className="detail__source" href={synopsis.source} target="_blank" rel="noreferrer">
                    引用元
                  </a>
                )}
              </div>
            </>
          ) : (
            page !== undefined &&
            about?.description && (
              <>
                <h3 className="detail__label">あらすじ（Annict に無いため AniList の英語版）</h3>
                <p className={expanded ? 'detail__text' : 'detail__text detail__text--clamped'}>{about.description}</p>
                <button type="button" className="link" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? '閉じる' : '続きを読む'}
                </button>
              </>
            )
          )}
        </section>
      )}

      {/* 広い画面では、キャストとスタッフを左右に並べる */}
      <div className="detail__credits">
        {detail && detail.casts.length > 0 && (
          <section className="detail__section">
            <h3 className="detail__label">キャスト</h3>
            <dl className="credits">
              {detail.casts.map((c) => (
                <div key={`${c.character}-${c.name}`} className="credits__row">
                  <dt>{c.character}</dt>
                  <dd>{c.name}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {staff.length > 0 && (
          <section className="detail__section">
            <h3 className="detail__label">スタッフ</h3>
            <dl className="credits">
              {staff.map((s) => (
                <div key={s.role} className="credits__row">
                  <dt>{s.role}</dt>
                  <dd>{s.names.join('、')}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      <section className="detail__section detail__links">
        <a href={annictWorkUrl(work.annictId)} target="_blank" rel="noreferrer">
          Annict
        </a>
        {official && (
          <a href={official} target="_blank" rel="noreferrer">
            公式サイト
          </a>
        )}
        {wikipedia && (
          <a href={wikipedia} target="_blank" rel="noreferrer">
            Wikipedia
          </a>
        )}
        {x && (
          <a href={x} target="_blank" rel="noreferrer">
            X
          </a>
        )}
      </section>
    </Sheet>
  )
}
