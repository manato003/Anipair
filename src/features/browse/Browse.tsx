import { useMemo, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { HelpButton } from '../../components/Help'
import { FilterIcon } from '../../components/Icons'
import { SaveStatus } from '../../components/SaveStatus'
import { SeasonPicker } from '../../components/SeasonPicker'
import type { BrowseWork } from '../../lib/annict'
import { RATING_LABEL } from '../../lib/reviewOps'
import { nextSeason, sameSeason, seasonLabel, seasonOf } from '../../lib/season'
import { useWriteQueue } from '../../lib/useWriteQueue'

import { genreName } from '../match/taste'
import { OLDEST_SEASON } from '../rate/queue'
import { activeUnseenIds } from '../rate/unseen'
import { loadLocalUnseen } from '../rate/unseenStore'
import { MEDIA_KINDS } from '../records/recordList'
import { useMediaInfo } from '../records/useMediaInfo'
import { BrowseFilterSheet } from './BrowseFilterSheet'
import { EMPTY_BROWSE_FILTER, MINE_CHOICES, NO_PERIOD, applyBrowseFilter, browseFilterCount, periodActive, periodLabel, type BrowseFilter, type BrowsePeriod } from './browseFilter'
import { SORTS } from './browseSort'
import { STATUS_LABEL, workMeta } from './detail'
import { CAPPED_NOTE, useBrowse } from './useBrowse'
import { WorkDetail } from './WorkDetail'
import { Loading, Spinner } from '../../components/Loading'

export function Browse({ token, active = true }: { token: string; active?: boolean }) {
  const b = useBrowse(token, active)
  const q = useWriteQueue()
  const [open, setOpen] = useState<BrowseWork | null>(null)
  // 来期の作品までは見られる
  const latest = nextSeason(seasonOf(new Date()))
  const coverOf = (w: BrowseWork) => b.covers.get(w.annictId) ?? null
  // 絞り込み。期間（放送年と季節）は useBrowse が読む作品を決め、ほかは読み込んだ作品の中で絞る。
  // ジャンル・制作会社は、シートを開いたときかその条件をかけているときだけ Shikimori から読む
  const [filter, setFilter] = useState<BrowseFilter>(EMPTY_BROWSE_FILTER)
  const [filterOpen, setFilterOpen] = useState(false)
  const media = useMediaInfo(b.works, filterOpen || filter.genres.length > 0 || filter.studios.length > 0)
  const filterCount = browseFilterCount(filter, b.period)
  const hasPeriod = periodActive(b.period)
  // 評価の画面で「見てない」にした作品。この画面を開くたびに端末の控えを読み直す（評価の画面で押した分を映す）
  const unseen = useMemo(() => (active ? activeUnseenIds(loadLocalUnseen()) : new Set<number>()), [active])
  const works = useMemo(() => (b.works ? applyBrowseFilter(b.works, filter, media.info, unseen) : null), [b.works, filter, media.info, unseen])
  const clearAll = () => {
    setFilter(EMPTY_BROWSE_FILTER)
    b.setPeriod(NO_PERIOD)
  }

  return (
    <section className="records">
      <header className="records__head">
        <h1 className="season">ブラウズ</h1>
        <HelpButton topic="browse" active={active} />
      </header>

      <div className="records__controls">
        <div className="records__tools">
          <input
            className="search"
            type="search"
            placeholder="タイトルで探す"
            value={b.query}
            onChange={(e) => b.setQuery(e.target.value)}
            aria-label="タイトルで探す"
          />
          <button type="button" className="btn records__filterbtn" aria-pressed={filterCount > 0} onClick={() => setFilterOpen(true)}>
            <FilterIcon />
            絞り込み
            {filterCount > 0 && <span className="chip__count">{filterCount}</span>}
          </button>
        </div>
        {/* 期間で絞っているときは、クールの代わりに期間を出す（クール選びに戻れる） */}
        {!b.searching && hasPeriod && (
          <div className="browse__period">
            <span>
              <strong>{periodLabel(b.period)}</strong>の作品
            </span>
            <button type="button" className="link" onClick={() => b.setPeriod(NO_PERIOD)}>
              1つのクールで選ぶ
            </button>
          </div>
        )}
        {!b.searching && !hasPeriod && (
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
          {SORTS.filter((o) => o.modes.includes(b.mode)).map((o) => (
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
        {b.capped && b.works && <p className="note">{CAPPED_NOTE}</p>}
        {/* 期間は、クール一覧ではクールの代わりの行に出ているので、条件の並びには検索のときだけ出す */}
        {filterCount - (hasPeriod && !b.searching ? 1 : 0) > 0 && (
          <BrowseActiveFilters
            filter={filter}
            period={b.searching ? b.period : NO_PERIOD}
            onChange={setFilter}
            onPeriodChange={b.setPeriod}
            onClearAll={hasPeriod && !b.searching ? () => setFilter(EMPTY_BROWSE_FILTER) : clearAll}
          />
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
          <Loading block label={b.progress ?? (b.searching ? '検索中' : `${hasPeriod ? periodLabel(b.period) : seasonLabel(b.season)}の作品を読み込み中`)} />
        ) : b.works.length === 0 ? (
          <Empty
            title="見つかりませんでした"
            body={
              hasPeriod
                ? b.searching
                  ? '別の言葉で探すか、放送年と季節の条件をゆるめてください。'
                  : 'この期間の作品は Annict にありません。放送年と季節の条件をゆるめてください。'
                : b.searching
                  ? '別の言葉で探してください。一部だけでも探せます。'
                  : 'このクールの作品は Annict にまだありません。'
            }
          />
        ) : works && works.length === 0 ? (
          <Empty title="当てはまる作品がありません" body={b.hasMore ? '絞り込みの条件をゆるめるか、「もっと見る」で作品を増やしてください。' : '絞り込みの条件をゆるめてください。'}>
            <button type="button" className="btn" onClick={() => setFilter(EMPTY_BROWSE_FILTER)}>
              絞り込みを解除する
            </button>
            {b.hasMore && (
              <button type="button" className="btn" onClick={b.loadMore} disabled={b.loadingMore}>
                {b.loadingMore ? (
                  <>
                    <Spinner />
                    読み込み中
                  </>
                ) : (
                  'もっと見る'
                )}
              </button>
            )}
          </Empty>
        ) : (
          <>
            <ul className="rows">
              {(works ?? []).map((w) => {
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
                      ) : unseen.has(w.annictId) ? (
                        <span className="badge badge--unseen">見てない</span>
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
                  {b.loadingMore ? (
                  <>
                    <Spinner />
                    読み込み中
                  </>
                ) : (
                  'もっと見る'
                )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {filterOpen && (
        <BrowseFilterSheet
          works={b.works}
          searching={b.searching}
          filter={filter}
          period={b.period}
          info={media.info}
          unseen={unseen}
          infoError={media.error}
          resultCount={works?.length ?? 0}
          hasMore={b.hasMore}
          active={active}
          onChange={setFilter}
          onPeriodChange={b.setPeriod}
          onClose={() => setFilterOpen(false)}
        />
      )}

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

// かけている絞り込みの条件。1つずつ外せる（記録の絞り込みと同じ見た目）
function BrowseActiveFilters(props: {
  filter: BrowseFilter
  period: BrowsePeriod
  onChange: (next: BrowseFilter) => void
  onPeriodChange: (next: BrowsePeriod) => void
  onClearAll: () => void
}) {
  const { filter: f, onChange } = props
  const items: { label: string; clear: () => void }[] = []
  if (periodActive(props.period))
    items.push({ label: `期間: ${periodLabel(props.period)}`, clear: () => props.onPeriodChange(NO_PERIOD) })
  if (f.mine.length > 0)
    items.push({ label: `自分の記録: ${MINE_CHOICES.filter((x) => f.mine.includes(x.id)).map((x) => x.label).join('・')}`, clear: () => onChange({ ...f, mine: [] }) })
  if (f.media.length > 0)
    items.push({ label: `形式: ${MEDIA_KINDS.filter((x) => f.media.includes(x.id)).map((x) => x.label).join('・')}`, clear: () => onChange({ ...f, media: [] }) })
  if (f.genres.length > 0) items.push({ label: `ジャンル: ${f.genres.map(genreName).join('・')}`, clear: () => onChange({ ...f, genres: [] }) })
  if (f.studios.length > 0) items.push({ label: `制作会社: ${f.studios.join('・')}`, clear: () => onChange({ ...f, studios: [] }) })
  return (
    <div className="activefilters">
      {items.map((it) => (
        <button key={it.label} type="button" className="activefilter" onClick={it.clear} aria-label={`${it.label} の条件を外す`}>
          {it.label}
          <span aria-hidden>×</span>
        </button>
      ))}
      <button type="button" className="link" onClick={props.onClearAll}>
        すべて解除
      </button>
    </div>
  )
}
