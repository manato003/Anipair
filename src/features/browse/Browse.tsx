import { useMemo, useRef, useState } from 'react'
import { PinnedLine } from '../../components/PinnedLine'
import { useWide } from '../../lib/useWide'
import { useTuckOnScroll } from '../../lib/useTuckOnScroll'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { HeadActions } from '../../components/ControlCenter'
import { FilterIcon } from '../../components/Icons'
import { SaveStatus } from '../../components/SaveStatus'
import { Autocomplete } from '../../components/Autocomplete'
import { searchWorkTitles, type BrowseWork, type WorkHit } from '../../lib/annict'
import { t } from '../../lib/i18n'
import { workTitle } from '../../lib/names'
import { RATING_LABEL } from '../../lib/reviewOps'
import { seasonLabel, seasonOfWork } from '../../lib/season'
import { studioName } from '../../lib/studios'
import { SortRow } from '../../components/SortRow'
import { CourNav } from '../../components/CourNav'
import { useWriteQueue } from '../../lib/useWriteQueue'

import { genreName } from '../match/taste'
import { activeUnseenIds } from '../rate/unseen'
import { loadLocalUnseen } from '../rate/unseenStore'
import { MEDIA_KINDS } from '../records/recordList'
import { useMediaInfo } from '../records/useMediaInfo'
import { BrowseFilterSheet } from './BrowseFilterSheet'
import { EMPTY_BROWSE_FILTER, MINE_CHOICES, NO_PERIOD, applyBrowseFilter, browseFilterCount, periodActive, periodLabel, type BrowseFilter, type BrowsePeriod } from './browseFilter'
import { SORTS } from './browseSort'
import { STATUS_LABEL, workMeta } from './detail'
import { cappedNote, isLatinQuery, useBrowse } from './useBrowse'
import { MAX_FIND_STUDIOS, narrowOf } from './conditionSearch'
import { WorkDetail } from './WorkDetail'
import { Loading, Spinner } from '../../components/Loading'
import { useViewingSeason } from '../../lib/theme'

