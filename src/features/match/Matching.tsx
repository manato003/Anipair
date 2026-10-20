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
import { t } from '../../lib/i18n'
import { keyLabel, rangeLabel, useKeymap } from '../../lib/keymap'
import type { GithubConnection } from '../../lib/github'
import { useShortcuts } from '../../lib/useShortcuts'
import { RATINGS } from '../rate/queue'
import { MatchDetail } from './MatchDetail'
import { MatchFilterControls } from './MatchFilterControls'
import { ENOUGH_LIKED } from './tasteLoader'
import { displayTitleOf, useMatching, type MatchAnswer, type MatchCard } from './useMatching'
import { FlowStage, type FlowPrev } from '../../components/FlowStage'
import { Loading, LoadingMark } from '../../components/Loading'

// 形式の名前（呼んだときの言語で。知らない形式は Shikimori の名前のまま）
function formatName(format: string): string {
  switch (format) {
    case 'MOVIE':
      return t('劇場版', 'Movie')
    case 'ONA':
      return t('配信', 'ONA')
    default:
      return format
  }
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
    if (card) setAnsweredLog((log) => [...log, { key: String(card.media.idMal), title: displayTitleOf(card.media), cover: card.media.cover, mark: matchMark(a) }])
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
          <h1 className="season">{t('おすすめ', 'Suggestions')}</h1>
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
                  {t('条件', 'Filters')}
                </button>
                <button type="button" className="link" onClick={run}>
                  {t('提案し直す', 'Refresh')}
                </button>
              </span>
            )}
            <HeadActions topic="match" active={props.active} onOpenChange={setHelpOpen} />
          </div>
        </header>

        <div className="notes">
          <SaveStatus pending={m.pending} failed={m.failed} onRetry={m.retryFailed} onDismiss={m.dismissFailed} />
          {m.syncNote && <p className="note">{m.syncNote}</p>}
          {showDeck && m.basis && m.basis.pending > 0 && (
            <p className="note">
              {t(
                `記録が多いので、まず評価の高い作品から提案しています。残りの${m.basis.pending}件は裏で調べていて、あとで「提案し直す」を押すと、調べ終えた分も使って提案します。`,
                `You have a lot of records, so these suggestions start from your highest-rated anime. The other ${m.basis.pending} anime are being checked in the background. Press “Refresh” later to include them.`,
              )}
            </p>
          )}
          {showDeck && m.basis && m.basis.liked < ENOUGH_LIKED && (
            <p className="note">
              {t(
                `好きな作品の記録がまだ${m.basis.liked}件なので、提案は大まかです。${ENOUGH_LIKED}件ほど評価すると好みに寄ってきます。`,
                `You have only ${m.basis.liked} liked anime on record so far, so suggestions are rough. Rate about ${ENOUGH_LIKED} and they’ll fit your taste better.`,
              )}
            </p>
          )}
        </div>

        <FlowStage
          current={
            showCard && m.current
              ? {
                  key: String(m.current.media.idMal),
                  title: displayTitleOf(m.current.media),
                  cover: m.current.media.cover,
                  onOpen: toggleSheet,
                  info: <MatchInfo card={m.current} />,
                }
              : null
          }
          placeholder={
            m.phase.kind === 'idle' ? (
            <Empty
              mood="propose"
              title={t('次に見る作品を探す', 'Find your next anime')}
              body={t(
                'Annictの記録から好みを調べて、まだ記録していない作品を提案します。「見たい」を押すとAnnictの見たいリストに入ります。',
                'Anipair learns your taste from your Annict records and suggests anime you haven’t logged yet. Press “Want to watch” to add one to your Annict Want to watch list.',
              )}
            >
              <MatchFilterControls filter={m.filter} onChange={m.setFilter} />
              <button type="button" className="btn btn--primary" onClick={run}>
                {t('提案してもらう', 'Get suggestions')}
              </button>
              {!props.github && (
                <p className="note">
                  {t(
                    '興味なし・保留にした作品はこの端末だけに記録します。設定でGitHubと連携すると、PCとスマホで共有できます。',
                    'Anime you mark Not interested or Later are saved on this device only. Connect GitHub in Settings to share them between your computer and phone.',
                  )}
                </p>
              )}
            </Empty>
          ) : m.phase.kind === 'loading' ? (
            <div className="flow__loading" aria-busy>
              <LoadingMark />
              <Loading className="card__step" label={m.phase.step} mark={false} remaining={m.phase.work} />
              {m.phase.note && <p className="card__note">{m.phase.note}</p>}
            </div>
          ) : m.phase.kind === 'error' ? (
            <Empty mood="trouble" title={t('提案を作れませんでした', 'Couldn’t make suggestions')} body={m.phase.message}>
              <button type="button" className="btn" onClick={run}>
                {t('もう一度試す', 'Retry')}
              </button>
            </Empty>
          ) : m.phase.kind === 'empty' ? (
            <Empty mood="empty" title={t('まだ提案できません', 'No suggestions yet')} body={m.phase.message}>
              <button type="button" className="btn" onClick={run}>
                {t('もう一度試す', 'Retry')}
              </button>
            </Empty>
          ) : m.done || !m.current ? (
            <Empty
              mood="done"
              title={t('候補はここまで', 'That’s all for now')}
              body={t(
                '「見たい」にした作品はAnnictの見たいリストに入っています。保留にした作品は1週間後に、興味なしにした作品は3ヶ月後に、また候補に出てきます。',
                'Anime you marked Want to watch are on your Annict Want to watch list. Anime marked Later come back in 1 week, and Not interested in 3 months.',
              )}
            >
              <button type="button" className="btn btn--primary" onClick={run}>
                {t('もう一度提案してもらう', 'Get suggestions again')}
              </button>
            </Empty>
          ) : null
          }
          prev={answeredLog.at(-1) ?? null}
          next={showCard && m.next ? { key: String(m.next.media.idMal), title: displayTitleOf(m.next.media), cover: m.next.media.cover } : null}
          ahead={showCard ? m.cards.slice(m.index + 2, m.index + 5).map((c) => c.media.cover) : []}
          emptyPrev={t('答えた候補は、ここに印を付けて残ります', 'Anime you answer stay here with a mark')}
        >
        <div className="answers answers--tiered" aria-disabled={!m.current}>
          <div className="answers__sub">
            <button type="button" className="misc misc--quiet" disabled={!m.canUndo} onClick={undo}>
              <UndoIcon />
              <ActLabel>{t('ひとつ戻る', 'Undo')}</ActLabel> <kbd className="hint">{keyLabel(keys.undo)}</kbd>
            </button>
            {seenOpen ? (
              <>
                <button type="button" className="sub" onClick={() => answer({ kind: 'watching' })} title={t('Annictで「見てる」にします', 'Mark as Watching on Annict')}>
                  <PlayIcon />
                  <ActLabel>{t('見てる', 'Watching')}</ActLabel> <kbd className="hint">{keyLabel(keys.watching)}</kbd>
                </button>
                <button type="button" className="sub" onClick={() => answer({ kind: 'stop' })} title={t('途中で見るのをやめた作品を「視聴中断」にします', 'Mark anime you stopped partway through as Dropped')}>
                  <PauseIcon />
                  <ActLabel>{t('視聴中断', 'Dropped')}</ActLabel> <kbd className="hint">{keyLabel(keys.stop)}</kbd>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sub sub--wide"
                disabled={!m.current || !showDeck}
                onClick={() => setSeenFor(m.current?.media.idMal ?? null)}
                title={t('見たことがある作品を評価します', 'Rate an anime you’ve watched')}
              >
                <EyeIcon />
                <ActLabel>{t('見たことがある', 'Seen it')}</ActLabel> <kbd className="hint">{rangeLabel(RATINGS.map((r) => keys[r.action]))}</kbd>
              </button>
            )}
            <button type="button" className="misc misc--quiet" disabled={!m.current || !showDeck} onClick={toggleSheet}>
              <InfoIcon />
              <ActLabel>{t('詳しく', 'Details')}</ActLabel> <kbd className="hint">{keyLabel(keys.detail)}</kbd>
            </button>
          </div>
          {seenOpen ? (
            <>
              {/* 評価の段。左端の「覚えてない」は、見たけれど評価できない作品（評価の画面と同じ並び） */}
              <div className="answers__ratings answers__ratings--five">
                <button type="button" className="rating rating--none" onClick={() => answer({ kind: 'watched' })} title={t('見たけれど内容を覚えていない作品を、評価を付けずに「見た」にします', 'Mark an anime you watched but don’t remember as Watched, without a rating')}>
                  <RatingIcon rating="NONE" />
                  <ActLabel>{t('覚えてない', 'Don’t remember')}</ActLabel>
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
                  <ActLabel>{t('戻る', 'Back')}</ActLabel>
                </button>
              </div>
            </>
          ) : (
            <div className="answers__main answers__main--three">
              <button type="button" className="main main--wanna" disabled={!m.current || !showDeck} onClick={() => answer({ kind: 'wanna' })}>
                <Bookmark />
                <ActLabel>{t('見たい', 'Want to watch')}</ActLabel> <kbd className="hint">{keyLabel(keys.wanna)}</kbd>
              </button>
              <button
                type="button"
                className="main main--pass"
                disabled={!m.current || !showDeck}
                onClick={() => answer({ kind: 'pass' })}
                title={t('興味の無い作品を、3ヶ月のあいだ候補に出さなくします', 'Hide an anime you’re not interested in from suggestions for 3 months')}
              >
                <PassIcon />
                <ActLabel>{t('興味なし', 'Not interested')}</ActLabel> <kbd className="hint">{keyLabel(keys.pass)}</kbd>
              </button>
              <button
                type="button"
                className="main main--skip"
                disabled={!m.current || !showDeck}
                onClick={() => answer({ kind: 'skip' })}
                title={t('今は決めずに、1週間後にまた候補に出します', 'Decide later; it comes back as a suggestion in 1 week')}
              >
                <LaterIcon />
                <ActLabel>{t('保留', 'Later')}</ActLabel> <kbd className="hint">{keyLabel(keys.later)}</kbd>
              </button>
            </div>
          )}
        </div>
        </FlowStage>
      </section>

      {/* .rate の直下の要素は position を上書きされるので、シートは外に出す */}
      {filterOpen && (
        <Sheet label={t('候補の条件', 'Suggestion filters')} active={props.active} onClose={() => setFilterOpen(false)}>
          <section className="detail__section">
            <MatchFilterControls filter={m.filter} onChange={m.setFilter} />
            <p className="detail__hint">
              {t(
                '条件を変えても、いまの候補はそのままです。「提案し直す」で新しい条件の候補になります。',
                'Changing the filters doesn’t affect the current suggestions. Press “Refresh” to get suggestions with the new filters.',
              )}
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setFilterOpen(false)
                void run()
              }}
            >
              {t('この条件で提案し直す', 'Refresh with these filters')}
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
    media.seasonYear ? t(`${media.seasonYear}年`, `${media.seasonYear}`) : null,
    media.format ? formatName(media.format) : null,
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
      return { label: t('見たい', 'Want to watch'), icon: <Bookmark />, strong: true }
    case 'pass':
      return { label: t('興味なし', 'Not interested'), icon: <PassIcon /> }
    case 'skip':
      return { label: t('保留', 'Later'), icon: <LaterIcon /> }
    case 'rate': {
      const r = RATINGS.find((x) => x.rating === a.rating)
      return { label: r?.label ?? t('評価', 'Rate'), icon: <RatingIcon rating={a.rating} /> }
    }
    case 'watched':
      return { label: t('覚えてない', 'Don’t remember'), icon: <RatingIcon rating="NONE" /> }
    case 'watching':
      return { label: t('見てる', 'Watching'), icon: <PlayIcon /> }
    case 'stop':
      return { label: t('視聴中断', 'Dropped'), icon: <PauseIcon /> }
  }
}
