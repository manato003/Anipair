import { idMalOf, malIdOf } from '../../lib/malId'
import { englishPersonOf, useEnglishPeople } from '../../lib/englishNames'
import { Phrase } from '../../components/Phrase'
import { useRef, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { annictWorkUrl, peekLibrary, updateStatus, type Credit, type RatingState, type StatusState } from '../../lib/annict'
import { rateNow } from '../../lib/rateNow'
import { getLang, t } from '../../lib/i18n'
import { characterName, personName, staffRole, workTitle } from '../../lib/names'
import { shikimoriUrl } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { vodSearchLinks } from '../../lib/vodSearch'
import { formatBroadcast, hasChoice, upcomingByChannel, useBroadcastPrefs } from '../../lib/broadcast'
import { useClock } from '../../lib/useClock'
import { BroadcastSheet } from '../../components/BroadcastSheet'
import { isAiringCandidate, useUpcomingPrograms } from '../records/useUpcomingPrograms'
import { episodeFacts, formatMinutes } from '../../lib/watchFacts'
import { useFontsReady } from '../../lib/useFontsReady'
import type { WriteIntent } from '../../lib/writeJournal'
import { genreName } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { STATE_OPTIONS, formatDateTime, optionState } from '../records/recordList'
import { EpisodeRecorder } from '../records/EpisodeRecords'
import { useEpisodes, type EpisodesController } from '../records/useEpisodes'
import { CreditWorks, type CreditTarget } from './CreditWorks'
import { STATUS_LABEL, mainStaff, seriesFacts, studioFor, withCopyrightMark, safeHttpUrl, workMeta, xUrl } from './detail'
import { RelatedDetail, type RelatedTarget } from './RelatedDetail'
import { RelatedWorks } from './RelatedWorks'
import { SimilarWorks } from './SimilarWorks'
import { CommunityReviews } from './CommunityReviews'
import { Loading } from '../../components/Loading'
import { ExternalIcon, InfoIcon, PeopleIcon, UserIcon } from '../../components/Icons'
import { ReviewEditor } from './ReviewEditor'
import { useWorkDetailData } from './useWorkDetailData'

// シートを開く作品の手がかり。詳細を読み込むまでは、ここにある項目だけで出す（分からない項目は省く）
export interface WorkSeed {
  id: string
  annictId: number
  title: string
  // 英語の画面に出す題名（Annict の titleEn。無ければ詳細を読んだあとの値を使う）
  titleEn?: string | null
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
  // 見たいの作品の「優先して見る」とメモ（記録の画面だけが渡す。見たいのときだけ出す）
  wanna?: { priority: boolean; memo: string; onTogglePriority: () => void; onEditMemo: () => void }
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
// 話の一覧を読まないとき（読むだけのシート・見た／見てる以外）と、書き込まないシートの列の代わり
const NO_WORKS: readonly string[] = []
const noEnqueue: Enqueue = () => undefined
// 中身（詳細・ジャンル）がそろうのを待つ上限。過ぎたら、届いたものだけで出す

// Annict の形式（Media）を、作品の要点の計算に使う形式にそろえる（Shikimori の情報が無い作品のため）
const ANNICT_FORMAT: Record<string, string> = { TV: 'TV', MOVIE: 'MOVIE', OVA: 'OVA', WEB: 'ONA' }

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
  // Annict の詳細・Shikimori・あらすじなどを読む（届いた詳細の状態と自分の感想は、下の編集の状態に入れる。useWorkDetailData.ts）
  const { detail, error, shiki, shikiDone, wiki, castRomaji, waitedLong } = useWorkDetailData(token, work, readOnly, {
    detail: (d) => {
      // 開いた元が自分の状態を知らない（参加作品・Shikimori の関連作品から開いた）ときは、詳細の状態を使う
      // （2026-10-06 の点検: 見た作品が「まだ記録していません」と出て、話ごとの記録も出なかった）
      if (work.viewerStatusState === undefined && !stateTouched.current) setState(d.viewerStatusState && d.viewerStatusState !== 'NO_STATE' ? d.viewerStatusState : null)
    },
    myReview: (review) => {
      if (touched.current) return
      setRating(review?.ratingOverallState ?? null)
      if (review) setReviewAt({ at: review.createdAt, withText: review.body.trim() !== '' })
    },
  })
  // 画面に出す題名（英語の画面では英語名。開いた元に英語名が無ければ、詳細を読んだあとの英語名）
  const shownTitle = workTitle({ title: work.title, titleEn: work.titleEn ?? detail?.titleEn })
  // あらすじの全文を広げているか（ネタバレを含むことがあるので、押したときだけ）
  const [wikiOpen, setWikiOpen] = useState(false)
  // 放送中の作品の、見るサービスごとの次の放送（Issue #32。記録の「見てる」のカードは一番早いものだけなので、ここで全部を並べる）
  const broadcastPrefs = useBroadcastPrefs()
  const [servicesOpen, setServicesOpen] = useState(false)
  const airing = shiki?.status === 'RELEASING' || isAiringCandidate(work, false, new Date())
  const programs = useUpcomingPrograms(token, airing ? [work.id] : [], airing && hasChoice(broadcastPrefs) && props.active !== false)
  const clock = useClock(airing && hasChoice(broadcastPrefs) && props.active !== false)
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
  const active = (props.active ?? true) && related === null && credit === null && !servicesOpen
  // 英語の画面: 声優・スタッフの英語名（Wikidata。引けたら描き直す）
  useEnglishPeople(detail ? [...detail.casts.map((c) => c.person?.name ?? c.name), ...detail.staffs.filter((st) => st.ref?.kind !== 'org').map((st) => st.ref?.name ?? st.name)] : [])
  // Annict は未記録を null ではなく NO_STATE で返す。画面では「記録なし」にそろえる
  const [state, setState] = useState<StatusState | null>(work.viewerStatusState && work.viewerStatusState !== 'NO_STATE' ? work.viewerStatusState : null)
  const [rating, setRating] = useState<RatingState | null>(null)
  // いつ記録したか: 状態を付けた日時（手元のライブラリの控えから。状態が違えば出さない）と、評価・感想を付けた日時。
  // このシートで変えたら、いまの日時にする
  const [stateAt, setStateAt] = useState<string | null>(() => {
    const entry = peekLibrary()?.find((e) => e.annictId === work.annictId)
    return entry && entry.state === work.viewerStatusState ? entry.stateAt : null
  })
  const [reviewAt, setReviewAt] = useState<{ at: string; withText: boolean } | null>(null)
  // Annict に書いてあるこの作品のメモ（手元のライブラリの控えから。API では書けないので、読んで出すだけ）
  const [annictNote] = useState<string | null>(() => peekLibrary()?.find((e) => e.annictId === work.annictId)?.note ?? null)
  const touched = useRef(false)
  // 状態をこのシートで変えたか（変えたら、あとから届いた詳細の状態で上書きしない）
  const stateTouched = useRef(false)
  // 話ごとの記録は、書き込めるシートの「見た」「見てる」の作品でだけ出す（評価の画面・マッチングの読むだけのシートでは出さない。答え方を2つにしない）
  const showEpisodes = !readOnly && (state === 'WATCHING' || state === 'WATCHED')
  const ownEpisodes = useEpisodes(token, !props.episodes && showEpisodes ? [work.id] : NO_WORKS, props.enqueue ?? noEnqueue)
  const eps = props.episodes ?? ownEpisodes
  // 開いた時刻。読み込み中の秒数を、待つのをやめて中身を出したあとも続けて数える
  const [openedAt] = useState(() => Date.now())

  function changeState(next: StatusState) {
    if (props.readOnly) return
    const value = next === optionState(state) ? 'NO_STATE' : next
    stateTouched.current = true
    setState(value === 'NO_STATE' ? null : value)
    setStateAt(value === 'NO_STATE' ? null : new Date().toISOString())
    props.onChange({ state: value === 'NO_STATE' ? null : value })
    props.enqueue(t(`「${shownTitle}」の状態`, `Status for “${shownTitle}”`), () => updateStatus(token, work.id, value), [{ kind: 'status', workId: work.id, state: value, idMal: idMalOf(work.malAnimeId) }])
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
    setReviewAt(value ? { at: new Date().toISOString(), withText: false } : null)
    if (becomesWatched) {
      stateTouched.current = true
      setState('WATCHED')
      setStateAt(new Date().toISOString())
    }
    props.onChange({ rating: value, ...(becomesWatched ? { state: 'WATCHED' as const } : {}) })
    props.enqueue(
      t(`「${shownTitle}」の評価`, `Rating for “${shownTitle}”`),
      async () => {
        if (becomesWatched) await updateStatus(token, work.id, 'WATCHED')
        // 送信の時点での実際の感想を、共有の控えから読む（画面は先に変えている）。
        // 読み込み前に押されても、ここで読み込みを待つので、既存の評価を重複させない
        await rateNow(token, work.id, work.annictId, value)
      },
      [...(becomesWatched ? [{ kind: 'status' as const, workId: work.id, state: 'WATCHED' as const, idMal: idMalOf(work.malAnimeId) }] : []), { kind: 'rating', workId: work.id, annictId: work.annictId, rating: value, idMal: idMalOf(work.malAnimeId) }],
    )
  }

  const official = safeHttpUrl(detail?.officialSiteUrl)
  const wikipedia = safeHttpUrl(detail?.wikipediaUrl)
  const x = xUrl(detail?.twitterUsername)
  const genres = [...(shiki?.genres ?? []), ...(shiki?.themes ?? [])].map(genreName)
  const mal = malIdOf(work)
  const vodLinks = vodSearchLinks(work.title)
  // 制作会社（団体で、役職が「〜制作」のもの。製作委員会などの「製作」は含めない）は、スタッフとは別に一番上に出す
  const isStudio = (st: { role: string; ref: Credit | null }) => st.ref?.kind === 'org' && st.role.includes('制作') && !st.role.includes('製作') // i18n-ok: Annict の役職名（日本語）との比較
  const studios = (detail?.staffs ?? []).filter(isStudio).filter((st, i, all) => all.findIndex((x) => x.name === st.name) === i)
  const staff = mainStaff((detail?.staffs ?? []).filter((st) => !isStudio(st)))
  // スタッフの表記から、Annict の人物・団体を引く（同じ役職にまとめた名前を、1人ずつ押せるようにする）
  const staffRefs = new Map((detail?.staffs ?? []).flatMap((st) => (st.ref ? [[`${st.role}\u0000${st.name}`, st.ref] as const] : [])))
  // 英語の画面に出す名前と役職（同じ役職にまとめた名前を、1人ずつ英語名に替える）
  const staffNameEn = new Map((detail?.staffs ?? []).map((st) => [st.name, st.nameEn ?? null] as const))
  const staffRoleEn = new Map((detail?.staffs ?? []).map((st) => [st.role, st.roleOtherEn ?? null] as const))
  const openCredit = (c: Credit, role: string) =>
    setCredit({ credit: c, studio: c.kind === 'org' ? studioFor(c, role, shiki?.studioRefs ?? []) : null })
  // 詳細を読み込むまでは、手元の項目だけで出す
  const watchers = detail?.watchersCount ?? work.watchersCount
  // 題名の下の要点: 放送時期・形式に、放送中・全◯話・一気見の目安（Shikimori の話数と1話の長さ。無ければ Annict の話数）
  const headFacts = [
    workMeta(detail ?? work),
    ...episodeFacts(
      {
        format: shiki?.format ?? ANNICT_FORMAT[(detail ?? work).media ?? ''] ?? null,
        status: shiki?.status ?? null,
        episodes: shiki?.episodes,
        episodesAired: shiki?.episodesAired,
        duration: shiki?.duration,
      },
      detail?.episodesCount,
    ),
  ].filter((f) => !!f)
  // データで見る: 1話の長さと、シリーズの何作目か・次の作品（劇場版の上映時間は題名の下に出している）
  const dataRows: [string, string][] = [
    ...(shiki?.duration && shiki.format !== 'MOVIE' ? [[t('1話の長さ', 'Episode length'), formatMinutes(shiki.duration)] as [string, string]] : []),
    ...seriesFacts(detail?.series, work.annictId),
  ]
  // 表紙と題名はすぐ出す（評価の画面で出ている字なので組み直しが起きない）。それ以外は、中身と書体がそろってからまとめて出す。
  // そろうまでは並べずに置いておき、そこに含まれる字の書体だけを先に読む（lib/useFontsReady.ts、styles/detail.css の .detail--ready）
  const settled = waitedLong || (error !== null && shikiDone) || (detail !== null && wiki !== undefined && shikiDone)
  const rootRef = useRef<HTMLDivElement>(null)
  const ready = useFontsReady(settled, rootRef)
  // 「作品について」の塊に出すものがあるか（無ければ塊ごと出さない。MyAnimeList の ID があれば似た作品の棚が、
  // Annict の詳細が読めればみんなの感想（無ければ「まだ感想がありません」）が出る）
  const hasAbout =
    genres.length > 0 || dataRows.length > 0 || !!wiki || (detail?.series?.length ?? 0) > 0 || (shiki?.related?.length ?? 0) > 0 || !!mal || detail !== null
  // 待つのをやめて出したあとも、まだ届いていない部分。届くまで、何を読んでいるかを添えて読み込み中を出し続ける
  // （出ている分だけで全部だと思わせない）。あらすじは Annict の詳細が届いてから Wikipedia を読む
  const detailPending = detail === null && error === null
  const pending = [
    !shikiDone && t('ジャンル', 'genres'),
    (detailPending || (detail !== null && wiki === undefined)) && t('あらすじ', 'synopsis'),
    detailPending && t('制作会社・スタッフ・声優', 'studios, staff, and cast'),
  ].filter((x): x is string => !!x)

  // 話ごとの記録（書き込めるシートの「見た」「見てる」の作品だけ）。全部の話を記録し終えたか（並び順に使う）
  const workEpisodes = eps.byWork.get(work.id)?.episodes ?? []
  const allTracked = workEpisodes.length > 0 && workEpisodes.every((e) => e.viewerDidTrack)
  const pendingSep = t('・', ', ')
  const episodeSection = showEpisodes && (
    <section className="detail__section">
      <h3 className="detail__label">{t('話ごとの記録', 'Episode records')}</h3>
      <EpisodeRecorder
        data={eps.byWork.get(work.id)}
        error={eps.errors.get(work.id) ?? null}
        watching={state === 'WATCHING'}
        airing={shiki?.status === 'RELEASING'}
        undoable={eps.undoable}
        commented={eps.commented}
        onRecord={(ep, r, comment) => eps.record(shownTitle, work.id, ep, r, comment)}
        onComment={(ep, r, text) => eps.comment(shownTitle, ep, r, text)}
        onCommentExisting={(ep, text, onSent) => eps.commentExisting(shownTitle, ep, text, onSent)}
        onUndo={(ep) => eps.undo(shownTitle, work.id, ep)}
        onFinish={finish}
        onRetry={eps.retry}
        past={eps.past}
        onLookupPast={eps.lookupPast}
        workAnnictId={work.annictId}
      />
    </section>
  )

  return (
    <>
    <Sheet label={shownTitle} size="page" active={active} onClose={props.onClose}>
      <div ref={rootRef} className={ready ? 'detail detail--ready' : 'detail'} aria-busy={!ready}>
        <header className="detail__head">
          <div className={props.cover?.landscape ? 'detail__cover detail__cover--landscape' : 'detail__cover'}>
            {props.cover && <CoverImage cover={props.cover} size="large" />}
          </div>
          <div className="detail__titles">
            <h2 className="detail__title">
              <Phrase text={shownTitle} />
            </h2>
            <div className="detail__late">
              {/* 題名の下: 日本語は読みがな。英語は、見出しを英語名にしたときだけ元の日本語の題名 */}
              {getLang() === 'en'
                ? shownTitle !== work.title && <p className="detail__kana">{work.title}</p>
                : detail?.titleKana && <p className="detail__kana">{detail.titleKana}</p>}
              {headFacts.length > 0 && (
                <p className="detail__meta">
                  {headFacts.map((f) => (
                    <span key={f} className="fact">
                      {f}
                    </span>
                  ))}
                </p>
              )}
              {watchers !== undefined && <p className="detail__meta">{t(`Annictで${watchers.toLocaleString()}人が記録`, `${watchers.toLocaleString()} recorded on Annict`)}</p>}
              {/* 待つのをやめて出したあとも届いていない部分を、何を読んでいるかと一緒に出す。広い画面でも開いてすぐ目に入るよう、題名の欄に置く */}
              {pending.length > 0 && <Loading className="detail__pending" label={t(`${pending.join(pendingSep)}を読み込み中`, `Loading ${pending.join(pendingSep)}`)} since={openedAt} />}
            </div>
          </div>
          {/* 表紙の権利表記。表紙の列に入れると狭い画面で何行にも折れるので、表紙と題名の下に幅いっぱいで出す */}
          {withCopyrightMark(detail?.copyright) && <p className="detail__copyright detail__late">{withCopyrightMark(detail?.copyright)}</p>}
        </header>

        <div className="detail__body">
          {!ready && (
            <>
              <div className="detail__loading" aria-hidden />
              {/* ふつうはすぐそろうので、少し経ってから文言と秒数を出す */}
              <Loading className="detail__wait" label={t('詳しい情報を読み込み中', 'Loading details')} delay={800} since={openedAt} />
            </>
          )}
          <div className="detail__late">
            {/* 中身は内容で4つの塊に分ける（あなたの記録・作品について・スタッフ・キャスト・ほかのサイトで見る）。
                塊は板で囲み（XMB の情報の板のような半透明）、見出しは分類の帯と同じくアイコンと名前。中の項目の見出しは小さく。塊のあいだは広く、中は狭く空ける */}
            {!readOnly && (
              <section className="group">
                <h3 className="group__title">
                  <UserIcon />
                  {t('あなたの記録', 'Your records')}
                </h3>
                <section className="detail__section">
                  <h3 className="detail__label">{t('状態', 'Status')}</h3>
                  <div className="state-chips">
                    {STATE_OPTIONS.map((o) => (
                      <button key={o.state} type="button" className="chip" aria-pressed={optionState(state) === o.state} onClick={() => changeState(o.state)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="detail__hint">
                    {state
                      ? t(`選んでいる「${STATUS_LABEL[state]}」をもう一度押すと、記録から外します。`, `Tap “${STATUS_LABEL[state]}” again to remove it from your records.`)
                      : t('まだ記録していません。', 'Not recorded yet.')}
                  </p>
                  {state && stateAt && (
                    <p className="detail__when">
                      {t('「', 'Marked “')}
                      {STATUS_LABEL[state]}
                      {t('」にした日時', '” on')} <time dateTime={stateAt}>{formatDateTime(stateAt)}</time>
                    </p>
                  )}
                </section>

                {state === 'WANNA_WATCH' && props.wanna && (
                  <section className="detail__section">
                    <h3 className="detail__label">{t('優先とメモ', 'Priority and note')}</h3>
                    <div className="wannanote">
                      <button type="button" className="chip" aria-pressed={props.wanna.priority} onClick={props.wanna.onTogglePriority}>
                        {props.wanna.priority ? t('★ 優先して見る', '★ Watch first') : t('☆ 優先して見る', '☆ Watch first')}
                      </button>
                      <button type="button" className="btn" onClick={props.wanna.onEditMemo}>
                        {props.wanna.memo ? t('メモを直す', 'Edit note') : t('メモを書く', 'Add note')}
                      </button>
                    </div>
                    {props.wanna.memo && <p className="wannanote__memo">{props.wanna.memo}</p>}
                  </section>
                )}

                {/* Annict のメモ: Annict の作品ページで書いたメモを読んで出す（書き直すのは Annict で。Anipair の見たいのメモとは別のもの） */}
                {annictNote && (
                  <section className="detail__section">
                    <h3 className="detail__label">{t('Annictのメモ', 'Note on Annict')}</h3>
                    <p className="wannanote__memo">{annictNote}</p>
                    <p className="detail__hint">
                      {t('', 'You can edit it with “Record” on the ')}
                      <a href={annictWorkUrl(work.annictId)} target="_blank" rel="noreferrer">
                        {t('Annictの作品ページ', 'Annict anime page')}
                      </a>
                      {t('の「記録する」で書き直せます。', '.')}
                    </p>
                  </section>
                )}

                {/* 見てる作品は、話ごとの記録がいちばんの用事。作品の評価（最後に1回）より上に置く（同じ形のボタンが続いて押し間違えないように）。
                    全部の話を記録し終えたら、作品の評価が次の用事なので、見た作品と同じく評価の下に回す */}
                {state === 'WATCHING' && !allTracked && episodeSection}

                <section className="detail__section">
                  <h3 className="detail__label">{t('評価', 'Rating')}</h3>
                  <div className="mini-ratings" role="group" aria-label={t('評価', 'Rating')}>
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
                  {rating && reviewAt && (
                    <p className="detail__when">
                      {reviewAt.withText ? t('評価と感想を付けた日時', 'Rated and reviewed on') : t('評価を付けた日時', 'Rated on')} <time dateTime={reviewAt.at}>{formatDateTime(reviewAt.at)}</time>
                    </p>
                  )}
                  <ReviewEditor token={token} workId={work.id} annictId={work.annictId} idMal={idMalOf(work.malAnimeId)} title={shownTitle} overall={rating} enqueue={props.enqueue} />
                </section>

                {/* コレクションは Annict の機能（API では読み書きできない）。作り直さずに、Annict の作品ページへ案内する */}
                <section className="detail__section">
                  <h3 className="detail__label">{t('コレクション', 'Collections')}</h3>
                  <p className="detail__hint">
                    {t('コレクションはAnnictの機能です。', 'Collections are an Annict feature. On the ')}
                    <a href={annictWorkUrl(work.annictId)} target="_blank" rel="noreferrer">
                      {t('Annictの作品ページ', 'Annict anime page')}
                    </a>
                    {t(
                      'で、作品画像の下のメニューボタンを押すと右側に出るパネルから追加できます。',
                      ', tap the menu button under the cover image and add it from the panel that appears on the right.',
                    )}
                  </p>
                </section>

                {(state === 'WATCHED' || (state === 'WATCHING' && allTracked)) && episodeSection}
              </section>
            )}

            {error && <p className="settings__error">{error}</p>}

            {hasAbout && (
              <section className="group">
                <h3 className="group__title">
                  <InfoIcon />
                  {t('作品について', 'About this anime')}
                </h3>
                {genres.length > 0 && (
                  <section className="detail__section">
                    <h3 className="detail__label">{t('ジャンル', 'Genre')}</h3>
                    <ul className="tags">
                      {genres.map((g) => (
                        <li key={g} className="tag">
                          {g}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* データで見る: 次に見る1本を決める手がかり（myanimecheck.com を参考に。手元のデータから計算するだけ） */}
                {dataRows.length > 0 && (
                  <section className="detail__section">
                    <h3 className="detail__label">{t('データで見る', 'By the numbers')}</h3>
                    <dl className="credits">
                      {dataRows.map(([k, v]) => (
                        <div key={k} className="credits__row">
                          <dt>{k}</dt>
                          <dd>
                            <Phrase text={v} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                {/* あらすじ: Wikipedia の冒頭の段落（ネタバレを避ける）。続きは押したときだけ、その場で広げる。出典とライセンス（CC BY-SA 4.0）を添える */}
                {wiki && (
                  <section className="detail__section">
                    <h3 className="detail__label">{wiki.lang === 'en' ? 'Synopsis' : t('あらすじ', 'Synopsis (from Japanese Wikipedia)')}</h3>
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
                        {!wikiOpen && <span className="detail__spoiler">{t('ネタバレを含むことがあります', 'May contain spoilers')}</span>}
                        <button type="button" className="link" onClick={() => setWikiOpen((v) => !v)} aria-expanded={wikiOpen}>
                          {wikiOpen ? t('続きを閉じる', 'Show less') : t('続きを読む', 'Read more')}
                        </button>
                      </p>
                    )}
                    <p className="detail__source">
                      {t('出典: Wikipedia「', 'Source: Wikipedia “')}
                      <a href={wiki.url} target="_blank" rel="noreferrer">
                        {wiki.title}
                      </a>
                      {t('」（', '” (')}
                      <a href={wiki.licenseUrl} target="_blank" rel="noreferrer">
                        CC BY-SA 4.0
                      </a>
                      {t('）', ')')}
                    </p>
                  </section>
                )}

                {/* みんなの感想: Annict の満足度・件数と、いいねの多い感想（まだ見ていない作品は、本文を押したときだけ。欄が画面に近づいてから読む） */}
                <CommunityReviews token={token} workId={work.id} annictId={work.annictId} watched={state === 'WATCHED'} />

                {/* 関連作品: Annict のシリーズ。無ければ Shikimori の関連作品（詳細を読み込むまでは出さない） */}
                <RelatedWorks
                  annictId={work.annictId}
                  series={detail ? (detail.series ?? []) : error ? [] : null}
                  shiki={shiki}
                  states={relatedStates}
                  onOpen={setRelated}
                />

                {/* 似た作品: Shikimori の似た作品を表紙の棚で（棚が画面に近づいてから読む） */}
                <SimilarWorks malId={mal} onOpen={setRelated} />
              </section>
            )}

            {/* 上から 制作会社 → スタッフ → 声優。名前を押すと、その会社・人の参加作品の一覧 */}
            {(studios.length > 0 || staff.length > 0 || (detail?.casts.length ?? 0) > 0) && (
              <section className="group detail__credits">
                <h3 className="group__title">
                  <PeopleIcon />
                  {t('スタッフ・キャスト', 'Staff & cast')}
                </h3>
                {studios.length > 0 && (
                  <section className="detail__section">
                    <h3 className="detail__label">{t('制作会社', 'Studio')}</h3>
                    <dl className="credits">
                      {studios.map((st) => (
                        <div key={st.name} className="credits__row">
                          <dt>{staffRole(st.role, st.roleOtherEn)}</dt>
                          <dd>{st.ref ? <CreditName name={personName(st)} onOpen={() => st.ref && openCredit(st.ref, st.role)} /> : personName(st)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                {staff.length > 0 && (
                  <section className="detail__section">
                    <h3 className="detail__label">{t('スタッフ', 'Staff')}</h3>
                    <dl className="credits">
                      {staff.map((s) => (
                        <div key={s.role} className="credits__row">
                          <dt>{staffRole(s.role, staffRoleEn.get(s.role))}</dt>
                          <dd>
                            {s.names.map((n, i) => {
                              const ref = staffRefs.get(`${s.role}\u0000${n}`)
                              // 英語名は Annict の人物の名前で引く（クレジットの表記は「日向夏（ヒーロー文庫／…刊）」のように出版社が付くことがある）
                              const shown = (getLang() === 'en' && ref?.kind === 'person' && englishPersonOf(ref.name)) || personName({ name: n, nameEn: staffNameEn.get(n) })
                              return (
                                <span key={n}>
                                  {i > 0 && t('、', ', ')}
                                  {ref ? <CreditName name={shown} onOpen={() => openCredit(ref, s.role)} /> : shown}
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
                    <h3 className="detail__label">{t('声優', 'Cast')}</h3>
                    <dl className="credits">
                      {detail.casts.map((c) => (
                        <div key={`${c.character}-${c.name}`} className="credits__row">
                          <dt>{characterName({ name: c.character, nameEn: c.characterEn }, castRomaji)}</dt>
                          <dd>{c.person ? <CreditName name={personName({ name: c.person.name, nameEn: c.person.nameEn ?? c.nameEn })} onOpen={() => c.person && openCredit(c.person, '')} /> : personName(c)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </section>
            )}

            {/* 外のサイトを開くものは、ここにまとめる（記録のボタンと見た目を分け、↗ を付ける） */}
            <section className="group">
              <h3 className="group__title">
                <ExternalIcon />
                {t('ほかのサイトで見る', 'View on other sites')}
              </h3>
              {airing && (
                <BroadcastSection
                  chosen={hasChoice(broadcastPrefs)}
                  slots={programs.slots.get(work.id) ?? null}
                  failed={programs.failed}
                  partial={programs.partial.has(work.id)}
                  now={clock}
                  list={upcomingByChannel(programs.slots.get(work.id) ?? [], broadcastPrefs, clock)}
                  onRetry={programs.retry}
                  onChoose={() => setServicesOpen(true)}
                />
              )}
              {/* 配信サービスの検索への入り口（配信しているかは確かめない。lib/vodSearch.ts）。v0.7.1 で外した「配信」と同じ場所 */}
              {vodLinks.length > 0 && (
                <section className="detail__section">
                  <h3 className="detail__label">{t('配信サービスで探す', 'Search on streaming services')}</h3>
                  <div className="vods">
                    {vodLinks.map((l) => (
                      <a key={l.name} className="chip chip--link" href={l.href} target="_blank" rel="noreferrer">
                        {l.name}
                        <ExternalIcon />
                      </a>
                    ))}
                  </div>
                  <p className="detail__hint">{t('各サービスで題名を検索します。配信していない作品もあります。', 'Searches each service by title. Some anime may not be available.')}</p>
                </section>
              )}
              <section className="detail__section">
                <h3 className="detail__label">{t('作品のページ', 'Anime pages')}</h3>
                <div className="detail__links">
                  <a href={annictWorkUrl(work.annictId)} target="_blank" rel="noreferrer">
                    Annict
                  </a>
                  {official && (
                    <a href={official} target="_blank" rel="noreferrer">
                      {t('公式サイト', 'Official site')}
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
                      {t('Shikimoriで見る', 'View on Shikimori')}
                    </a>
                  )}
                </div>
              </section>
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
    {servicesOpen && <BroadcastSheet onClose={() => setServicesOpen(false)} />}
    </>
  )
}

// 見るサービスごとの次の放送（早い順）。選ぶ前は入口だけ、読めないときは黙らずに言う
function BroadcastSection(props: {
  chosen: boolean
  slots: readonly unknown[] | null
  failed: boolean
  // これから先の分を読み切れなかった（Annict の予定が多すぎる作品）
  partial: boolean
  now: Date
  list: readonly { channel: string; at: Date }[]
  onChoose: () => void
  onRetry: () => void
}) {
  const now = props.now
  return (
    <section className="detail__section">
      <h3 className="detail__label">{t('次の放送', 'Next airing')}</h3>
      {!props.chosen ? (
        <p className="detail__hint">
          {t('見るサービスを選ぶと、ここに次の放送日が出ます。', 'Choose where you watch to see upcoming air dates here.')}
          <button type="button" className="link" onClick={props.onChoose}>
            {t('選ぶ', 'Choose')}
          </button>
        </p>
      ) : props.slots === null ? (
        props.failed ? (
          <p className="detail__hint">
            {t('放送予定を読み込めませんでした。', 'Couldn’t load the airing schedule.')}
            <button type="button" className="link" onClick={props.onRetry}>
              {t('もう一度', 'Retry')}
            </button>
          </p>
        ) : (
          <p className="detail__hint">{t('放送予定を読み込み中…', 'Loading airing schedule…')}</p>
        )
      ) : (
        <>
          {props.list.length > 0 ? (
            <ul className="airings">
              {props.list.map((x) => (
                <li key={x.channel}>
                  <span className="airings__channel">{x.channel}</span>
                  <span className="airings__at">{formatBroadcast(x.at, now)}</span>
                </li>
              ))}
            </ul>
          ) : (
            // 見つからないことと、Annict に無いことは同じではない（読むのは4週間先までで、Annict の登録が無い作品もある。#34）
            <p className="detail__hint">
              {props.partial
                ? t('放送予定が多く、これから先の分を読み切れませんでした。', 'There are too many scheduled airings to load everything ahead.')
                : t('これから4週間のうちに、選んだサービスでの放送予定は見つかりませんでした。', 'No airings found on your chosen services in the next 4 weeks.')}
            </p>
          )}
          <p className="detail__hint">
            {t('Annictの放送予定より（登録されていない予定は出ません）。', 'From Annict’s airing schedule (unregistered airings aren’t shown). ')}
            <button type="button" className="link" onClick={props.onChoose}>
              {t('見るサービスを変える', 'Change where I watch')}
            </button>
          </p>
        </>
      )}
    </section>
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
