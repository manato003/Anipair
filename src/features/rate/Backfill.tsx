import { useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark } from '../../components/Bookmark'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { InfoIcon, UndoIcon } from '../../components/Icons'
import { SaveStatus } from '../../components/SaveStatus'
import { SeasonPicker } from '../../components/SeasonPicker'
import { UsageGuide } from '../../components/UsageGuide'
import { WorkFacts } from '../../components/WorkFacts'
import { keyLabel, useKeymap } from '../../lib/keymap'
import type { GithubConnection } from '../../lib/github'
import type { Media } from '../../lib/shikimori'
import { useShortcuts } from '../../lib/useShortcuts'
import { previousSeason, seasonLabel, seasonOf } from '../../lib/season'
import { loadOnboardingSeen, saveOnboardingSeen, type Cover } from '../../lib/storage'
import { workMeta } from '../browse/detail'
import { WorkDetail, type WorkSeed } from '../browse/WorkDetail'
import { malIdOf } from '../match/taste'
import { formatDate } from '../records/recordList'
import { OLDEST_SEASON, OLDEST_YEAR, RATINGS, type Answer } from './queue'
import { useBackfill } from './useBackfill'
import { useDeckMedia } from './useDeckMedia'
import { useWatching } from './useWatching'
import type { WatchAnswer } from './watching'

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
// どの作品でも、ボタンの並びと押した結果は同じ（1つの気持ちに1つのボタン。docs/concept.md の設計の原則）。
// 見てる作品では「見てる」が「まだ見てる（そのまま次へ）」になり、意味の合わない「見てない」「見たい」は押せない（位置は変えない）
export function Backfill({ token, github, active }: { token: string; github: GithubConnection | null; active: boolean }) {
  const b = useBackfill(token, github)
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
  const history = useRef<('b' | 'w')[]>([])
  const [historyLength, setHistoryLength] = useState(0)
  const push = (m: 'b' | 'w') => {
    history.current.push(m)
    setHistoryLength(history.current.length)
  }
  // クールを移ると、クールの山の取り消しは消える（useBackfill が捨てる）ので、その分の印も外す
  useEffect(() => {
    history.current = history.current.filter((m) => m === 'w')
    setHistoryLength(history.current.length)
  }, [b.season])
  const answerB = (a: Answer) => {
    if (!b.current) return
    push('b')
    b.answer(a)
  }
  const answerW = (a: WatchAnswer) => {
    if (!w.current) return
    push('w')
    w.answer(a)
  }
  const undo = () => {
    const m = history.current.pop()
    setHistoryLength(history.current.length)
    if (m === 'w') w.undo()
    else if (m === 'b') b.undo()
  }
  const canUndo = historyLength > 0

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
        meta: since ? `${since}から見てる` : '見てる',
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
  // シートを開いているあいだは、詳細のキー以外は効かせない（あらすじを読みながら押した数字で、下のカードに評価が付かないように）。
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
  useShortcuts(showGuide ? {} : sheetOpen ? { detail: toggleSheet } : { ...answers, detail: toggleSheet }, active)

  const next = inWatching ? (w.next ?? b.current) : b.next

  return (
    <>
      <section className="rate">
        {shown?.cover && <div className="rate__backdrop" style={{ backgroundImage: `url(${shown.cover.thumb})` }} aria-hidden />}

        <div className="rate__top">
          <header className="rate__head rate__head--stepper">
            <SeasonPicker value={b.season} min={OLDEST_SEASON} max={thisSeason} onChange={b.jumpTo} onPrevious={b.goToPrevious} onNext={b.goToNext} />
            {inWatching && w.cards ? (
              <span className="count">
                <span className="count__label">見てる</span>
                {w.index + 1}
                <span className="count__of">/{w.cards.length}</span>
              </span>
            ) : (
              b.cards &&
              !b.seasonDone && (
                <span className="count">
                  {b.index + 1}
                  <span className="count__of">/{b.cards.length}</span>
                </span>
              )
            )}
          </header>
        </div>

        <div className="notes">
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
              <button type="button" className="link" onClick={w.reload}>
                読み直す
              </button>
            </p>
          )}
        </div>

        <div className="rate__stage">
          {!watchReady ? (
            <div className="card card--loading" aria-busy>
              <div className="card__cover" />
            </div>
          ) : shown && inWatching ? (
            <WorkCard key={shown.key} shown={shown} media={shown.facts.malId ? deckMedia.get(shown.facts.malId) ?? null : null} onOpen={toggleSheet} />
          ) : b.finished ? (
            <Empty title={`${OLDEST_YEAR}年までさかのぼりました`} body="ここより前のクールは出しません。お疲れさまでした。" />
          ) : b.loadError ? (
            <Empty title="作品を読み込めませんでした" body={b.loadError}>
              <button type="button" className="btn" onClick={b.reload}>
                もう一度読み込む
              </button>
            </Empty>
          ) : !b.cards ? (
            <div className="card card--loading" aria-busy>
              <div className="card__cover" />
            </div>
          ) : b.seasonDone || !shown ? (
            <Empty title={`${seasonLabel(b.season)}はここまで`} body="このクールの人気作をすべて見ました。">
              <button type="button" className="btn btn--primary" onClick={b.goToPrevious}>
                {seasonLabel(previousSeason(b.season))}へ進む
              </button>
            </Empty>
          ) : (
            <WorkCard key={shown.key} shown={shown} media={shown.facts.malId ? deckMedia.get(shown.facts.malId) ?? null : null} onOpen={toggleSheet} />
          )}
          {/* 次の表紙を先に読み込んでおき、切り替えを待たせない */}
          {next?.cover && <link rel="preload" as="image" href={next.cover.url} />}
        </div>

        {/* 答えは押す回数の多いものほど下（親指の近く）に、大きく置く。どれも1回で押せて、位置はどの作品でも変わらない。
            上: ときどき使う状態（見てる・視聴中断）と補助（取り消す・詳しく。よく押す詳しくを右端に） / 中: 評価 / 下: いちばん多い「見てない」と「見たい」 */}
        <div className="answers answers--tiered" aria-disabled={!hasCurrent}>
          <div className="answers__sub">
            <button
              type="button"
              className="sub"
              disabled={!hasCurrent}
              onClick={reply.watching}
              title={inWatching ? 'まだ見ている作品は、そのまま次へ進みます' : '「見てる」にします'}
            >
              見てる <kbd className="hint">{keyLabel(keys.watching)}</kbd>
            </button>
            <button type="button" className="sub" disabled={!hasCurrent} onClick={reply.stop} title="途中で見るのをやめた作品を「視聴中断」にします">
              視聴中断 <kbd className="hint">{keyLabel(keys.stop)}</kbd>
            </button>
            <span className="answers__gap" aria-hidden />
            <button type="button" className="misc misc--quiet" disabled={!canUndo} onClick={undo}>
              <UndoIcon />
              取り消す <kbd className="hint">{keyLabel(keys.undo)}</kbd>
            </button>
            <button type="button" className="misc misc--quiet" disabled={!hasCurrent} onClick={toggleSheet}>
              <InfoIcon />
              詳しく <kbd className="hint">{keyLabel(keys.detail)}</kbd>
            </button>
          </div>
          {/* 評価の段。左端の「覚えてない」は、見たけれど評価できない作品（評価を付けずに「見た」にする）。尺度の外なので少し離す */}
          <div className="answers__ratings answers__ratings--five">
            <button type="button" className="rating rating--none" disabled={!hasCurrent} onClick={reply.watched} title="見たけれど内容を覚えていない作品を、評価を付けずに「見た」にします">
              <span className="rating__label">覚えてない</span>
              <kbd className="hint">{keyLabel(keys.watched)}</kbd>
            </button>
            {RATINGS.map((r) => (
              <button key={r.rating} type="button" className={`rating rating--${r.rating.toLowerCase()}`} disabled={!hasCurrent} onClick={() => reply.rate(r.rating)}>
                <span className="rating__label">{r.label}</span>
                <kbd className="hint">{keyLabel(keys[r.action])}</kbd>
              </button>
            ))}
          </div>
          {/* いちばん多い答え。「見てない」を右（右手の親指の近く）に幅広く、中立の色で塗る（良い・悪いの意味を持たせない） */}
          <div className="answers__main">
            <button type="button" className="main main--wanna" disabled={!hasCurrent || inWatching} onClick={reply.wanna}>
              <Bookmark />
              見たい <kbd className="hint">{keyLabel(keys.wanna)}</kbd>
            </button>
            <button type="button" className="main main--skip" disabled={!hasCurrent || inWatching} onClick={reply.skip}>
              見てない <kbd className="hint">{keyLabel(keys.skip)}</kbd>
            </button>
          </div>
        </div>
      </section>

      {/* .rate の直下の要素は position を上書きされるので、シートは外に出す */}
      {showGuide && <UsageGuide onClose={closeGuide} />}
      {sheetOpen && shown && <WorkDetail readOnly token={token} work={shown.seed} cover={shown.cover} active={active} onClose={() => setSheetFor(null)} />}
    </>
  )
}

function WorkCard({ shown, media, onOpen }: { shown: Shown; media: Media | null; onOpen: () => void }) {
  return (
    <article className="card">
      <button type="button" className="card__cover" onClick={onOpen} aria-label="詳しく見る">
        {shown.cover ? <CoverImage cover={shown.cover} size="large" fallback={<span className="card__noimage">{shown.title}</span>} /> : <span className="card__noimage">{shown.title}</span>}
        {/* 押すと詳しく見られる印。PC だけに出す（スマホでは表紙の上の飾りが気になるので出さない。押せば開くのは同じ） */}
        <span className="card__info" aria-hidden>
          <InfoIcon />
        </span>
      </button>
      <div className="card__text">
        <h2 className="card__title">{shown.title}</h2>
        {shown.meta && <p className="card__meta">{shown.meta}</p>}
        <WorkFacts media={media} head={shown.facts.head} note={shown.facts.note} />
      </div>
    </article>
  )
}
