import { useMemo, useState } from 'react'
import { useEnglishPeople } from '../../lib/englishNames'
import { personName, workTitle } from '../../lib/names'
import { createPortal } from 'react-dom'
import { CoverImage } from '../../components/CoverImage'
import type { WorkCredits } from '../../lib/annict'
import { RATING_LABEL } from '../../lib/reviewOps'
import type { Media } from '../../lib/shikimori'
import { loadTitlesState } from '../achievements/achievementStore'
import { genreName } from '../match/taste'
import { yearShare, type ShareCard } from '../share/shareCard'
import { ShareSheet } from '../share/ShareSheet'
import { t } from '../../lib/i18n'
import { Columns } from './Charts'
import type { RecordRow } from './recordList'
import { countText, joinList, monthName, reviewYears, yearReview } from './trends'

// 名前と本数（名前（3本） / Name (3 anime)）
const named = (name: string, n: number) => t(`${name}（${n}本）`, `${name} (${n} anime)`)

// 記録の「まとめ ▸ ふり返り」。その年に Annict で「見た」にした作品で数える。画像で共有できる（表紙は入れない）
export function YearReview(props: {
  rows: readonly RecordRow[]
  media: ReadonlyMap<number, Media>
  credits: ReadonlyMap<string, WorkCredits> | null
  active: boolean
  // 見出しの右の置き場（「画像で共有」をそこに出す）
  actions: HTMLElement | null
}) {
  const years = useMemo(() => reviewYears(props.rows), [props.rows])
  const [year, setYear] = useState<number | null>(() => years[0] ?? null)
  const [shareCard, setShareCard] = useState<ShareCard | null>(null)
  const y = useMemo(() => (year === null ? null : yearReview(props.rows, year, props.media, props.credits)), [props.rows, year, props.media, props.credits])

  // 英語の画面では、よく見た声優の英語名を Wikidata から引く
  useEnglishPeople(y?.casts.map((c) => c.name) ?? [])

  const openShare = () => {
    if (!y) return
    const titles = loadTitlesState()
    setShareCard(yearShare(y, titles.equipped && titles.equippedName && titles.equippedRarity ? { name: titles.equippedName, rarity: titles.equippedRarity } : null))
  }

  return (
    <>
      <div className="summary">
        {y &&
          y.watched > 0 &&
          props.actions &&
          createPortal(
            <button type="button" className="btn rhead__edit" onClick={openShare}>
              {t('画像で共有', 'Share as image')}
            </button>,
            props.actions,
          )}
        {years.length > 1 && (
          <div className="filtersheet__chips yearreview__years" role="group" aria-label={t('年', 'Year')}>
            {years.map((yy) => (
              <button key={yy} type="button" className="chip" aria-pressed={yy === year} onClick={() => setYear(yy)}>
                {t(`${yy}年`, String(yy))}
              </button>
            ))}
          </div>
        )}
        {!y ? (
          <p className="trend__note">{t('「見た」にした作品が増えると、年ごとにふり返れます。', 'Mark more anime as watched to look back year by year.')}</p>
        ) : (
          <>
            <section className="trend">
              <div className="kpis kpis--3">
                <div className="kpi">
                  <span className="kpi__value">{y.watched}</span>
                  <span className="kpi__label">{t('見た作品', 'Watched')}</span>
                </div>
                <div className="kpi">
                  <span className="kpi__value">{y.rated}</span>
                  <span className="kpi__label">{t('評価した作品', 'Rated')}</span>
                </div>
                <div className="kpi">
                  <span className="kpi__value">{y.average === null ? '—' : y.average.toFixed(1)}</span>
                  <span className="kpi__label">{t('平均評価', 'Average rating')}</span>
                </div>
              </div>
              <p className="trend__note">{t('Annictで「見た」にした日で数えています（昔の作品をまとめて記録したときは、その日の年に入ります）。', 'Counted by the date you marked each anime as watched on Annict (older anime recorded in bulk count toward the year you recorded them).')}</p>
            </section>

            <section className="trend">
              <h3 className="trend__title">{t('月ごとの本数', 'Anime per month')}</h3>
              {y.busiest && (
                <p className="trend__headline">
                  {t(`いちばん見たのは ${y.busiest.month}月`, `Most watched: ${monthName(y.busiest.month)}`)}
                  <span className="trend__fig">{t(`（${y.busiest.count}本）`, ` (${countText(y.busiest.count)})`)}</span>
                </p>
              )}
              <Columns
                title={t(`${y.year}年の月ごとに見た本数`, `Anime watched per month in ${y.year}`)}
                bars={y.months.map((n, i) => ({ label: monthName(i + 1), value: n, emphasis: y.busiest?.month === i + 1, title: `${monthName(i + 1)} ${countText(n)}` }))}
                every={2}
              />
            </section>

            {y.best.length > 0 && (
              <section className="trend">
                <h3 className="trend__title">{t('いちばん良かった作品', 'Your best anime')}</h3>
                <ul className="contrast">
                  {y.best.map((r) => (
                    <li key={r.entry.annictId} className="contrast__item">
                      <span className="contrast__cover">{r.cover && <CoverImage cover={r.cover} size="thumb" lazy />}</span>
                      <span className="contrast__title">{workTitle(r.entry)}</span>
                      <span className="contrast__scores">
                        {t('あなた ', 'You: ')}<strong>{RATING_LABEL[r.review!.ratingOverallState!]}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(y.genres.length > 0 || y.casts.length > 0) && (
              <section className="trend">
                {y.genres.length > 0 && (
                  <>
                    <h3 className="trend__title">{t('よく見たジャンル', 'Most-watched genres')}</h3>
                    <p className="trend__headline">{joinList(y.genres.map((g) => named(genreName(g.name), g.count)))}</p>
                  </>
                )}
                {y.casts.length > 0 && (
                  <>
                    <h3 className="trend__title">{t('よく見た声優', 'Most-watched voice actors')}</h3>
                    <p className="trend__headline">{y.casts.map((c) => named(personName({ name: c.name }), c.count)).join(' / ')}</p>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {shareCard && y && <ShareSheet card={shareCard} filename={`anipair-${y.year}.png`} active={props.active} onClose={() => setShareCard(null)} />}
    </>
  )
}
