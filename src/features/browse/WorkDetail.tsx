import { useEffect, useRef, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { annictWorkUrl, fetchWorkDetail, updateStatus, type RatingState, type StatusState, type WorkDetail as Detail } from '../../lib/annict'
import { getMyReviews, rememberReview } from '../../lib/myReviews'
import { changeRating } from '../../lib/reviewOps'
import { fetchMedia, shikimoriUrl, type Media } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { useFontsReady } from '../../lib/useFontsReady'
import { messageOf } from '../../lib/useWriteQueue'
import { genreName, malIdOf } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { STATE_OPTIONS, optionState } from '../records/recordList'
import { STATUS_LABEL, mainStaff, withCopyrightMark, safeHttpUrl, workMeta, xUrl } from './detail'
import { RelatedWorks } from './RelatedWorks'

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
// シートが出てくる動きの長さ（base.css の sheet-in と同じ）。読み込みはこのあとに始める
const OPEN_ANIMATION_MS = 240
// 中身（詳細・ジャンル）がそろうのを待つ上限。過ぎたら、届いたものだけで出す
const CONTENT_WAIT_MS = 2500

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
  const [shiki, setShiki] = useState<Media | null>(null)
  const [shikiDone, setShikiDone] = useState(() => !malIdOf(work))
  const [waitedLong, setWaitedLong] = useState(false)
  // Annict は未記録を null ではなく NO_STATE で返す。画面では「記録なし」にそろえる
  const [state, setState] = useState<StatusState | null>(work.viewerStatusState && work.viewerStatusState !== 'NO_STATE' ? work.viewerStatusState : null)
  const [rating, setRating] = useState<RatingState | null>(null)
  const touched = useRef(false)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchWorkDetail(token, work.id)
        .then((d) => !cancelled && setDetail(d))
        .catch((e) => !cancelled && setError(messageOf(e)))
      const mal = malIdOf(work)
      if (mal) {
        fetchMedia([mal])
          .then((m) => !cancelled && setShiki(m.get(mal) ?? null))
          .catch(() => undefined)
          .finally(() => !cancelled && setShikiDone(true))
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
    }
    // 読み込みと、届いた中身の処理（作品ページの HTML の読み取りなど）は重い。シートが下から出てくる動きが終わってから始め、
    // 動きの途中でカクつかないようにする（2026-10-03 にスマホ相当の速さで実測）
    const timer = window.setTimeout(load, OPEN_ANIMATION_MS)
    const giveUp = window.setTimeout(() => setWaitedLong(true), OPEN_ANIMATION_MS + CONTENT_WAIT_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearTimeout(giveUp)
    }
  }, [token, work, readOnly])

  function changeState(next: StatusState) {
    if (props.readOnly) return
    const value = next === optionState(state) ? 'NO_STATE' : next
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
  const genres = [...(shiki?.genres ?? []), ...(shiki?.themes ?? [])].map(genreName)
  const mal = malIdOf(work)
  const staff = mainStaff(detail?.staffs ?? [])
  // 詳細を読み込むまでは、手元の項目だけで出す
  const watchers = detail?.watchersCount ?? work.watchersCount
  const meta = workMeta(detail ?? work, detail?.episodesCount)
  // 表紙と題名はすぐ出す（評価の画面で出ている字なので組み直しが起きない）。それ以外は、中身と書体がそろってからまとめて出す。
  // そろうまでは並べずに置いておき、そこに含まれる字の書体だけを先に読む（lib/useFontsReady.ts、styles/detail.css の .detail--ready）
  const settled = waitedLong || ((detail !== null || error !== null) && shikiDone)
  const rootRef = useRef<HTMLDivElement>(null)
  const ready = useFontsReady(settled, rootRef)

  return (
    <Sheet label={work.title} size="large" active={props.active} onClose={props.onClose}>
      <div ref={rootRef} className={ready ? 'detail detail--ready' : 'detail'} aria-busy={!ready}>
        <header className="detail__head">
          <div>
            <div className={props.cover?.landscape ? 'detail__cover detail__cover--landscape' : 'detail__cover'}>
              {props.cover && <CoverImage cover={props.cover} size="large" />}
            </div>
            {withCopyrightMark(detail?.copyright) && <p className="detail__copyright detail__late">{withCopyrightMark(detail?.copyright)}</p>}
          </div>
          <div className="detail__titles">
            <h2 className="detail__title">{work.title}</h2>
            <div className="detail__late">
              {detail?.titleKana && <p className="detail__kana">{detail.titleKana}</p>}
              {meta && <p className="detail__meta">{meta}</p>}
              {watchers !== undefined && <p className="detail__meta">Annict で{watchers.toLocaleString()}人が記録</p>}
            </div>
          </div>
        </header>

        <div className="detail__body">
          {!ready && <div className="detail__loading" aria-hidden />}
          <div className="detail__late">
            {!readOnly && (
              <>
                <section className="detail__section">
                  <h3 className="detail__label">状態</h3>
                  <div className="state-chips">
                    {STATE_OPTIONS.map((o) => (
                      <button key={o.state} type="button" className="chip" aria-selected={optionState(state) === o.state} onClick={() => changeState(o.state)}>
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

            {error && <p className="settings__error">{error}</p>}

            {genres.length > 0 && (
              <section className="detail__section">
                <p className="detail__genres">{genres.join('・')}</p>
              </section>
            )}

            {/* 関連作品: Annict のシリーズ。無ければ Shikimori の関連作品（詳細を読み込むまでは出さない） */}
            <RelatedWorks annictId={work.annictId} series={detail ? (detail.series ?? []) : error ? [] : null} shiki={shiki} />

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
              {mal && (
                <a href={shikimoriUrl(mal)} target="_blank" rel="noreferrer">
                  Shikimori で見る
                </a>
              )}
            </section>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
