import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CoverImage } from '../../components/CoverImage'
import type { WorkCredits } from '../../lib/annict'
import { RATING_LABEL } from '../../lib/reviewOps'
import type { Media } from '../../lib/shikimori'
import { loadTitlesState } from '../achievements/achievementStore'
import { genreName } from '../match/taste'
import { yearShare, type ShareCard } from '../share/shareCard'
import { ShareSheet } from '../share/ShareSheet'
import { Columns } from './Charts'
import type { RecordRow } from './recordList'
import { reviewYears, yearReview } from './trends'

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

  const openShare = () => {
    if (!y) return
    const t = loadTitlesState()
    setShareCard(yearShare(y, t.equipped && t.equippedName && t.equippedRarity ? { name: t.equippedName, rarity: t.equippedRarity } : null))
  }

  return (
    <>
      <div className="summary">
        {y &&
          y.watched > 0 &&
          props.actions &&
          createPortal(
            <button type="button" className="btn rhead__edit" onClick={openShare}>
              画像で共有
            </button>,
            props.actions,
          )}
        {years.length > 1 && (
          <div className="filtersheet__chips yearreview__years" role="group" aria-label="年">
            {years.map((yy) => (
              <button key={yy} type="button" className="chip" aria-pressed={yy === year} onClick={() => setYear(yy)}>
                {yy}年
              </button>
            ))}
          </div>
        )}
        {!y ? (
          <p className="trend__note">「見た」にした作品が増えると、年ごとにふり返れます。</p>
        ) : (
          <>
            <section className="trend">
              <div className="kpis kpis--3">
                <div className="kpi">
                  <span className="kpi__value">{y.watched}</span>
                  <span className="kpi__label">見た作品</span>
                </div>
                <div className="kpi">
                  <span className="kpi__value">{y.rated}</span>
                  <span className="kpi__label">評価した作品</span>
                </div>
                <div className="kpi">
                  <span className="kpi__value">{y.average === null ? '—' : y.average.toFixed(1)}</span>
                  <span className="kpi__label">平均評価</span>
                </div>
              </div>
              <p className="trend__note">Annict で「見た」にした日で数えています（昔の作品をまとめて記録したときは、その日の年に入ります）。</p>
            </section>

            <section className="trend">
              <h3 className="trend__title">月ごとの本数</h3>
              {y.busiest && (
                <p className="trend__headline">
                  いちばん見たのは {y.busiest.month}月<span className="trend__fig">（{y.busiest.count}本）</span>
                </p>
              )}
              <Columns
                title={`${y.year}年の月ごとに見た本数`}
                bars={y.months.map((n, i) => ({ label: `${i + 1}月`, value: n, emphasis: y.busiest?.month === i + 1, title: `${i + 1}月 ${n}本` }))}
                every={2}
              />
            </section>

            {y.best.length > 0 && (
              <section className="trend">
                <h3 className="trend__title">いちばん良かった作品</h3>
                <ul className="contrast">
                  {y.best.map((r) => (
                    <li key={r.entry.annictId} className="contrast__item">
                      <span className="contrast__cover">{r.cover && <CoverImage cover={r.cover} size="thumb" lazy />}</span>
                      <span className="contrast__title">{r.entry.title}</span>
                      <span className="contrast__scores">
                        あなた <strong>{RATING_LABEL[r.review!.ratingOverallState!]}</strong>
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
                    <h3 className="trend__title">よく見たジャンル</h3>
                    <p className="trend__headline">{y.genres.map((g) => `${genreName(g.name)}（${g.count}本）`).join('・')}</p>
                  </>
                )}
                {y.casts.length > 0 && (
                  <>
                    <h3 className="trend__title">よく見た声優</h3>
                    <p className="trend__headline">{y.casts.map((c) => `${c.name}（${c.count}本）`).join(' / ')}</p>
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
