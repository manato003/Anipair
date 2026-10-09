import { useState } from 'react'
import { Bookmark } from '../../components/Bookmark'
import { Empty } from '../../components/Empty'
import { HeadActions } from '../../components/ControlCenter'
import { ActLabel, BackIcon, EyeIcon, InfoIcon, LaterIcon, PassIcon, PauseIcon, PlayIcon, RatingIcon, UndoIcon } from '../../components/Icons'
import { SaveStatus } from '../../components/SaveStatus'
import { Sheet } from '../../components/Sheet'
import { Phrase } from '../../components/Phrase'
import { WorkFacts } from '../../components/WorkFacts'
import { episodeFacts } from '../../lib/watchFacts'
import { keyLabel, rangeLabel, useKeymap } from '../../lib/keymap'
import type { GithubConnection } from '../../lib/github'
import { useShortcuts } from '../../lib/useShortcuts'
import { RATINGS } from '../rate/queue'
import { MatchDetail } from './MatchDetail'
import { MatchFilterControls } from './MatchFilterControls'
import { ENOUGH_LIKED } from './tasteLoader'
import { titleOf, useMatching, type MatchAnswer, type MatchCard } from './useMatching'
import { FlowStage, type FlowPrev } from '../../components/FlowStage'
import { Loading, LoadingMark } from '../../components/Loading'

const FORMAT_JA: Record<string, string> = {
  TV: 'TV',
  MOVIE: '劇場版',
  ONA: '配信',
  OVA: 'OVA',
}

