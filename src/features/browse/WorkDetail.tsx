import { useEffect, useRef, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { annictWorkUrl, fetchWorkDetail, updateStatus, type Credit, type RatingState, type StatusState, type WorkDetail as Detail } from '../../lib/annict'
import { getMyReviews, rememberReview } from '../../lib/myReviews'
import { changeRating } from '../../lib/reviewOps'
import { fetchMedia, shikimoriUrl, type Media } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { vodSearchLinks } from '../../lib/vodSearch'
import { useFontsReady } from '../../lib/useFontsReady'
import { messageOf } from '../../lib/useWriteQueue'
import { fetchWikiSynopsis, type WikiSynopsis } from '../../lib/wikipedia'
import type { WriteIntent } from '../../lib/writeJournal'
import { genreName, malIdOf } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { STATE_OPTIONS, optionState } from '../records/recordList'
import { EpisodeRecorder } from '../records/EpisodeRecords'
import { useEpisodes, type EpisodesController } from '../records/useEpisodes'
import { CreditWorks, type CreditTarget } from './CreditWorks'
import { STATUS_LABEL, mainStaff, studioFor, withCopyrightMark, safeHttpUrl, workMeta, xUrl } from './detail'
import { RelatedDetail, type RelatedTarget } from './RelatedDetail'
import { RelatedWorks } from './RelatedWorks'
import { Loading } from '../../components/Loading'
import { ReviewEditor } from './ReviewEditor'

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

// intents: 最終的にどうしたいか（送り終えるまで端末にも控える。lib/writeJournal.ts）
export type Enqueue = (label: string, task: () => Promise<void>, intents?: readonly WriteIntent[]) => void
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
// 話の一覧を読まないとき（読むだけのシート・見た／見てる以外）と、書き込まないシートの列の代わり
const NO_WORKS: readonly string[] = []
const noEnqueue: Enqueue = () => undefined
// 中身（詳細・ジャンル）がそろうのを待つ上限。過ぎたら、届いたものだけで出す
const CONTENT_WAIT_MS = 2500

export function WorkDetail(
  props: {
    token: string
    work: WorkSeed
    cover: Cover | null
    active?: boolean
    // 話ごとの記録（記録ページは自分の控えを渡す。一覧の「次は 第5話」と合わせるため。無ければシートで読む）
    episodes?: EpisodesController
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
  // キャスト・スタッフ・制作会社から重ねて開いている参加作品の一覧
  const [credit, setCredit] = useState<CreditTarget | null>(null)
  const active = (props.active ?? true) && related === null && credit === null
  const [shikiDone, setShikiDone] = useState(() => !malIdOf(work))
  const [waitedLong, setWaitedLong] = useState(false)
  // Annict は未記録を null ではなく NO_STATE で返す。画面では「記録なし」にそろえる
  const [state, setState] = useState<StatusState | null>(work.viewerStatusState && work.viewerStatusState !== 'NO_STATE' ? work.viewerStatusState : null)
  const [rating, setRating] = useState<RatingState | null>(null)
  const touched = useRef(false)
  // 状態をこのシートで変えたか（変えたら、あとから届いた詳細の状態で上書きしない）
  const stateTouched = useRef(false)
  // 話ごとの記録は、書き込めるシートの「見た」「見てる」の作品でだけ出す（評価の画面・マッチングの読むだけのシートでは出さない。答え方を2つにしない）
  const showEpisodes = !readOnly && (state === 'WATCHING' || state === 'WATCHED')
  const ownEpisodes = useEpisodes(token, !props.episodes && showEpisodes ? [work.id] : NO_WORKS, props.enqueue ?? noEnqueue)
  const eps = props.episodes ?? ownEpisodes
  // 開いた時刻。読み込み中の秒数を、待つのをやめて中身を出したあとも続けて数える
  const [openedAt] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchWorkDetail(token, work.id)
        .then((d) => {
          if (cancelled) return
          setDetail(d)
          // 開いた元が自分の状態を知らない（参加作品・Shikimori の関連作品から開いた）ときは、詳細の状態を使う
          // （2026-10-06 の点検: 見た作品が「まだ記録していません」と出て、話ごとの記録も出なかった）
          if (work.viewerStatusState === undefined && !stateTouched.current) setState(d.viewerStatusState && d.viewerStatusState !== 'NO_STATE' ? d.viewerStatusState : null)
        })
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
    stateTouched.current = true
    setState(value === 'NO_STATE' ? null : value)
    props.onChange({ state: value === 'NO_STATE' ? null : value })
    props.enqueue(`「${work.title}」の状態`, () => updateStatus(token, work.id, value), [{ kind: 'status', workId: work.id, state: value }])
  }

  // 見てる作品の最終話まで記録したあと: 作品の評価を付けて（付けずに）「見た」にする
  function finish(next: RatingState | null) {
    if (props.readOnly) return
    if (next && next !== rating) changeRatingTo(next)
    else if (state !== 'WATCHED') changeState('WATCHED')
  }

  function changeRatingTo(next: RatingState) {
    if (props.readOnly) return
    const value = next === rating ? null : next
    const becomesWatched = value !== null && state !== 'WATCHED'
    touched.current = true
    setRating(value)
    if (becomesWatched) {
      stateTouched.current = true
      setState('WATCHED')
    }
    props.onChange({ rating: value, ...(becomesWatched ? { state: 'WATCHED' as const } : {}) })
    props.enqueue(
      `「${work.title}」の評価`,
      async () => {
        if (becomesWatched) await updateStatus(token, work.id, 'WATCHED')
        // 送信の時点での実際の感想を、共有の控えから読む（画面は先に変えている）。
        // 読み込み前に押されても、ここで読み込みを待つので、既存の評価を重複させない
        const current = (await getMyReviews(token)).get(work.annictId) ?? null
        await rememberReview(token, work.annictId, await changeRating(token, work.id, current, value))
      },
      [...(becomesWatched ? [{ kind: 'status' as const, workId: work.id, state: 'WATCHED' as const }] : []), { kind: 'rating', workId: work.id, annictId: work.annictId, rating: value }],
    )
  }

  const official = safeHttpUrl(detail?.officialSiteUrl)
  const wikipedia = safeHttpUrl(detail?.wikipediaUrl)
  const x = xUrl(detail?.twitterUsername)
  const genres = [...(shiki?.genres ?? []), ...(shiki?.themes ?? [])].map(genreName)
  const mal = malIdOf(work)
  const vodLinks = vodSearchLinks(work.title)
  // 制作会社（団体で、役職が「〜制作」のもの。製作委員会などの「製作」は含めない）は、スタッフとは別に一番上に出す
  const isStudio = (st: { role: string; ref: Credit | null }) => st.ref?.kind === 'org' && st.role.includes('制作') && !st.role.includes('製作')
  const studios = (detail?.staffs ?? []).filter(isStudio).filter((st, i, all) => all.findIndex((x) => x.name === st.name) === i)
  const staff = mainStaff((detail?.staffs ?? []).filter((st) => !isStudio(st)))
  // スタッフの表記から、Annict の人物・団体を引く（同じ役職にまとめた名前を、1人ずつ押せるようにする）
  const staffRefs = new Map((detail?.staffs ?? []).flatMap((st) => (st.ref ? [[`${st.role}\u0000${st.name}`, st.ref] as const] : [])))
  const openCredit = (c: Credit, role: string) =>
    setCredit({ credit: c, studio: c.kind === 'org' ? studioFor(c, role, shiki?.studioRefs ?? []) : null })
  // 詳細を読み込むまでは、手元の項目だけで出す
  const watchers = detail?.watchersCount ?? work.watchersCount
  const meta = workMeta(detail ?? work, detail?.episodesCount)
  // 表紙と題名はすぐ出す（評価の画面で出ている字なので組み直しが起きない）。それ以外は、中身と書体がそろってからまとめて出す。
  // そろうまでは並べずに置いておき、そこに含まれる字の書体だけを先に読む（lib/useFontsReady.ts、styles/detail.css の .detail--ready）
  const settled = waitedLong || (error !== null && shikiDone) || (detail !== null && wiki !== undefined && shikiDone)
  const rootRef = useRef<HTMLDivElement>(null)
  const ready = useFontsReady(settled, rootRef)
  // 待つのをやめて出したあとも、まだ届いていない部分。届くまで、何を読んでいるかを添えて読み込み中を出し続ける
  // （出ている分だけで全部だと思わせない）。あらすじは Annict の詳細が届いてから Wikipedia を読む
  const detailPending = detail === null && error === null
  const pending = [
    !shikiDone && 'ジャンル',
    (detailPending || (detail !== null && wiki === undefined)) && 'あらすじ',
    detailPending && '制作会社・スタッフ・声優',
  ].filter((x): x is string => !!x)

  // 話ごとの記録（書き込めるシートの「見た」「見てる」の作品だけ）
  const episodeSection = showEpisodes && (
    <section className="detail__section">
      <h3 className="detail__label">話ごとの記録</h3>
      <EpisodeRecorder
        data={eps.byWork.get(work.id)}
        error={eps.errors.get(work.id) ?? null}
        watching={state === 'WATCHING'}
        undoable={eps.undoable}
        commented={eps.commented}
        onRecord={(ep, r, comment) => eps.record(work.title, work.id, ep, r, comment)}
        onComment={(ep, r, text) => eps.comment(work.title, ep, r, text)}
        onUndo={(ep) => eps.undo(work.title, work.id, ep)}
        onFinish={finish}
        onRetry={eps.retry}
      />
    </section>
  )

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
              {/* 待つのをやめて出したあとも届いていない部分を、何を読んでいるかと一緒に出す。広い画面でも開いてすぐ目に入るよう、題名の欄に置く */}
              {pending.length > 0 && <Loading className="detail__pending" label={`${pending.join('・')}を読み込み中`} since={openedAt} />}
            </div>
          </div>
        </header>

        <div className="detail__body">
          {!ready && (
            <>
              <div className="detail__loading" aria-hidden />
              {/* ふつうはすぐそろうので、少し経ってから文言と秒数を出す */}
              <Loading className="detail__wait" label="詳しい情報を読み込み中" delay={800} since={openedAt} />
            </>
          )}
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

                {/* 見てる作品は、話ごとの記録がいちばんの用事。作品の評価（最後に1回）より上に置く（同じ形のボタンが続いて押し間違えないように） */}
                {state === 'WATCHING' && episodeSection}

                <section className="detail__section">
                  <h3 className="detail__label">評価</h3>
                  <div className="mini-ratings" role="group" aria-label="評価">
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
                  <ReviewEditor token={token} workId={work.id} annictId={work.annictId} title={work.title} overall={rating} enqueue={props.enqueue} />
                </section>

                {state === 'WATCHED' && episodeSection}
              </>
            )}

            {error && <p className="settings__error">{error}</p>}

            {/* 配信サービスの検索への入り口（配信しているかは確かめない。lib/vodSearch.ts）。v0.7.1 で外した「配信」と同じ場所 */}
            {vodLinks.length > 0 && (
              <section className="detail__section">
                <h3 className="detail__label">配信サービスで探す</h3>
                <div className="vods">
                  {vodLinks.map((l) => (
                    <a key={l.name} className="chip chip--link" href={l.href} target="_blank" rel="noreferrer">
                      {l.name}
                    </a>
                  ))}
                </div>
                <p className="detail__hint">各サービスで題名を検索します。配信していない作品もあります。</p>
              </section>
            )}

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

            {/* 上から 制作会社 → スタッフ → 声優。名前を押すと、その会社・人の参加作品の一覧 */}
            <div className="detail__credits">
              {studios.length > 0 && (
                <section className="detail__section">
                  <h3 className="detail__label">制作会社</h3>
                  <dl className="credits">
                    {studios.map((st) => (
                      <div key={st.name} className="credits__row">
                        <dt>{st.role}</dt>
                        <dd>{st.ref ? <CreditName name={st.name} onOpen={() => st.ref && openCredit(st.ref, st.role)} /> : st.name}</dd>
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
                        <dd>
                          {s.names.map((n, i) => {
                            const ref = staffRefs.get(`${s.role}\u0000${n}`)
                            return (
                              <span key={n}>
                                {i > 0 && '、'}
                                {ref ? <CreditName name={n} onOpen={() => openCredit(ref, s.role)} /> : n}
                              </span>
                            )
                          })}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {detail && detail.casts.length > 0 && (
                <section className="detail__section">
                  <h3 className="detail__label">声優</h3>
                  <dl className="credits">
                    {detail.casts.map((c) => (
                      <div key={`${c.character}-${c.name}`} className="credits__row">
                        <dt>{c.character}</dt>
                        <dd>{c.person ? <CreditName name={c.name} onOpen={() => c.person && openCredit(c.person, '')} /> : c.name}</dd>
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
    {credit &&
      (relatedEnqueue ? (
        <CreditWorks token={token} target={credit} active={props.active ?? true} enqueue={relatedEnqueue} onChange={onRelatedChange} onClose={() => setCredit(null)} />
      ) : (
        <CreditWorks readOnly token={token} target={credit} active={props.active ?? true} onClose={() => setCredit(null)} />
      ))}
    </>
  )
}

// キャスト・スタッフの名前。押すと、その人・制作会社の参加作品の一覧を重ねて開く
function CreditName(props: { name: string; onOpen: () => void }) {
  return (
    <button type="button" className="credit__link" onClick={props.onOpen}>
      {props.name}
    </button>
  )
}
