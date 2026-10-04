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
import { fetchWikiSynopsis, type WikiSynopsis } from '../../lib/wikipedia'
import { genreName, malIdOf } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { STATE_OPTIONS, optionState } from '../records/recordList'
import { STATUS_LABEL, mainStaff, withCopyrightMark, safeHttpUrl, workMeta, xUrl } from './detail'
import { RelatedDetail, type RelatedTarget } from './RelatedDetail'
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

export type Enqueue = (label: string, task: () => Promise<void>) => void
export type RecordPatch = { state?: StatusState | null; rating?: RatingState | null }
// 関連作品のシートで状態や評価を変えたことを、元の画面に知らせる（一覧の表示を合わせる・山から外すため）
export type RelatedChange = (work: { annictId: number; malAnimeId: string | null }, patch: RecordPatch) => void

type Editable = {
  readOnly?: false
  enqueue: Enqueue
  onChange: (patch: RecordPatch) => void
}
// 読むだけのシート。状態と評価は出さない（評価画面・マッチングでは、この作品への答えは下のボタンで付ける。答え方を2つにしない）
type ReadOnly = { readOnly: true; enqueue?: undefined; onChange?: undefined }

// 関連作品のシートは、元のシートが読むだけでも状態と評価を付けられる（別の作品なので、下の答えのボタンと重ならない）。
// 送信は元の画面の列に並べる（失敗は元の画面の帯に出る。シートを閉じたあとでも気づける）。
// relatedEnqueue が無ければ、読むだけのシートなら関連作品も読むだけ、そうでなければ自分の enqueue を使う
type RelatedOptions = { relatedEnqueue?: Enqueue; onRelatedChange?: RelatedChange }

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
  } & RelatedOptions &
    (Editable | ReadOnly),
) {
  const { token, work } = props
  const readOnly = props.readOnly === true
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shiki, setShiki] = useState<Media | null>(null)
  // あらすじ（Wikipedia の「あらすじ」の節の冒頭の段落）。読み込み中は undefined、無い・読めないときは null
  const [wiki, setWiki] = useState<WikiSynopsis | null | undefined>(undefined)
  // あらすじの全文を広げているか（ネタバレを含むことがあるので、押したときだけ）
  const [wikiOpen, setWikiOpen] = useState(false)
  // 関連作品から重ねて開いている作品。開いているあいだ、このシートは Esc と「戻る」に反応しない（上のシートだけが閉じる）
  const [related, setRelated] = useState<RelatedTarget | null>(null)
  // 関連作品のシートで変えた状態（関連作品の一覧の印にすぐ映す）
  const [relatedStates, setRelatedStates] = useState<ReadonlyMap<number, StatusState | null>>(new Map())
  const relatedEnqueue = props.relatedEnqueue ?? (props.readOnly ? undefined : props.enqueue)
  const onRelatedChange: RelatedChange = (w, patch) => {
    if (patch.state !== undefined) setRelatedStates((cur) => new Map(cur).set(w.annictId, patch.state ?? null))
    props.onRelatedChange?.(w, patch)
  }
  const active = (props.active ?? true) && related === null
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

  // 詳細（Annict）が届いたら、その Wikipedia の記事からあらすじを読む（記事ごとに1回。lib/wikipedia.ts）
  useEffect(() => {
    if (!detail) return
    let cancelled = false
    fetchWikiSynopsis(detail.wikipediaUrl).then(
      (w) => !cancelled && setWiki(w),
      () => !cancelled && setWiki(null),
    )
    return () => {
      cancelled = true
    }
  }, [detail])

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
  const settled = waitedLong || (error !== null && shikiDone) || (detail !== null && wiki !== undefined && shikiDone)
  const rootRef = useRef<HTMLDivElement>(null)
  const ready = useFontsReady(settled, rootRef)

  return (
    <>
    <Sheet label={work.title} size="large" active={active} onClose={props.onClose}>
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

            {/* あらすじ: Wikipedia の冒頭の段落（ネタバレを避ける）。続きは押したときだけ、その場で広げる。出典とライセンス（CC BY-SA 4.0）を添える */}
            {wiki && (
              <section className="detail__section">
                <h3 className="detail__label">あらすじ</h3>
                {wikiOpen ? (
                  <div className="detail__wiki">
                    {wiki.blocks.map((b, i) =>
                      b.heading ? (
                        <h4 key={i} className="detail__wiki-heading">
                          {b.text}
                        </h4>
                      ) : (
                        <p key={i} className="detail__text">
                          {b.text}
                        </p>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="detail__text">{wiki.text}</p>
                )}
                {(wiki.blocks.length > 1 || wiki.text.endsWith('…')) && (
                  // 右端に置く（親指の届く側）。注意書きはボタンのすぐ左
                  <p className="detail__more">
                    {!wikiOpen && <span className="detail__spoiler">ネタバレを含むことがあります</span>}
                    <button type="button" className="link" onClick={() => setWikiOpen((v) => !v)} aria-expanded={wikiOpen}>
                      {wikiOpen ? '続きを閉じる' : '続きを読む'}
                    </button>
                  </p>
                )}
                <p className="detail__source">
                  出典: Wikipedia「
                  <a href={wiki.url} target="_blank" rel="noreferrer">
                    {wiki.title}
                  </a>
                  」（
                  <a href={wiki.licenseUrl} target="_blank" rel="noreferrer">
                    CC BY-SA 4.0
                  </a>
                  ）
                </p>
              </section>
            )}

            {/* 関連作品: Annict のシリーズ。無ければ Shikimori の関連作品（詳細を読み込むまでは出さない） */}
            <RelatedWorks
              annictId={work.annictId}
              series={detail ? (detail.series ?? []) : error ? [] : null}
              shiki={shiki}
              states={relatedStates}
              onOpen={setRelated}
            />

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
    {related &&
      (relatedEnqueue ? (
        <RelatedDetail token={token} target={related} active={props.active ?? true} enqueue={relatedEnqueue} onChange={onRelatedChange} onClose={() => setRelated(null)} />
      ) : (
        <RelatedDetail readOnly token={token} target={related} active={props.active ?? true} onClose={() => setRelated(null)} />
      ))}
    </>
  )
}