export function Browse({ token, active = true }: { token: string; active?: boolean }) {
  // 絞り込み。期間（始めと終わりのクール）は useBrowse が読む作品を決め、ほかは読み込んだ作品の中で絞る。
  // 期間を選んでジャンル・制作会社をかけたときは、期間の全作品からその条件で探し直す（useBrowse・conditionSearch.ts）。
  // ジャンル・制作会社は、シートを開いたときかその条件をかけているときだけ Shikimori から読む
  const [filter, setFilter] = useState<BrowseFilter>(EMPTY_BROWSE_FILTER)
  const [filterOpen, setFilterOpen] = useState(false)
  // 制作会社の名前 → Shikimori の ID（読み込んだ作品の情報から覚えていく。条件検索で使う）
  const [studioIds, setStudioIds] = useState<ReadonlyMap<string, number>>(new Map())
  const b = useBrowse(token, active, narrowOf(filter.genres, filter.studios, studioIds))
  // 検索欄の候補。同じ語は引き直さない（打ち直し・消して戻したとき）
  const hints = useRef(new Map<string, Promise<WorkHit[]>>())
  const searchHints = (q: string) => {
    const hit = hints.current.get(q) ?? searchWorkTitles(token, q)
    hints.current.set(q, hit)
    hit.catch(() => hints.current.delete(q))
    return hit
  }
  const wide = useWide()
  // いま見ているものと並べ替えの帯（スマホで流して見えなくなったら、細い1行で出す）
  const barRef = useRef<HTMLDivElement>(null)
  const tucked = useTuckOnScroll(barRef, active && wide)
  const q = useWriteQueue()
  const [open, setOpen] = useState<BrowseWork | null>(null)
  const coverOf = (w: BrowseWork) => b.covers.get(w.annictId) ?? null
  const media = useMediaInfo(b.pool, filterOpen || filter.genres.length > 0 || filter.studios.length > 0)
  // 知らない制作会社が増えたときだけ覚え直す（描画の中で前と比べて更新する。覚えた名前は上書きしないので、繰り返さない）
  const newStudios = [...(media.info?.values() ?? [])].flatMap((m) => m.studioRefs ?? []).filter((s) => !studioIds.has(s.name))
  if (newStudios.length > 0) setStudioIds(new Map([...studioIds, ...newStudios.map((s): [string, number] => [s.name, s.id])]))
  const filterCount = browseFilterCount(filter, b.period)
  const hasPeriod = periodActive(b.period)
  // 期間を選ばずにジャンル・制作会社で絞っていて、全期間から探している（期間の欄は出さず、チップを外すと元のクールに戻る）
  const allPeriod = b.allPeriod && !b.searching
  // 地の色を、見ているクールの季節に（タイトルで探しているときと、期間で見ているときは、いまの季節）
  useViewingSeason(b.searching || hasPeriod || allPeriod ? null : b.season.name, active)
  // 評価の画面で「見てない」にした作品。この画面を開くたびに端末の控えを読み直す（評価の画面で押した分を映す）
  const unseen = useMemo(() => (active ? activeUnseenIds(loadLocalUnseen()) : new Set<number>()), [active])
  const works = useMemo(() => (b.works ? applyBrowseFilter(b.works, filter, media.info, unseen) : null), [b.works, filter, media.info, unseen])
  // 上に貼りつく1行に出す、いま見ているもの
  const allPeriodLabel = t('全期間', 'All periods')
  const pinnedWhat = b.searching ? t(`「${b.query.trim()}」`, `“${b.query.trim()}”`) : hasPeriod ? periodLabel(b.period) : allPeriod ? allPeriodLabel : seasonLabel(b.season)
  // いま読み込んでいる一覧の名前（期間かクール）
  const listName = hasPeriod ? periodLabel(b.period) : allPeriod ? allPeriodLabel : seasonLabel(b.season)
  const clearAll = () => {
    setFilter(EMPTY_BROWSE_FILTER)
    b.setPeriod(NO_PERIOD)
  }

  // 検索と絞り込み。スマホは帯の上に1行、PC は帯の中（クールと並べ替えと同じ行）
  const tools = (
    <div className="records__tools">
      {/* 打ちながら題名の候補を出し、選ぶと欄をその題名で埋める。英字の語は Annict の検索に当たらないので候補を出さない（一覧は Shikimori で日本語の題名を引いて探す） */}
      <Autocomplete<WorkHit>
        className="autocomplete--search"
        inputClassName="search"
        label={t('タイトルで探す', 'Search by title')}
        placeholder={t('タイトルで探す', 'Search by title')}
        value={b.query}
        onValueChange={b.setQuery}
        accept={(q) => !isLatinQuery(q)}
        search={searchHints}
        item={(w) => {
          const season = seasonOfWork(w)
          return { key: String(w.annictId), label: workTitle(w), sub: season ? seasonLabel(season) : undefined }
        }}
        onPick={(w) => b.setQuery(w.title)}
      />
      <button type="button" className="btn records__filterbtn" aria-pressed={filterCount > 0} onClick={() => setFilterOpen(true)}>
        <FilterIcon />
        {t('絞り込み', 'Filter')}
        {filterCount > 0 && <span className="chip__count">{filterCount}</span>}
      </button>
    </div>
  )

  return (
    <section className="records records--browse">
      <header className="rhead">
        <h1 className="rhead__title">{t('ブラウズ', 'Browse')}</h1>
        <span className="rhead__actions">
          <HeadActions topic="browse" active={active} />
        </span>
      </header>

      {!wide && <div className="records__controls">{tools}</div>}

      {/* いま見ているもの（クールか期間）と並べ替えの帯。PC は上に貼りつき、下へ流すあいだは引っ込んで、上へ流すと戻る。
          貼りつきは親の箱の中でしか効かないので、操作の欄の外（一覧全体の直下）に置く。PC は検索の欄も帯に入れて1つの帯にする */}
      <div className={tucked ? 'browse__bar browse__bar--tucked' : 'browse__bar'} ref={barRef}>
        {/* PC の検索の欄は、いつも CourNav の lead に置く（クールを出しているときは近道と1つのまとまりに、それ以外は欄だけ）。
            探し始めたときに欄の置き場所が変わると、欄が作り直されて打っている途中で入力の位置と候補が消える */}
        {(wide || (!b.searching && !hasPeriod && !allPeriod)) && (
          <CourNav value={b.season} onChange={(s) => s && b.setSeason(s)} lead={wide ? tools : undefined} leadOnly={b.searching || hasPeriod || allPeriod} />
        )}
        {/* 期間で絞っているときは、クールの代わりに期間を出す（クール選びに戻れる） */}
        {!b.searching && hasPeriod && (
          <div className="browse__period">
            <span>
              {t('', 'Anime from ')}
              <strong>{periodLabel(b.period)}</strong>
              {t('の作品', '')}
            </span>
            <button type="button" className="link" onClick={() => b.setPeriod(NO_PERIOD)}>
              {t('1つのクールで選ぶ', 'Pick a single season')}
            </button>
          </div>
        )}
        {allPeriod && (
          <div className="browse__period">
            <span>{t('全期間の作品', 'Anime from all periods')}</span>
          </div>
        )}
        <SortRow options={SORTS.filter((o) => o.modes.includes(b.mode)).map((o) => ({ key: o.id, label: o.label, note: o.note }))} value={b.sort} dir={b.dir} onChoose={b.setSort} />
      </div>

      {/* スマホで帯が上へ流れたら、上の端に細い1行で出す（押すと帯まで戻る） */}
      <PinnedLine
        target={barRef}
        enabled={active && !wide}
        label={`${pinnedWhat} · ${SORTS.find((o) => o.id === b.sort)?.label ?? ''}${b.dir === 'desc' ? '↓' : '↑'}`}
      />

      <div className="records__controls records__controls--notes">
        {/* 並べ方は並べ替えのボタンと矢印で分かるので、文で出すのは点数を読めなかったときなどの知らせだけ */}
        {(b.sort === 'score' || (b.sort === 'taste' && b.works)) && b.sortNote && <p className="note records__sortnote">{b.sortNote}</p>}
        {b.capped && b.works && <p className="note">{cappedNote(b.capLimit)}</p>}
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
          <Empty mood="trouble" title={t('作品を読み込めませんでした', 'Couldn’t load anime')} body={b.error}>
            <button type="button" className="btn" onClick={b.retry}>
              {t('もう一度読み込む', 'Retry')}
            </button>
          </Empty>
        ) : !b.works ? (
          <Loading block label={b.progress ?? (b.searching ? t('検索中', 'Searching') : t(`${listName}の作品を読み込み中`, `Loading anime from ${listName}`))} remaining={b.progressWork} />
        ) : b.works.length === 0 && !b.narrowed ? (
          <Empty
            mood="empty"
            title={t('見つかりませんでした', 'Nothing found')}
            body={
              hasPeriod
                ? b.searching
                  ? t('別の言葉で探すか、期間を広げてください。', 'Try different words, or widen the period.')
                  : t('この期間の作品はAnnictにありません。期間を広げてください。', 'Annict has no anime for this period. Widen the period.')
                : b.searching
                  ? t('別の言葉で探してください。一部だけでも探せます。', 'Try different words. A partial title works too.')
                  : t('このクールの作品はAnnictにまだありません。', 'Annict doesn’t have anime for this season yet.')
            }
          />
        ) : works && works.length === 0 ? (
          <Empty mood="empty" title={t('当てはまる作品がありません', 'No matching anime')}
            body={
              b.hasMore
                ? t('絞り込みの条件をゆるめるか、「もっと見る」で作品を増やしてください。', 'Loosen the filters, or use “Show more” to load more anime.')
                : t('絞り込みの条件をゆるめてください。', 'Try loosening the filters.')
            }
          >
            <button type="button" className="btn" onClick={() => setFilter(EMPTY_BROWSE_FILTER)}>
              {t('絞り込みを解除する', 'Clear filters')}
            </button>
            {b.hasMore && (
              <button type="button" className="btn" onClick={b.loadMore} disabled={b.loadingMore}>
                {b.loadingMore ? (
                  <>
                    <Spinner />
                    {t('読み込み中', 'Loading')}
                  </>
                ) : (
                  t('もっと見る', 'Show more')
                )}
              </button>
            )}
          </Empty>
        ) : (
          <>
            {/* 表紙の棚。自分の記録（評価・状態・見てない）は表紙の隅に、放送時期と点数・おすすめの理由は題名の下に */}
            <ul className="shelf">
              {(works ?? []).map((w) => {
                const title = workTitle(w)
                const rating = b.ratings.get(w.annictId)
                const state = w.viewerStatusState && w.viewerStatusState !== 'NO_STATE' ? w.viewerStatusState : null
                const cover = coverOf(w)
                const score = b.scores.get(w.annictId)
                const reason = b.sort === 'taste' ? b.reasons.get(w.annictId) : undefined
                const mark = rating ? RATING_LABEL[rating] : state ? STATUS_LABEL[state] : unseen.has(w.annictId) ? t('見てない', 'Haven’t seen') : null
                return (
                  <li key={w.id} className="shelf__item">
                    <button type="button" className="shelf__open" onClick={() => setOpen(w)} aria-label={t(`${title}の詳細`, `Details for ${title}`)}>
                      <span className="shelf__cover">
                        {cover ? <CoverImage cover={cover} size="thumb" lazy fallback={<span className="shelf__noimage">{title}</span>} /> : <span className="shelf__noimage">{title}</span>}
                      </span>
                      <span className="shelf__title" aria-hidden>
                        {title}
                      </span>
                    </button>
                    {mark && <span className={rating || state ? 'shelf__badge' : 'shelf__badge shelf__badge--quiet'}>{mark}</span>}
                    <span className="shelf__meta">
                      {workMeta(w)}
                      {score && <span className="shelf__score">{score.label}</span>}
                    </span>
                    {reason && <span className="shelf__reason">{reason}</span>}
                  </li>
                )
              })}
            </ul>
            {b.hasMore && (
              <div className="more">
                {/* 続きを読めなくても、読めている一覧はそのまま（もう一度押せば続きから読む） */}
                {b.moreError && (
                  <p className="note" role="alert">
                    {t(`続きを読み込めませんでした（${b.moreError}）`, `Couldn’t load more (${b.moreError})`)}
                  </p>
                )}
                <button type="button" className="btn" onClick={b.loadMore} disabled={b.loadingMore}>
                  {b.loadingMore ? (
                  <>
                    <Spinner />
                    {t('読み込み中', 'Loading')}
                  </>
                ) : (
                  t('もっと見る', 'Show more')
                )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {filterOpen && (
        <BrowseFilterSheet
          works={b.pool}
          searching={b.searching}
          filter={filter}
          period={b.period}
          info={media.info}
          unseen={unseen}
          infoError={media.error}
          resultCount={works?.length ?? 0}
          active={active}
          studioMax={!b.searching ? MAX_FIND_STUDIOS : undefined}
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
  // 複数の選びは「・」でつなぐ（英語は「, 」）
  const sep = t('・', ', ')
  const mineNames = MINE_CHOICES.filter((x) => f.mine.includes(x.id)).map((x) => x.label).join(sep)
  const mediaNames = MEDIA_KINDS.filter((x) => f.media.includes(x.id)).map((x) => x.label).join(sep)
  const genreNames = f.genres.map(genreName).join(sep)
  const studioNames = f.studios.map(studioName).join(sep)
  if (periodActive(props.period))
    items.push({ label: t(`期間: ${periodLabel(props.period)}`, `Period: ${periodLabel(props.period)}`), clear: () => props.onPeriodChange(NO_PERIOD) })
  if (f.mine.length > 0)
    items.push({ label: t(`自分の記録: ${mineNames}`, `My records: ${mineNames}`), clear: () => onChange({ ...f, mine: [] }) })
  if (f.media.length > 0)
    items.push({ label: t(`形式: ${mediaNames}`, `Format: ${mediaNames}`), clear: () => onChange({ ...f, media: [] }) })
  if (f.genres.length > 0) items.push({ label: t(`ジャンル: ${genreNames}`, `Genre: ${genreNames}`), clear: () => onChange({ ...f, genres: [] }) })
  if (f.studios.length > 0) items.push({ label: t(`制作会社: ${studioNames}`, `Studio: ${studioNames}`), clear: () => onChange({ ...f, studios: [] }) })
  return (
    <div className="activefilters">
      {items.map((it) => (
        <button key={it.label} type="button" className="activefilter" onClick={it.clear} aria-label={t(`${it.label} の条件を外す`, `Remove filter: ${it.label}`)}>
          {it.label}
          <span aria-hidden>×</span>
        </button>
      ))}
      <button type="button" className="link" onClick={props.onClearAll}>
        {t('すべて解除', 'Clear all')}
      </button>
    </div>
  )
}
