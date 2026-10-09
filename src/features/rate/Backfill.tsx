import { episodeFacts } from '../../lib/watchFacts'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Bookmark } from '../../components/Bookmark'
import { Empty } from '../../components/Empty'
import { HeadActions } from '../../components/ControlCenter'
import { ActLabel, EyeOffIcon, InfoIcon, PauseIcon, PlayIcon, RatingIcon, UndoIcon } from '../../components/Icons'
import { SaveStatus } from '../../components/SaveStatus'
import { SeasonPicker } from '../../components/SeasonPicker'
import { UsageGuide } from '../../components/UsageGuide'
import { WorkFacts } from '../../components/WorkFacts'
import { FlowStage, type FlowItem, type FlowPrev } from '../../components/FlowStage'
import { keyLabel, useKeymap } from '../../lib/keymap'
import type { GithubConnection } from '../../lib/github'
import { useShortcuts } from '../../lib/useShortcuts'
import { previousSeason, seasonLabel, seasonOf } from '../../lib/season'
import { loadOnboardingSeen, saveOnboardingSeen, type Cover } from '../../lib/storage'
import { recordFeat, recordTimeFeats } from '../achievements/achievementStore'
import { featTitle } from '../achievements/titles'
import { announceEarned } from '../achievements/titleToast'
import { workMeta } from '../browse/detail'
import { WorkDetail, type WorkSeed } from '../browse/WorkDetail'
import { malIdOf } from '../match/taste'
import { formatDate } from '../records/recordList'
import { OLDEST_SEASON, OLDEST_YEAR, RATINGS, type Answer, type Card } from './queue'
import { useBackfill } from './useBackfill'
import { useDeckMedia } from './useDeckMedia'
import { useWatching } from './useWatching'
import type { WatchAnswer, WatchCard } from './watching'
import { Loading, LoadingMark } from '../../components/Loading'
import { nextLabel } from '../records/episodes'
import { StaleNote } from '../../components/StaleNote'
import { useViewingSeason } from '../../lib/theme'

// その回に答えた数がこの数に届くたびに、短い演出を出す
const MILESTONE_STEP = 10
// 演出を出しておく長さ（rate.css の milestone-in と同じ）。操作は止めない。
// 0.9 秒では読む前に消えて、ご褒美だと分からなかった
const MILESTONE_MS = 2400
// 隠し称号「一夜城」: このクールでこの数以上を一度に答えて踏破した
const ONE_NIGHT_CASTLE = 20

// 演出の火花。中心から count 方向に飛ぶ（rate.css の .sparks）
function Sparks({ count }: { count: number }) {
  return (
    <span className="sparks" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} style={{ '--angle': `${(360 / count) * i + 360 / count / 2}deg` } as CSSProperties} />
      ))}
    </span>
  )
}

// いま画面に出している1枚
interface Shown {
  key: string
  title: string
  cover: Cover | null
  seed: WorkSeed
  meta: string | null
  // 広い画面だけに出す作品の手がかり（WorkFacts）。head は先頭に並べる項目、note は添える一言
  facts: { malId: number | null; head: string[]; note: string | null }
}