export function Matching(props: { annictToken: string; github: GithubConnection | null; active: boolean }) {
  const m = useMatching(props.annictToken, props.github)
  // 「見たことがある」を押すと、評価の画面と同じ並び（見てる・視聴中断・評価の段）に入れ替わる。カードが変わったら閉じる
  const [seenFor, setSeenFor] = useState<number | null>(null)
  const seenOpen = m.current !== null && seenFor === m.current.media.idMal

  // 詳細のシートを開いている候補。候補が変わったら閉じる
  const [sheetFor, setSheetFor] = useState<number | null>(null)
  const sheetOpen = m.current !== null && sheetFor === m.current.media.idMal
  const toggleSheet = () => {
    if (m.current) setSheetFor(sheetOpen ? null : m.current.media.idMal)
  }

  // 流れの上に出す「直前の答え」（答えた順に積む。ひとつ戻ると外す。提案し直すと空にする）
  const [answeredLog, setAnsweredLog] = useState<FlowPrev[]>([])
  const answer = (a: MatchAnswer) => {
    const card = m.current
    if (card) setAnsweredLog((log) => [...log, { key: String(card.media.idMal), title: titleOf(card.media), cover: card.media.cover, mark: matchMark(a) }])
    m.answer(a)
  }
  const undo = () => {
    if (!m.canUndo) return
    setAnsweredLog((log) => log.slice(0, -1))
    m.undo()
  }
  // 提案し直すと、前の候補への答えは流れから外す
  const run = () => {
    setAnsweredLog([])
    return m.run()
  }

  // 絞り込みのシート。開いているあいだは、下のカードにキーが効かないようにする
  const [filterOpen, setFilterOpen] = useState(false)
  // 右上の「?」の使い方を開いているあいだは、答えのキーを止める
  const [helpOpen, setHelpOpen] = useState(false)

  // PC ではキーボードで答えられる。評価のキーは「見たことがある」を開かなくても効く。割り当ては設定画面で変えられる。
  // シートを開いているあいだは、詳細のキー以外は効かせない（詳細を読みながら押した数字で、下のカードに評価が付かないように）
  const keys = useKeymap()
  const answers = {
    rateBad: () => answer({ kind: 'rate', rating: 'BAD' }),
    rateAverage: () => answer({ kind: 'rate', rating: 'AVERAGE' }),
    rateGood: () => answer({ kind: 'rate', rating: 'GOOD' }),
    rateGreat: () => answer({ kind: 'rate', rating: 'GREAT' }),
    wanna: () => answer({ kind: 'wanna' }),
    pass: () => answer({ kind: 'pass' }),
    later: () => answer({ kind: 'skip' }),
    watched: () => answer({ kind: 'watched' }),
    watching: () => answer({ kind: 'watching' }),
    stop: () => answer({ kind: 'stop' }),
    undo,
  }
  useShortcuts(sheetOpen ? { detail: toggleSheet } : { ...answers, detail: toggleSheet }, props.active && !filterOpen && !helpOpen)

  const showDeck = m.phase.kind === 'ready'
  const showCard = showDeck && !m.done && m.current !== null

  return (
    <>
      <section className="rate rate--flow">

        <header className="rate__head">
          <h1 className="season">おすすめ</h1>
          <div className="rate__meta">
            {showDeck && !m.done && (
              <span className="count">
                {m.index + 1}
                <span className="count__of">/{m.cards.length}</span>
              </span>
            )}
            {showDeck && (
              <span className="rate__links">
                <button type="button" className="link" onClick={() => setFilterOpen(true)}>
                  条件
                </button>
                <button type="button" className="link" onClick={run}>
                  提案し直す
                </button>
              </span>
            )}
            <HeadActions topic="match" active={props.active} onOpenChange={setHelpOpen} />
          </div>
        </header>

        <div className="notes">
          <SaveStatus pending={m.pending} failed={m.failed} onRetry={m.retryFailed} onDismiss={m.dismissFailed} />
          {m.syncNote && <p className="note">{m.syncNote}</p>}
          {showDeck && m.basis && m.basis.liked < ENOUGH_LIKED && (
            <p className="note">
              好きな作品の記録がまだ{m.basis.liked}件なので、提案は大まかです。{ENOUGH_LIKED}件ほど評価すると好みに寄ってきます。
            </p>
          )}
        </div>

        <FlowStage
          current={
            showCard && m.current
              ? {
                  key: String(m.current.media.idMal),
                  title: titleOf(m.current.media),
                  cover: m.current.media.cover,
                  onOpen: toggleSheet,
                  info: <MatchInfo card={m.current} />,
                }
              : null
          }
          placeholder={
            m.phase.kind === 'idle' ? (
            <Empty
              title="次に見る作品を探す"
              body="Annict の記録から好みを調べて、まだ記録していない作品を提案します。「見たい」を押すと Annict の見たいリストに入ります。"
            >
              <MatchFilterControls filter={m.filter} onChange={m.setFilter} />
              <button type="button" className="btn btn--primary" onClick={run}>
                提案してもらう
              </button>
              {!props.github && <p className="note">興味なし・保留にした作品はこの端末だけに記録します。設定で GitHub と連携すると、PC とスマホで共有できます。</p>}
            </Empty>
          ) : m.phase.kind === 'loading' ? (
            <div className="flow__loading" aria-busy>
              <LoadingMark />
              <Loading className="card__step" label={m.phase.step} mark={false} remaining={m.phase.work} />
              {m.phase.note && <p className="card__note">{m.phase.note}</p>}
            </div>
          ) : m.phase.kind === 'error' ? (
            <Empty title="提案を作れませんでした" body={m.phase.message}>
              <button type="button" className="btn" onClick={run}>
                もう一度試す
              </button>
            </Empty>
          ) : m.phase.kind === 'empty' ? (
            <Empty title="まだ提案できません" body={m.phase.message}>
              <button type="button" className="btn" onClick={run}>
                もう一度試す
              </button>
            </Empty>
          ) : m.done || !m.current ? (
            <Empty title="候補はここまで" body="「見たい」にした作品は Annict の見たいリストに入っています。保留にした作品は1週間後に、興味なしにした作品は3ヶ月後に、また候補に出てきます。">
              <button type="button" className="btn btn--primary" onClick={run}>
                もう一度提案してもらう
              </button>
            </Empty>
          ) : null
          }
          prev={answeredLog.at(-1) ?? null}
          next={showCard && m.next ? { key: String(m.next.media.idMal), title: titleOf(m.next.media), cover: m.next.media.cover } : null}
          ahead={showCard ? m.cards.slice(m.index + 2, m.index + 5).map((c) => c.media.cover) : []}
          emptyPrev="答えた候補は、ここに印を付けて残ります"
        >
        <div className="answers answers--tiered" aria-disabled={!m.current}>
          <div className="answers__sub">
            <button type="button" className="misc misc--quiet" disabled={!m.canUndo} onClick={undo}>
              <UndoIcon />
              <ActLabel>ひとつ戻る</ActLabel> <kbd className="hint">{keyLabel(keys.undo)}</kbd>
            </button>
            {seenOpen ? (
              <>
                <button type="button" className="sub" onClick={() => answer({ kind: 'watching' })} title="Annict で「見てる」にします">
                  <PlayIcon />
                  <ActLabel>見てる</ActLabel> <kbd className="hint">{keyLabel(keys.watching)}</kbd>
                </button>
                <button type="button" className="sub" onClick={() => answer({ kind: 'stop' })} title="途中で見るのをやめた作品を「視聴中断」にします">
                  <PauseIcon />
                  <ActLabel>視聴中断</ActLabel> <kbd className="hint">{keyLabel(keys.stop)}</kbd>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sub sub--wide"
                disabled={!m.current || !showDeck}
                onClick={() => setSeenFor(m.current?.media.idMal ?? null)}
                title="見たことがある作品を評価します"
              >
                <EyeIcon />
                <ActLabel>見たことがある</ActLabel> <kbd className="hint">{rangeLabel(RATINGS.map((r) => keys[r.action]))}</kbd>
              </button>
            )}
            <button type="button" className="misc misc--quiet" disabled={!m.current || !showDeck} onClick={toggleSheet}>
              <InfoIcon />
              <ActLabel>詳しく</ActLabel> <kbd className="hint">{keyLabel(keys.detail)}</kbd>
            </button>
          </div>
          {seenOpen ? (
            <>
              {/* 評価の段。左端の「覚えてない」は、見たけれど評価できない作品（評価の画面と同じ並び） */}
              <div className="answers__ratings answers__ratings--five">
                <button type="button" className="rating rating--none" onClick={() => answer({ kind: 'watched' })} title="見たけれど内容を覚えていない作品を、評価を付けずに「見た」にします">
                  <RatingIcon rating="NONE" />
                  <ActLabel>覚えてない</ActLabel>
                  <kbd className="hint">{keyLabel(keys.watched)}</kbd>
                </button>
                {RATINGS.map((r) => (
                  <button
                    key={r.rating}
                    type="button"
                    className={`rating rating--${r.rating.toLowerCase()}`}
                    onClick={() => answer({ kind: 'rate', rating: r.rating })}
                  >
                    <RatingIcon rating={r.rating} />
                    <ActLabel>{r.label}</ActLabel>
                    <kbd className="hint">{keyLabel(keys[r.action])}</kbd>
                  </button>
                ))}
              </div>
              <div className="answers__main answers__main--one">
                <button type="button" className="main main--back" onClick={() => setSeenFor(null)}>
                  <BackIcon />
                  <ActLabel>戻る</ActLabel>
                </button>
              </div>
            </>
          ) : (
            <div className="answers__main answers__main--three">
              <button type="button" className="main main--wanna" disabled={!m.current || !showDeck} onClick={() => answer({ kind: 'wanna' })}>
                <Bookmark />
                <ActLabel>見たい</ActLabel> <kbd className="hint">{keyLabel(keys.wanna)}</kbd>
              </button>
              <button
                type="button"
                className="main main--pass"
                disabled={!m.current || !showDeck}
                onClick={() => answer({ kind: 'pass' })}
                title="興味の無い作品を、3ヶ月のあいだ候補に出さなくします"
              >
                <PassIcon />
                <ActLabel>興味なし</ActLabel> <kbd className="hint">{keyLabel(keys.pass)}</kbd>
              </button>
              <button
                type="button"
                className="main main--skip"
                disabled={!m.current || !showDeck}
                onClick={() => answer({ kind: 'skip' })}
                title="今は決めずに、1週間後にまた候補に出します"
              >
                <LaterIcon />
                <ActLabel>保留</ActLabel> <kbd className="hint">{keyLabel(keys.later)}</kbd>
              </button>
            </div>
          )}
        </div>
        </FlowStage>
      </section>

      {/* .rate の直下の要素は position を上書きされるので、シートは外に出す */}
      {filterOpen && (
        <Sheet label="候補の条件" active={props.active} onClose={() => setFilterOpen(false)}>
          <section className="detail__section">
            <MatchFilterControls filter={m.filter} onChange={m.setFilter} />
            <p className="detail__hint">条件を変えても、いまの候補はそのままです。「提案し直す」で新しい条件の候補になります。</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setFilterOpen(false)
                void run()
              }}
            >
              この条件で提案し直す
            </button>
          </section>
        </Sheet>
      )}
      {sheetOpen && m.current && (
        <MatchDetail
          key={m.current.media.idMal}
          token={props.annictToken}
          card={m.current}
          resolve={m.resolveCard}
          active={props.active}
          relatedEnqueue={m.enqueue}
          onRelatedChange={(work, patch) => {
            // 記録した（状態か評価を付けた）作品は、これから出てくる候補から外す
            const mal = Number(work.malAnimeId)
            if ((patch.state || patch.rating) && Number.isInteger(mal) && mal > 0) m.dropCandidate(mal)
          }}
          onClose={() => setSheetFor(null)}
        />
      )}
    </>
  )
}

