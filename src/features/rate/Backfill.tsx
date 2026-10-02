import { useEffect, useMemo, useState } from 'react'
import { Bookmark } from '../../components/Bookmark'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { CheckIcon, InfoIcon, PauseIcon, StopIcon, UndoIcon } from '../../components/Icons'
import { SaveStatus } from '../../components/SaveStatus'
import { SeasonPicker } from '../../components/SeasonPicker'
import { keyLabel, useKeymap } from '../../lib/keymap'
import type { GithubConnection } from '../../lib/github'
import { useShortcuts } from '../../lib/useShortcuts'
import { previousSeason, sameSeason, seasonLabel, seasonOf } from '../../lib/season'
import type { Cover } from '../../lib/storage'
import { WorkDetail, type WorkSeed } from '../browse/WorkDetail'
import { formatDate } from '../records/recordList'
import { OLDEST_SEASON, OLDEST_YEAR, RATINGS } from './queue'
import { useBackfill } from './useBackfill'
import { useWatching } from './useWatching'

type Mode = 'back' | 'watching'

// いま画面に出している1枚
interface Shown {
  key: string
  title: string
  cover: Cover | null
  seed: WorkSeed
  meta: string | null
}

// 評価の画面。「さかのぼり」（過去作の初期登録）と「見てる」（見ている作品を、見終わったら評価する）の2つのモード。
// 2つとも開いたままにして、切り替えても位置と取り消しを残す
export function Backfill({ token, github, active }: { token: string; github: GithubConnection | null; active: boolean }) {
  const b = useBackfill(token, github)
  const w = useWatching(token)
  const [mode, setMode] = useState<Mode>('back')
  const back = mode === 'back'

  // 見てる作品は別の画面でも増減する。タブを開き直したときと、モードを切り替えたときに、手を付けていなければ読み直す
  const { refreshIfIdle } = w
  useEffect(() => {
    if (active) refreshIfIdle()
  }, [active, mode, refreshIfIdle])

  const bCurrent = b.current
  const wCurrent = w.current
  const shown = useMemo<Shown | null>(() => {
    if (back) {
      const c = bCurrent
      return c && { key: c.work.id, title: c.work.title, cover: c.cover, seed: c.work, meta: null }
    }
    if (!wCurrent) return null
    const { entry, cover } = wCurrent
    const since = formatDate(entry.stateAt)
    return {
      key: entry.workId,
      title: entry.title,
      cover,
      seed: { id: entry.workId, annictId: entry.annictId, title: entry.title, malAnimeId: entry.malAnimeId, viewerStatusState: entry.state },
      meta: since ? `${since}から見てる` : null,
    }
  }, [back, bCurrent, wCurrent])

  // 詳細のシートを開いている作品。カードが変わったら閉じる
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const sheetOpen = shown !== null && sheetFor === shown.key
  const toggleSheet = () => {
    if (shown) setSheetFor(sheetOpen ? null : shown.key)
  }

  // 「見てる」は、いまのクールと前のクールの作品にだけ出す（放送中か、終わったばかりの作品）
  const thisSeason = seasonOf(new Date())
  const canWatching = sameSeason(b.season, thisSeason) || sameSeason(b.season, previousSeason(thisSeason))

  // PC ではキーボードで答えられる。割り当ては設定画面で変えられる。
  // シートを開いているあいだは、詳細のキー以外は効かせない（あらすじを読みながら押した数字で、下のカードに評価が付かないように）
  const keys = useKeymap()
  const ratingKeys = back
    ? {
        rateBad: () => b.answer({ kind: 'rate', rating: 'BAD' }),
        rateAverage: () => b.answer({ kind: 'rate', rating: 'AVERAGE' }),
        rateGood: () => b.answer({ kind: 'rate', rating: 'GOOD' }),
        rateGreat: () => b.answer({ kind: 'rate', rating: 'GREAT' }),
      }
    : {
        rateBad: () => w.answer({ kind: 'rate', rating: 'BAD' }),
        rateAverage: () => w.answer({ kind: 'rate', rating: 'AVERAGE' }),
        rateGood: () => w.answer({ kind: 'rate', rating: 'GOOD' }),
        rateGreat: () => w.answer({ kind: 'rate', rating: 'GREAT' }),
      }
  const answers = back
    ? {
        ...ratingKeys,
        skip: () => b.answer({ kind: 'skip' }),
        wanna: () => b.answer({ kind: 'wanna' }),
        watched: () => b.answer({ kind: 'watched' }),
        ...(canWatching ? { watching: () => b.answer({ kind: 'watching' }) } : {}),
        undo: b.undo,
      }
    : {
        ...ratingKeys,
        watched: () => w.answer({ kind: 'watched' }),
        watching: () => w.answer({ kind: 'still' }),
        undo: w.undo,
      }
  useShortcuts(sheetOpen ? { detail: toggleSheet } : { ...answers, detail: toggleSheet }, active)

  const hasCurrent = shown !== null
  const canUndo = back ? b.canUndo : w.canUndo
  const undo = back ? b.undo : w.undo
  const answerRating = (rating: (typeof RATINGS)[number]['rating']) => (back ? b.answer({ kind: 'rate', rating }) : w.answer({ kind: 'rate', rating }))

  return (
    <>
      <section className="rate">
        {shown?.cover && <div className="rate__backdrop" style={{ backgroundImage: `url(${shown.cover.thumb})` }} aria-hidden />}

        <div className="rate__top">
          <div className="toggle toggle--full" role="group" aria-label="評価の種類">
            <button type="button" aria-pressed={back} onClick={() => setMode('back')}>
              さかのぼり
            </button>
            <button type="button" aria-pressed={!back} onClick={() => setMode('watching')}>
              見てる{w.cards ? `（${w.cards.length}）` : ''}
            </button>
          </div>

          {back ? (
            <header className="rate__head rate__head--stepper">
              <SeasonPicker value={b.season} min={OLDEST_SEASON} max={thisSeason} onChange={b.jumpTo} onPrevious={b.goToPrevious} onNext={b.goToNext} />
              {b.cards && !b.seasonDone && (
                <span className="count">
                  {b.index + 1}
                  <span className="count__of">/{b.cards.length}</span>
                </span>
              )}
            </header>
          ) : (
            <header className="rate__head rate__head--stepper">
              <h1 className="season">見てる作品</h1>
              {w.cards && !w.done && w.cards.length > 0 && (
                <span className="count">
                  {w.index + 1}
                  <span className="count__of">/{w.cards.length}</span>
                </span>
              )}
            </header>
          )}
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
          {back && b.syncNote && <p className="note">{b.syncNote}</p>}
        </div>

        <div className="rate__stage">
          {back ? (
            b.finished ? (
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
              <WorkCard key={shown.key} shown={shown} onOpen={toggleSheet} />
            )
          ) : w.loadError ? (
            <Empty title="見てる作品を読み込めませんでした" body={w.loadError}>
              <button type="button" className="btn" onClick={w.reload}>
                もう一度読み込む
              </button>
            </Empty>
          ) : !w.cards ? (
            <div className="card card--loading" aria-busy>
              <div className="card__cover" />
            </div>
          ) : w.cards.length === 0 ? (
            <Empty title="見てる作品はありません" body="「見てる」にした作品が、ここに並びます。" />
          ) : w.done || !shown ? (
            <Empty title="見てる作品はここまで" body="「まだ見てる」にした作品は、読み直すとまた出てきます。">
              <button type="button" className="btn" onClick={w.reload}>
                読み直す
              </button>
            </Empty>
          ) : (
            <WorkCard key={shown.key} shown={shown} onOpen={toggleSheet} />
          )}
          {/* 次の表紙を先に読み込んでおき、切り替えを待たせない */}
          {(back ? b.next?.cover : w.next?.cover) && <link rel="preload" as="image" href={(back ? b.next?.cover : w.next?.cover)!.url} />}
        </div>

        <div className="answers" aria-disabled={!hasCurrent}>
          <div className="answers__ratings">
            {RATINGS.map((r) => (
              <button
                key={r.rating}
                type="button"
                className={`rating rating--${r.rating.toLowerCase()}`}
                disabled={!hasCurrent}
                onClick={() => answerRating(r.rating)}
              >
                <span className="rating__label">{r.label}</span>
                <kbd className="hint">{keyLabel(keys[r.action])}</kbd>
              </button>
            ))}
          </div>
          {back ? (
            <div className={canWatching ? 'answers__unseen answers__unseen--three' : 'answers__unseen'}>
              <button type="button" className="unseen" disabled={!hasCurrent} onClick={() => b.answer({ kind: 'skip' })}>
                見てない <kbd className="hint">{keyLabel(keys.skip)}</kbd>
              </button>
              {canWatching && (
                <button type="button" className="unseen" disabled={!hasCurrent} onClick={() => b.answer({ kind: 'watching' })}>
                  見てる <kbd className="hint">{keyLabel(keys.watching)}</kbd>
                </button>
              )}
              <button type="button" className="unseen unseen--wanna" disabled={!hasCurrent} onClick={() => b.answer({ kind: 'wanna' })}>
                <Bookmark />
                見たい <kbd className="hint">{keyLabel(keys.wanna)}</kbd>
              </button>
            </div>
          ) : (
            <div className="answers__unseen">
              <button type="button" className="unseen" disabled={!hasCurrent} onClick={() => w.answer({ kind: 'still' })}>
                まだ見てる <kbd className="hint">{keyLabel(keys.watching)}</kbd>
              </button>
              {/* スマホの2列でも1行に収まるよう短くする。評価を付けずに「見た」にするボタン */}
              <button
                type="button"
                className="unseen"
                disabled={!hasCurrent}
                onClick={() => w.answer({ kind: 'watched' })}
                title="評価を付けずに「見た」にします"
              >
                見終わった <kbd className="hint">{keyLabel(keys.watched)}</kbd>
              </button>
            </div>
          )}
          <div className="answers__misc">
            {back ? (
              <button type="button" className="misc" disabled={!hasCurrent} onClick={() => b.answer({ kind: 'watched' })}>
                <CheckIcon />
                見たけど覚えていない <kbd className="hint">{keyLabel(keys.watched)}</kbd>
              </button>
            ) : (
              <>
                <button type="button" className="misc" disabled={!hasCurrent} onClick={() => w.answer({ kind: 'hold' })}>
                  <PauseIcon />
                  一時中断
                </button>
                <button type="button" className="misc" disabled={!hasCurrent} onClick={() => w.answer({ kind: 'stop' })}>
                  <StopIcon />
                  視聴中止
                </button>
              </>
            )}
            <button type="button" className="misc" disabled={!hasCurrent} onClick={toggleSheet}>
              <InfoIcon />
              詳しく <kbd className="hint">{keyLabel(keys.detail)}</kbd>
            </button>
            <button type="button" className="misc" disabled={!canUndo} onClick={undo}>
              <UndoIcon />
              取り消す <kbd className="hint">{keyLabel(keys.undo)}</kbd>
            </button>
          </div>
        </div>
      </section>

      {/* .rate の直下の要素は position を上書きされるので、シートは外に出す */}
      {sheetOpen && shown && <WorkDetail readOnly token={token} work={shown.seed} cover={shown.cover} active={active} onClose={() => setSheetFor(null)} />}
    </>
  )
}

function WorkCard({ shown, onOpen }: { shown: Shown; onOpen: () => void }) {
  return (
    <article className="card">
      <button type="button" className="card__cover" onClick={onOpen} aria-label="詳しく見る">
        {shown.cover ? <CoverImage cover={shown.cover} size="large" fallback={<span className="card__noimage">{shown.title}</span>} /> : <span className="card__noimage">{shown.title}</span>}
        <span className="card__info" aria-hidden>
          <InfoIcon />
        </span>
      </button>
      <div className="card__text">
        <h2 className="card__title">{shown.title}</h2>
        {shown.meta && <p className="card__meta">{shown.meta}</p>}
      </div>
    </article>
  )
}