// 評価の画面。1つの山で、先に「見てる」の作品（見終わったら評価する）、続いて選んだクールのまだ記録していない作品を出す。
// どの作品でも、ボタンの並びと押した結果は同じ（1つの気持ちに1つのボタン）。
// 見てる作品では「見てる」が「まだ見てる（そのまま次へ）」になり、意味の合わない「見てない」「見たい」は押せない（位置は変えない）
export function Backfill({ token, github, active }: { token: string; github: GithubConnection | null; active: boolean }) {
  const b = useBackfill(token, github)
  // 地の色を、選んでいるクールの季節に
  useViewingSeason(b.season.name, active)
  const w = useWatching(token)

  // 見てる作品は別の画面でも増減する。タブを開き直したときに、手を付けていなければ読み直す
  const { refreshIfIdle } = w
  useEffect(() => {
    if (active) refreshIfIdle()
  }, [active, refreshIfIdle])

  // 見てる作品の読み込みを待ってから山を出す（あとから読み終わって、答えている途中のカードが入れ替わらないように）。
  // 読めなかったときは、見てる作品を飛ばしてクールの作品だけで進める
  const watchReady = w.cards !== null || w.loadError !== null
  const inWatching = w.current !== null

  // 取り消しは、2つの山をまたいで答えた順に戻す（どちらの山で答えたかの印を積む）
  // 答えた順の印。kind はどちらの山か、prev は流れの上に出す「直前の答え」（作品と答えの印）
  const history = useRef<{ kind: 'b' | 'w'; prev: FlowPrev | null }[]>([])
  const [historyLength, setHistoryLength] = useState(0)
  // 流れの上に出す「直前の答え」（印の山のいちばん上）
  const [lastPrev, setLastPrev] = useState<FlowPrev | null>(null)
  const syncHistory = () => {
    setHistoryLength(history.current.length)
    setLastPrev(history.current.at(-1)?.prev ?? null)
  }
  const push = (kind: 'b' | 'w', prev: FlowPrev | null) => {
    history.current.push({ kind, prev })
    syncHistory()
  }
  // このクールで、この回に答えた数（隠し称号「一夜城」: 一度に20本以上答えて踏破した）
  const seasonAnswered = useRef(0)
  // クールを移ると、クールの山の取り消しは消える（useBackfill が捨てる）ので、その分の印も外す
  useEffect(() => {
    history.current = history.current.filter((m) => m.kind === 'w')
    syncHistory()
    seasonAnswered.current = 0
  }, [b.season])

  // その回に答えた数（どちらの山でも1件。取り消すと戻る）。10件ごとに短い演出を出す。
  // 一度祝った節目は、取り消してまた届いても祝わない（同じ演出を何度も見せない）
  const answered = useRef(0)
  const celebrated = useRef(0)
  const [milestone, setMilestone] = useState<number | null>(null)
  const countAnswer = (delta: 1 | -1) => {
    answered.current += delta
    // 隠し称号（丑三つ時・暁・年越し）
    if (delta === 1) announceEarned(recordTimeFeats().map(featTitle))
    const n = answered.current
    if (delta === 1 && n % MILESTONE_STEP === 0 && n > celebrated.current) {
      celebrated.current = n
      setMilestone(n)
    }
  }
  // 演出の字を先に読んでおく（初めての演出で、字があとから差し替わらないように。日本語の書体は字ごとに後から読む）
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    if (!fonts) return
    fonts.load('700 1em "Zen Maru Gothic"', '0123456789件踏破').catch(() => undefined)
    fonts.load('700 1em "Zen Maru Gothic"', '突破人気作本、すべてに答えました。').catch(() => undefined)
    fonts.load('500 1em "Zen Maru Gothic"', '次の目標0123456789件').catch(() => undefined)
  }, [])
  useEffect(() => {
    if (milestone === null) return
    const timer = window.setTimeout(() => setMilestone(null), MILESTONE_MS)
    return () => window.clearTimeout(timer)
  }, [milestone])

  // いま出している作品を、答えの印と一緒に「直前の答え」として覚える（shown は下で決まるので、描くたびに控える）
  const shownRef = useRef<Shown | null>(null)
  const prevOf = (label: string): FlowPrev | null => {
    const sh = shownRef.current
    return sh ? { key: sh.key, title: sh.title, cover: sh.cover, mark: markOf(label) } : null
  }
  const answerB = (a: Answer) => {
    if (!b.current) return
    push('b', prevOf(answerLabel(a)))
    countAnswer(1)
    seasonAnswered.current += 1
    b.answer(a)
  }
  const answerW = (a: WatchAnswer) => {
    if (!w.current) return
    push('w', prevOf(answerLabel(a)))
    countAnswer(1)
    w.answer(a)
  }
  const undo = () => {
    const m = history.current.pop()?.kind
    syncHistory()
    if (m) countAnswer(-1)
    if (m === 'b') seasonAnswered.current = Math.max(0, seasonAnswered.current - 1)
    if (m === 'w') w.undo()
    else if (m === 'b') b.undo()
  }
  const canUndo = historyLength > 0
  // 見てる作品の山を読み直すと、その山の取り消しは消える（useWatching が捨てる）ので、その分の印も外す
  const reloadWatching = () => {
    history.current = history.current.filter((m) => m.kind !== 'w')
    syncHistory()
    w.reload()
  }

  const bCurrent = b.current
  const wCurrent = w.current
  const shown = useMemo<Shown | null>(() => {
    if (wCurrent) {
      const { entry, cover } = wCurrent
      const since = formatDate(entry.stateAt)
      return {
        key: entry.workId,
        title: entry.title,
        cover,
        seed: { id: entry.workId, annictId: entry.annictId, title: entry.title, malAnimeId: entry.malAnimeId, viewerStatusState: entry.state },
        // 「次は 第11話「題名」（全12話）」。見終えたかを答える手がかり（全話数はライブラリと一緒に読んでいる）
        meta: [
          since ? `${since}から見てる` : '見てる',
          entry.nextEpisode ? `${nextLabel(entry.nextEpisode)}${entry.episodesCount ? `（全${entry.episodesCount}話）` : ''}` : null,
        ]
          .filter(Boolean)
          .join('・'),
        facts: { malId: malIdOf(entry), head: [workMeta({ seasonYear: entry.seasonYear, seasonName: entry.seasonName })].filter(Boolean), note: null },
      }
    }
    if (!bCurrent) return null
    return {
      key: bCurrent.work.id,
      title: bCurrent.work.title,
      cover: bCurrent.cover,
      seed: bCurrent.work,
      meta: null,
      facts: {
        malId: malIdOf(bCurrent.work),
        head: [seasonLabel(b.season), workMeta({ media: bCurrent.work.media })],
        note: bCurrent.work.watchersCount > 0 ? `Annict で ${bCurrent.work.watchersCount.toLocaleString()}人が記録` : null,
      },
    }
  }, [bCurrent, wCurrent, b.season])
  useEffect(() => {
    shownRef.current = shown
  })

  // カードの手がかり用に、山の作品の情報をまとめて取る（表紙の解決で取り込み済みなら問い合わせない）
  const bCards = b.cards
  const wCards = w.cards
  const deckIds = useMemo(() => {
    const ids = [...(wCards ?? []).map((c) => malIdOf(c.entry)), ...(bCards ?? []).map((c) => malIdOf(c.work))]
    const valid = ids.filter((n): n is number => n !== null)
    return valid.length > 0 ? valid : null
  }, [bCards, wCards])
  const deckMedia = useDeckMedia(deckIds)

  // 初めて評価の画面を開いたときだけ、使い方のシートを出す。どう閉じても「見た」ことにして、次からは出さない
  const [guideOpen, setGuideOpen] = useState(() => !loadOnboardingSeen())
  const showGuide = guideOpen && active
  // 右上の「?」の使い方を開いているあいだは、答えのキーを止める
  const [helpOpen, setHelpOpen] = useState(false)
  const closeGuide = () => {
    saveOnboardingSeen(true)
    setGuideOpen(false)
  }

  // 詳細のシートを開いている作品。カードが変わったら閉じる
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const sheetOpen = shown !== null && sheetFor === shown.key
  const toggleSheet = () => {
    if (shown) setSheetFor(sheetOpen ? null : shown.key)
  }

  // 「見てる」は、どのクールの作品でも押せる（配信で昔の作品をいま見ていることもある。クールで押せたり押せなかったりすると迷わせる）
  const thisSeason = seasonOf(new Date())

  const hasCurrent = watchReady && shown !== null
  // 答え。見てる作品か未記録の作品かで、送り先の山を選ぶ（ボタンの意味は同じ）
  const reply = {
    rate: (rating: (typeof RATINGS)[number]['rating']) => (inWatching ? answerW({ kind: 'rate', rating }) : answerB({ kind: 'rate', rating })),
    watched: () => (inWatching ? answerW({ kind: 'watched' }) : answerB({ kind: 'watched' })),
    watching: () => (inWatching ? answerW({ kind: 'still' }) : answerB({ kind: 'watching' })),
    stop: () => (inWatching ? answerW({ kind: 'stop' }) : answerB({ kind: 'stop' })),
    skip: () => (inWatching ? undefined : answerB({ kind: 'skip' })),
    wanna: () => (inWatching ? undefined : answerB({ kind: 'wanna' })),
  }

  // PC ではキーボードで答えられる。割り当ては設定画面で変えられる。
  // シートを開いているあいだは、詳細のキー以外は効かせない（詳細を読みながら押した数字で、下のカードに評価が付かないように）。
  // 使い方のシートのあいだは、すべて効かせない（読みながら押したキーで答えたり、下の作品の詳細が開いたりしないように）
  const keys = useKeymap()
  const answers = hasCurrent
    ? {
        rateBad: () => reply.rate('BAD'),
        rateAverage: () => reply.rate('AVERAGE'),
        rateGood: () => reply.rate('GOOD'),
        rateGreat: () => reply.rate('GREAT'),
        watched: reply.watched,
        watching: reply.watching,
        stop: reply.stop,
        skip: reply.skip,
        wanna: reply.wanna,
        undo,
      }
    : { undo }
  useShortcuts(showGuide || helpOpen ? {} : sheetOpen ? { detail: toggleSheet } : { ...answers, detail: toggleSheet }, active)

  const next = inWatching ? (w.next ?? b.current) : b.next
  // クールの最後の1枚に答えて、そのクールを答え切った（開いた時点で全部記録済みだったクールでは祝わない）
  // 見直しの山を答え終えたときは、踏破の演出を出し直さない
  const cleared = b.seasonDone && b.index > 0 && !b.reviewing
  useEffect(() => {
    if (cleared && seasonAnswered.current >= ONE_NIGHT_CASTLE && recordFeat('oneNightCastle')) announceEarned([featTitle('oneNightCastle')])
  }, [cleared])
  const progress = b.progress
  // いまの作品を流れに出すか。出さないあいだは、表紙の場所に読み込み中・空・踏破を出す
  const showCard = watchReady && shown !== null && (inWatching || (!b.finished && !b.loadError && !!b.cards && !(cleared && progress) && !b.seasonDone))
  const shownMedia = shown?.facts.malId ? (deckMedia.get(shown.facts.malId) ?? null) : null
  const shownScore = shownMedia?.score ? `Shikimori ${shownMedia.score.toFixed(1)}` : null
  const loadingCard = (
    <div className="flow__loading">
      <LoadingMark />
      <Loading className="card__step" label="作品を読み込み中" delay={600} mark={false} />
    </div>
  )
  const placeholder = !watchReady ? (
    loadingCard
  ) : b.finished ? (
    <Empty title={`${OLDEST_YEAR}年までさかのぼりました`} body="ここより前のクールは出しません。お疲れさまでした。" />
  ) : b.loadError ? (
    <Empty title="作品を読み込めませんでした" body={b.loadError}>
      <button type="button" className="btn" onClick={b.reload}>
        もう一度読み込む
      </button>
    </Empty>
  ) : !b.cards ? (
    loadingCard
  ) : cleared && progress ? (
    <div className="clear" role="status">
      <span className="clear__rays" aria-hidden />
      <Sparks count={12} />
      <p className="clear__season">{seasonLabel(b.season)}</p>
      <p className="clear__title">踏破</p>
      <p className="clear__body">人気作{progress.total}本、すべてに答えました。</p>
      <button type="button" className="btn btn--primary" onClick={b.goToPrevious}>
        {seasonLabel(previousSeason(b.season))}へ進む
      </button>
      <ReviewUnseenButton count={b.unseenLeft} onClick={b.reviewUnseen} />
    </div>
  ) : (
    <Empty
      title={b.reviewing ? `${seasonLabel(b.season)}の見直しはここまで` : `${seasonLabel(b.season)}はここまで`}
      body={b.reviewing ? '「見てない」にした作品を、すべて見直しました。' : 'このクールの人気作をすべて見ました。'}
    >
      <button type="button" className="btn btn--primary" onClick={b.goToPrevious}>
        {seasonLabel(previousSeason(b.season))}へ進む
      </button>
      <ReviewUnseenButton count={b.unseenLeft} onClick={b.reviewUnseen} />
    </Empty>
  )

  return (
    <>
      <section className="rate rate--flow">
        <h1 className="visually-hidden">評価</h1>
        <div className="rate__top">
          <header className="rate__head rate__head--stepper">
            <SeasonPicker value={b.season} min={OLDEST_SEASON} max={thisSeason} onChange={b.jumpTo} onPrevious={b.goToPrevious} onNext={b.goToNext} />
            <HeadActions topic="rate" active={active} onOpenChange={setHelpOpen} />
          </header>
          {/* クールの進み具合。人気作のうち答えた数（Annict で記録済みの分は最初から埋まっている）。
              見てる作品の山を答えているあいだは、その何本目かを行の左に添える（クールを選ぶ行に入れると、スマホの幅からはみ出した） */}
          {inWatching && w.cards && !(progress && progress.total > 0) && (
            <div className="progress">
              <WatchingCount index={w.index} total={w.cards.length} />
            </div>
          )}
          {progress && progress.total > 0 && (
            <div className={milestone !== null ? 'progress progress--glow' : 'progress'}>
              {inWatching && w.cards && <WatchingCount index={w.index} total={w.cards.length} />}
              <div
                className="progress__bar"
                role="progressbar"
                aria-label={`${seasonLabel(b.season)}の人気作のうち、答えた作品`}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.answered}
              >
                <div className="progress__fill" style={{ transform: `scaleX(${progress.answered / progress.total})` }} />
              </div>
              <span className="progress__count" aria-hidden>
                {progress.answered}
                <span className="count__of">/{progress.total}</span>
              </span>
            </div>
          )}
          {/* 10件ごとの演出。重ねて出すだけで、押せない（下のボタンはそのまま押せる） */}
          {milestone !== null && !cleared && (
            <div key={milestone} className="milestone" role="status">
              <Sparks count={8} />
              <span className="milestone__badge">
                <span className="milestone__count">{milestone}</span>
                <span className="milestone__unit">件突破</span>
              </span>
              <span className="milestone__next">次の目標 {milestone + MILESTONE_STEP}件</span>
            </div>
          )}
        </div>

        <div className="notes">
          <StaleNote
            at={active ? (inWatching ? w.staleAt : b.staleAt) : null}
            error={inWatching ? w.staleError : b.staleError}
            onRetry={inWatching ? reloadWatching : b.reload}
          />
          <SaveStatus
            pending={b.pending + w.pending}
            failed={[...b.failed, ...w.failed]}
            onRetry={() => {
              b.retryFailed()
              w.retryFailed()
            }}
            onDismiss={() => {
              b.dismissFailed()
              w.dismissFailed()
            }}
          />
          {b.syncNote && <p className="note">{b.syncNote}</p>}
          {w.loadError && (
            <p className="note">
              見てる作品を読み込めませんでした（{w.loadError}）。クールの作品だけで進めます。{' '}
              <button type="button" className="link" onClick={reloadWatching}>
                読み直す
              </button>
            </p>
          )}
        </div>

        <FlowStage
          current={
            showCard && shown
              ? {
                  key: shown.key,
                  title: shown.title,
                  cover: shown.cover,
                  onOpen: toggleSheet,
                  info: (
                    <>
                      {shown.meta && <p className="flow__meta">{shown.meta}</p>}
                      {/* スマホは手がかりの欄を出さないので、放送時期と形式と世間の点数を1行で */}
                      <p className="flow__meta flow__meta--phone">{[...shown.facts.head, shownScore].filter(Boolean).join(' · ')}</p>
                      <WorkFacts
                        media={shownMedia}
                        head={[...shown.facts.head, ...(shownMedia ? episodeFacts(shownMedia) : [])]}
                        note={[shownScore, shown.facts.note].filter(Boolean).join(' · ') || null}
                      />
                    </>
                  ),
                }
              : null
          }
          placeholder={placeholder}
          prev={lastPrev}
          next={showCard ? flowItemOf(next) : null}
          ahead={showCard ? (inWatching ? (w.cards ?? []).slice(w.index + 2, w.index + 5) : (b.cards ?? []).slice(b.index + 2, b.index + 5)).map((c) => c.cover) : []}
        >
        {/* 答えは押す回数の多いものほど下（親指の近く）に、大きく置く。どれも1回で押せて、位置はどの作品でも変わらない。
            マッチングの画面と共通のボタンは同じ位置に置く:
            上: 両端に補助（ひとつ戻る・詳しく）、あいだに ときどき使う状態（見てる・視聴中断） / 中: 評価 /
            下: いちばん多い答え。決断の要る「見たい」は左、迷わず押せる「見てない」は親指のいちばん近い右下に幅広く */}
        <div className="answers answers--tiered" aria-disabled={!hasCurrent}>
          <div className="answers__sub">
            <button type="button" className="misc misc--quiet" disabled={!canUndo} onClick={undo}>
              <UndoIcon />
              <ActLabel>ひとつ戻る</ActLabel> <kbd className="hint">{keyLabel(keys.undo)}</kbd>
            </button>
            <button
              type="button"
              className="sub"
              disabled={!hasCurrent}
              onClick={reply.watching}
              title={inWatching ? 'まだ見ている作品は、そのまま次へ進みます（このクールのあいだは聞き直しません）' : '「見てる」にします'}
            >
              <PlayIcon />
              <ActLabel>見てる</ActLabel> <kbd className="hint">{keyLabel(keys.watching)}</kbd>
            </button>
            <button type="button" className="sub" disabled={!hasCurrent} onClick={reply.stop} title="途中で見るのをやめた作品を「視聴中断」にします">
              <PauseIcon />
              <ActLabel>視聴中断</ActLabel> <kbd className="hint">{keyLabel(keys.stop)}</kbd>
            </button>
            <button type="button" className="misc misc--quiet" disabled={!hasCurrent} onClick={toggleSheet}>
              <InfoIcon />
              <ActLabel>詳しく</ActLabel> <kbd className="hint">{keyLabel(keys.detail)}</kbd>
            </button>
          </div>
          {/* 評価の段。左端の「覚えてない」は、見たけれど評価できない作品（評価を付けずに「見た」にする）。尺度の外なので少し離す */}
          <div className="answers__ratings answers__ratings--five">
            <button type="button" className="rating rating--none" disabled={!hasCurrent} onClick={reply.watched} title="見たけれど内容を覚えていない作品を、評価を付けずに「見た」にします">
              <RatingIcon rating="NONE" />
              <ActLabel>覚えてない</ActLabel>
              <kbd className="hint">{keyLabel(keys.watched)}</kbd>
            </button>
            {RATINGS.map((r) => (
              <button key={r.rating} type="button" className={`rating rating--${r.rating.toLowerCase()}`} disabled={!hasCurrent} onClick={() => reply.rate(r.rating)}>
                <RatingIcon rating={r.rating} />
                <ActLabel>{r.label}</ActLabel>
                <kbd className="hint">{keyLabel(keys[r.action])}</kbd>
              </button>
            ))}
          </div>
          <div className="answers__main">
            <button type="button" className="main main--wanna" disabled={!hasCurrent || inWatching} onClick={reply.wanna}>
              <Bookmark />
              <ActLabel>見たい</ActLabel> <kbd className="hint">{keyLabel(keys.wanna)}</kbd>
            </button>
            <button type="button" className="main main--skip main--span2" disabled={!hasCurrent || inWatching} onClick={reply.skip}>
              <EyeOffIcon />
              <ActLabel>見てない</ActLabel> <kbd className="hint">{keyLabel(keys.skip)}</kbd>
            </button>
          </div>
        </div>
        </FlowStage>
      </section>

      {/* .rate の直下の要素は position を上書きされるので、シートは外に出す */}
      {showGuide && <UsageGuide onClose={closeGuide} />}
      {sheetOpen && shown && (
        <WorkDetail
          readOnly
          token={token}
          work={shown.seed}
          cover={shown.cover}
          active={active}
          relatedEnqueue={b.enqueue}
          onRelatedChange={(work, patch) => {
            // 記録した（状態か評価を付けた）作品は、これから出てくる山から外す。いま出している1枚は残す
            if (!patch.state && !patch.rating) return
            b.dropFromDeck(work.annictId, !inWatching)
            w.dropFromDeck(work.annictId, inWatching)
          }}
          onClose={() => setSheetFor(null)}
        />
      )}
    </>
  )
}