// いまの候補の情報（題名の下）: 放送年・形式・話数と一気見の目安、制作会社と点数（広い画面）、おすすめの理由
function MatchInfo({ card }: { card: MatchCard }) {
  const { media, reasons } = card
  // 世間の点数は、スマホでも出るこの行に入れる（広い画面だけの手がかりの欄には入れない）
  const meta = [
    media.seasonYear ? `${media.seasonYear}年` : null,
    media.format ? FORMAT_JA[media.format] ?? media.format : null,
    ...episodeFacts(media),
    media.score ? `Shikimori ${media.score.toFixed(1)}` : null,
  ].filter(
    (x): x is string => !!x,
  )
  return (
    <>
      {meta.length > 0 && (
        <p className="flow__meta">
          {meta.map((x) => (
            <span key={x} className="fact">
              {x}
            </span>
          ))}
        </p>
      )}
      <WorkFacts media={media} head={[]} />
      {reasons.length > 0 && (
        <ul className="reasons">
          {reasons.map((r) => (
            <li key={r}>
              <Phrase text={r} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// 直前の答えの印
function matchMark(a: MatchAnswer): FlowPrev['mark'] {
  switch (a.kind) {
    case 'wanna':
      return { label: '見たい', icon: <Bookmark />, strong: true }
    case 'pass':
      return { label: '興味なし', icon: <PassIcon /> }
    case 'skip':
      return { label: '保留', icon: <LaterIcon /> }
    case 'rate': {
      const r = RATINGS.find((x) => x.rating === a.rating)
      return { label: r?.label ?? '評価', icon: <RatingIcon rating={a.rating} /> }
    }
    case 'watched':
      return { label: '覚えてない', icon: <RatingIcon rating="NONE" /> }
    case 'watching':
      return { label: '見てる', icon: <PlayIcon /> }
    case 'stop':
      return { label: '視聴中断', icon: <PauseIcon /> }
  }
}
