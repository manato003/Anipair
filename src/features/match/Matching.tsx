import { useState } from 'react'
import { Bookmark } from '../../components/Bookmark'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { BackIcon, CheckIcon, EyeIcon, InfoIcon, UndoIcon } from '../../components/Icons'
import { SaveStatus } from '../../components/SaveStatus'
import { Sheet } from '../../components/Sheet'
import { keyLabel, rangeLabel, useKeymap } from '../../lib/keymap'
import type { GithubConnection } from '../../lib/github'
import { useShortcuts } from '../../lib/useShortcuts'
import { RATINGS } from '../rate/queue'
import { MatchDetail } from './MatchDetail'
import { MatchFilterControls } from './MatchFilterControls'
import { ENOUGH_LIKED } from './tasteLoader'
import { titleOf, useMatching, type MatchCard } from './useMatching'

const FORMAT_JA: Record<string, string> = {
  TV: 'TV',
  MOVIE: '劇場版',
  ONA: '配信',
  OVA: 'OVA',
}

export function Matching(props: { annictToken: string; github: GithubConnection | null; active: boolean }) {
  const m = useMatching(props.annictToken, props.github)
  // 「見たことがある」を押すと、パス・見たいの段が評価の段に入れ替わる（見てる・見たけど覚えていないもそこに出す）。カードが変わったら閉じる
  const [seenFor, setSeenFor] = useState<number | null>(null)
  const seenOpen = m.current !== null && seenFor === m.current.media.idMal

  // 詳細のシートを開いている候補。候補が変わったら閉じる
  const [sheetFor, setSheetFor] = useState<number | null>(null)
  const sheetOpen = m.current !== null && sheetFor === m.current.media.idMal
  const toggleSheet = () => {
    if (m.current) setSheetFor(sheetOpen ? null : m.current.media.idMal)
  }

  // 絞り込みのシート。開いているあいだは、下のカードにキーが効かないようにする
  const [filterOpen, setFilterOpen] = useState(false)

  // PC ではキーボードで答えられる。評価のキーは「見たことがある」を開かなくても効く。割り当ては設定画面で変えられる。
  // シートを開いているあいだは、詳細のキー以外は効かせない（あらすじを読みながら押した数字で、下のカードに評価が付かないように）
  const keys = useKeymap()
  const answers = {
    rateBad: () => m.answer({ kind: 'rate', rating: 'BAD' }),
    rateAverage: () => m.answer({ kind: 'rate', rating: 'AVERAGE' }),
    rateGood: () => m.answer({ kind: 'rate', rating: 'GOOD' }),
    rateGreat: () => m.answer({ kind: 'rate', rating: 'GREAT' }),
    wanna: () => m.answer({ kind: 'wanna' }),
    pass: () => m.answer({ kind: 'pass' }),
    later: () => m.answer({ kind: 'skip' }),
    watched: () => m.answer({ kind: 'watched' }),
    watching: () => m.answer({ kind: 'watching' }),
    undo: m.undo,
  }
  useShortcuts(sheetOpen ? { detail: toggleSheet } : { ...answers, detail: toggleSheet }, props.active && !filterOpen)

  const showDeck = m.phase.kind === 'ready'

  return (
    <>
      <section className="rate">
        {m.current?.media.cover && (
          <div className="rate__backdrop" style={{ backgroundImage: `url(${m.current.media.cover.thumb})` }} aria-hidden />
        )}

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
              <button type="button" className="link" onClick={() => setFilterOpen(true)}>
                条件
              </button>
            )}
            {showDeck && (
              <button type="button" className="link" onClick={m.run}>
                提案し直す
              </button>
            )}
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

        <div className="rate__stage">
          {m.phase.kind === 'idle' ? (
            <Empty
              title="次に見る作品を探す"
              body="Annict の記録から好みを調べて、まだ記録していない作品を提案します。「見たい」を押すと Annict の見たいリストに入ります。"
            >
              <MatchFilterControls filter={m.filter} onChange={m.setFilter} />
              <button type="button" className="btn btn--primary" onClick={m.run}>
                提案してもらう
              </button>
              {!props.github && <p className="note">パス・スルーした作品はこの端末だけに記録します。設定で GitHub とつなぐと PC とスマホで共有できます。</p>}
            </Empty>
          ) : m.phase.kind === 'loading' ? (
            <div className="card card--loading" aria-busy>
              <div className="card__cover" />
              <p className="card__step">{m.phase.step}</p>
            </div>
          ) : m.phase.kind === 'error' ? (
            <Empty title="提案を作れませんでした" body={m.phase.message}>
              <button type="button" className="btn" onClick={m.run}>
                もう一度試す
              </button>
            </Empty>
          ) : m.phase.kind === 'empty' ? (
            <Empty title="まだ提案できません" body={m.phase.message}>
              <button type="button" className="btn" onClick={m.run}>
                もう一度試す
              </button>
            </Empty>
          ) : m.done || !m.current ? (
            <Empty title="候補はここまで" body="「見たい」にした作品は Annict の見たいリストに入っています。スルーした作品は1週間後に、パスした作品は3ヶ月後に、また候補に出てきます。">
              <button type="button" className="btn btn--primary" onClick={m.run}>
                もう一度提案してもらう
              </button>
            </Empty>
          ) : (
            <MatchCardView key={m.current.media.idMal} card={m.current} onOpen={toggleSheet} />
          )}
          {m.next?.media.cover && <link rel="preload" as="image" href={m.next.media.cover.url} />}
        </div>

        <div className="answers" aria-disabled={!m.current}>
          {seenOpen ? (
            <div className="answers__ratings">
              {RATINGS.map((r) => (
                <button
                  key={r.rating}
                  type="button"
                  className={`rating rating--${r.rating.toLowerCase()}`}
                  onClick={() => m.answer({ kind: 'rate', rating: r.rating })}
                >
                  <span className="rating__label">{r.label}</span>
                  <kbd className="hint">{keyLabel(keys[r.action])}</kbd>
                </button>
              ))}
            </div>
          ) : (
            <div className="answers__unseen answers__unseen--tall answers__unseen--three">
              <button type="button" className="unseen" disabled={!m.current || !showDeck} onClick={() => m.answer({ kind: 'pass' })}>
                パス <kbd className="hint">{keyLabel(keys.pass)}</kbd>
              </button>
              <button
                type="button"
                className="unseen unseen--later"
                disabled={!m.current || !showDeck}
                onClick={() => m.answer({ kind: 'skip' })}
                title="今は決めずに、1週間後にまた候補に出します"
              >
                スルー <kbd className="hint">{keyLabel(keys.later)}</kbd>
              </button>
              <button type="button" className="unseen unseen--wanna" disabled={!m.current || !showDeck} onClick={() => m.answer({ kind: 'wanna' })}>
                <Bookmark />
                見たい <kbd className="hint">{keyLabel(keys.wanna)}</kbd>
              </button>
            </div>
          )}
          <div className="answers__misc">
            {seenOpen ? (
              <>
                <button type="button" className="misc" onClick={() => m.answer({ kind: 'watched' })}>
                  <CheckIcon />
                  見たけど覚えていない <kbd className="hint">{keyLabel(keys.watched)}</kbd>
                </button>
                <button type="button" className="misc" onClick={() => m.answer({ kind: 'watching' })} title="Annict で「見てる」にします">
                  <EyeIcon />
                  見てる <kbd className="hint">{keyLabel(keys.watching)}</kbd>
                </button>
                <button type="button" className="misc" onClick={() => setSeenFor(null)}>
                  <BackIcon />
                  戻る
                </button>
              </>
            ) : (
              <>
                <button type="button" className="misc" disabled={!m.current || !showDeck} onClick={() => setSeenFor(m.current?.media.idMal ?? null)}>
                  <EyeIcon />
                  見たことがある <kbd className="hint">{rangeLabel(RATINGS.map((r) => keys[r.action]))}</kbd>
                </button>
                <button type="button" className="misc" disabled={!m.current || !showDeck} onClick={toggleSheet}>
                  <InfoIcon />
                  詳しく <kbd className="hint">{keyLabel(keys.detail)}</kbd>
                </button>
                <button type="button" className="misc" disabled={!m.canUndo} onClick={m.undo}>
                  <UndoIcon />
                  取り消す <kbd className="hint">{keyLabel(keys.undo)}</kbd>
                </button>
              </>
            )}
          </div>
        </div>
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
                void m.run()
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
          onClose={() => setSheetFor(null)}
        />
      )}
    </>
  )
}

function MatchCardView({ card, onOpen }: { card: MatchCard; onOpen: () => void }) {
  const { media, reasons } = card
  const title = titleOf(media)
  const meta = [media.seasonYear ? `${media.seasonYear}年` : null, media.format ? FORMAT_JA[media.format] ?? media.format : null]
    .filter(Boolean)
    .join(' ')
  return (
    <article className="card">
      <button type="button" className="card__cover" onClick={onOpen} aria-label="詳しく見る">
        {media.cover ? <CoverImage cover={media.cover} size="large" fallback={<span className="card__noimage">{title}</span>} /> : <span className="card__noimage">{title}</span>}
        <span className="card__info" aria-hidden>
          <InfoIcon />
        </span>
      </button>
      <div className="card__text">
        <h2 className="card__title">{title}</h2>
        {meta && <p className="card__meta">{meta}</p>}
        {reasons.length > 0 && (
          <ul className="reasons">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
