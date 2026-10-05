import { useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { HelpButton } from '../../components/Help'
import { SaveStatus } from '../../components/SaveStatus'
import { SeasonPicker } from '../../components/SeasonPicker'
import type { BrowseWork } from '../../lib/annict'
import { RATING_LABEL } from '../../lib/reviewOps'
import { nextSeason, sameSeason, seasonLabel, seasonOf } from '../../lib/season'
import { useWriteQueue } from '../../lib/useWriteQueue'

import { OLDEST_SEASON } from '../rate/queue'
import { SORTS } from './browseSort'
import { STATUS_LABEL, workMeta } from './detail'
import { useBrowse } from './useBrowse'
import { WorkDetail } from './WorkDetail'

export function Browse({ token, active = true }: { token: string; active?: boolean }) {
  const b = useBrowse(token, active)
  const q = useWriteQueue()
  const [open, setOpen] = useState<BrowseWork | null>(null)
  // 来期の作品までは見られる
  const latest = nextSeason(seasonOf(new Date()))
  const coverOf = (w: BrowseWork) => b.covers.get(w.annictId) ?? null

  return (
    <section className="records">
      <header className="records__head">
        <h1 className="season">ブラウズ</h1>
        <HelpButton topic="browse" active={active} />
      </header>

      <div className="records__controls">
        <input
          className="search"
          type="search"
          placeholder="タイトルで探す"
          value={b.query}
          onChange={(e) => b.setQuery(e.target.value)}
          aria-label="タイトルで探す"
        />
        {!b.searching && (
          <>
            <SeasonPicker value={b.season} min={OLDEST_SEASON} max={latest} onChange={b.setSeason} />
            {/* 来期の作品は放送前から Annict にあるので、いまのクールからすぐ移れるようにする */}
            {!sameSeason(b.season, latest) && (
              <div className="browse__jump">
                <button type="button" className="link" title={`${seasonLabel(latest)}へ`} onClick={() => b.setSeason(latest)}>
                  来期
                </button>
              </div>
            )}
          </>
        )}
        <div className="toggle toggle--full" role="group" aria-label="並べ替え">
          {SORTS.filter((o) => (b.searching ? !o.seasonOnly : !o.searchOnly)).map((o) => (
            <button key={o.id} type="button" aria-pressed={b.sort === o.id} onClick={() => b.setSort(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        {/* いまの並べ方が何の順かを、いつも1行で出す（人気順と評価順の違いが分かるように） */}
        {b.sort === 'popular' && <p className="note">Annict でこの作品を記録した人の多い順です。</p>}
        {b.sort === 'newest' && <p className="note">放送の新しい順です。</p>}
        {b.sort === 'score' && <p className="note">評判の高い順です。Annict の満足度、無ければ Shikimori の点数（10点満点）で並べ、点数の無い作品は最後に並びます。</p>}
        {b.sort === 'taste' && b.works && (
          <p className="note">{b.tasteNote ?? 'あなたの評価から、好みに合いそうな順に並べています。情報の無い作品は最後に並びます。'}</p>
        )}
        <SaveStatus pending={q.pending} failed={q.failed} onRetry={q.retryFailed} />
      </div>

      <div className="records__list">
        {b.error ? (
          <Empty title="作品を読み込めませんでした" body={b.error}>
            <button type="button" className="btn" onClick={b.retry}>
              もう一度読み込む
            </button>
          </Empty>
        ) : !b.works ? (
          <p className="records__loading">{b.progress ?? (b.searching ? '探しています' : `${seasonLabel(b.season)}の作品を読んでいます`)}</p>
        ) : b.works.length === 0 ? (
          <Empty title="見つかりませんでした" body={b.searching ? '別の言葉で探してください。一部だけでも探せます。' : 'このクールの作品は Annict にまだありません。'} />
        ) : (
          <>
            <ul className="rows">
              {b.works.map((w) => {
                const rating = b.ratings.get(w.annictId)
                const state = w.viewerStatusState && w.viewerStatusState !== 'NO_STATE' ? w.viewerStatusState : null
                const cover = coverOf(w)
                const score = b.scores.get(w.annictId)
                const reason = b.sort === 'taste' ? b.reasons.get(w.annictId) : undefined
                return (
                  <li key={w.id} className="row row--button">
                    <button type="button" className="row__hit" onClick={() => setOpen(w)} aria-label={`${w.title}の詳細`}>
                      <span className="row__thumb">{cover && <CoverImage cover={cover} size="thumb" lazy />}</span>
                      <span className="row__body">
                        <span className="row__title">{w.title}</span>
                        <span className="row__date">
                          {workMeta(w)}
                          {score && <span className="row__score">{score.label}</span>}
                        </span>
                        {reason && <span className="row__reason">{reason}</span>}
                      </span>
                      {rating ? (
                        <span className={`badge badge--${rating.toLowerCase()}`}>{RATING_LABEL[rating]}</span>
                      ) : state ? (
                        <span className="badge badge--state">{STATUS_LABEL[state]}</span>
                      ) : (
                        <span />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            {b.hasMore && (
              <div className="more">
                <button type="button" className="btn" onClick={b.loadMore} disabled={b.loadingMore}>
                  {b.loadingMore ? '読んでいます' : 'もっと見る'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {open && (
        <WorkDetail
          key={open.id}
          token={token}
          work={open}
          cover={coverOf(open)}
          active={active}
          enqueue={q.enqueue}
          onChange={(patch) => b.patchWork(open.annictId, patch)}
          onRelatedChange={(work, patch) => b.patchWork(work.annictId, patch)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