// 流れの上と下に出す作品（見てる作品の山とクールの山で形が違う）
function flowItemOf(card: Card | WatchCard | null): FlowItem | null {
  if (!card) return null
  return 'entry' in card ? { key: card.entry.workId, title: card.entry.title, cover: card.cover } : { key: card.work.id, title: card.work.title, cover: card.cover }
}

// 答えの名前（直前の答えの印に出す）
function answerLabel(a: Answer | WatchAnswer): string {
  switch (a.kind) {
    case 'rate':
      return RATINGS.find((r) => r.rating === a.rating)?.label ?? '評価'
    case 'watched':
      return '覚えてない'
    case 'wanna':
      return '見たい'
    case 'watching':
      return '見てる'
    case 'still':
      return 'まだ見てる'
    case 'stop':
      return '視聴中断'
    case 'skip':
      return '見てない'
  }
}

function markOf(label: string): FlowPrev['mark'] {
  const rating = RATINGS.find((r) => r.label === label)
  const icon =
    label === '見たい' ? (
      <Bookmark />
    ) : label === '見てない' ? (
      <EyeOffIcon />
    ) : label === '視聴中断' ? (
      <PauseIcon />
    ) : label === '覚えてない' ? (
      <RatingIcon rating="NONE" />
    ) : rating ? (
      <RatingIcon rating={rating.rating} />
    ) : (
      <PlayIcon />
    )
  return { label, icon, strong: label === '見たい' }
}

// クールを終えた画面の「見てないにした作品を見直す」。あとから見た作品を、評価の画面から記録できるように（押したときだけ山に足す）
function ReviewUnseenButton(props: { count: number; onClick: () => void }) {
  if (props.count === 0) return null
  return (
    <button type="button" className="btn review-unseen" onClick={props.onClick}>
      「見てない」にした作品を見直す（{props.count}本）
    </button>
  )
}

// 見てる作品の山の何本目か
function WatchingCount(props: { index: number; total: number }) {
  return (
    <span className="count progress__count">
      <span className="count__label">見てる</span>
      {props.index + 1}
      <span className="count__of">/{props.total}</span>
    </span>
  )
}
