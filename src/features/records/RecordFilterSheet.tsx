import { ChipSection, CourField, FilterFoot, InfoNote } from '../../components/FilterParts'
import { Sheet } from '../../components/Sheet'
import { seasonLabel } from '../../lib/season'
import { t } from '../../lib/i18n'
import { RATING_LABEL } from '../../lib/reviewOps'
import { genreName } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { EMPTY_FILTER, MEDIA_KINDS, filterChoices, toggleIn, type MediaInfo, type RatingFilter, type RecordFilter, type RecordRow } from './recordList'

// 記録の絞り込み。選ぶとすぐ一覧に効き、下のボタンに当てはまる件数が出る（押すと閉じる）。
// 項目の中は「どれか」、項目どうしは「すべて」に当てはまるもの（recordList.ts の applyFilter）
const ratingChoices = (): readonly { id: RatingFilter; label: string }[] => [...[...RATINGS].reverse().map((r) => ({ id: r.rating, label: RATING_LABEL[r.rating] })), { id: 'NONE', label: t('評価なし', 'Not rated') }]

// 制作会社は多いので、最初は上位だけを出す
const STUDIOS_FIRST = 18

export function RecordFilterSheet(props: {
  rows: readonly RecordRow[]
  filter: RecordFilter
  info: ReadonlyMap<number, MediaInfo> | null
  infoError: string | null
  // いまの状態（見た・見たいなど）で、条件に当てはまる件数
  resultCount: number
  active: boolean
  onChange: (next: RecordFilter) => void
  onClose: () => void
}) {
  const { filter: f, onChange } = props
  const choices = filterChoices(props.rows, props.info)
  const loading = !props.info && !props.infoError

  return (
    <Sheet label={t('絞り込み', 'Filter')} active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{t('絞り込み', 'Filter')}</h2>
      <ChipSection title={t('評価', 'Rating')} items={ratingChoices()} selected={f.ratings} onToggle={(id) => onChange({ ...f, ratings: toggleIn(f.ratings, id) })} />
      {/* 放送クールは一覧の上でも選べる。選んでいるあいだは、期間と重なるので出さない */}
      <section className="filtersheet__group">
        <h3 className="detail__label">{t('放送時期', 'Aired')}</h3>
        {f.cour ? (
          <p className="note">{t(`一覧の上で ${seasonLabel(f.cour)} を選んでいます。期間で選ぶときは、一覧の上の「すべて」を押してください。`, `You’ve picked ${seasonLabel(f.cour)} above the list. To filter by a period instead, tap “All” above the list.`)}</p>
        ) : (
          <div className="filtersheet__cours">
            <CourField label={t('から', 'From')} value={f.from} years={choices.years} fallback="winter" onChange={(from) => onChange({ ...f, from })} />
            <CourField label={t('まで', 'To')} value={f.to} years={choices.years} fallback="autumn" onChange={(to) => onChange({ ...f, to })} />
          </div>
        )}
      </section>
      <ChipSection title={t('形式', 'Format')} items={MEDIA_KINDS} selected={f.media} onToggle={(id) => onChange({ ...f, media: toggleIn(f.media, id) })} />
      <InfoNote title={t('ジャンル', 'Genre')} loading={loading} error={props.infoError} />
      {props.info && (
        <ChipSection
          title={t('ジャンル', 'Genre')}
          items={choices.genres.map((g) => ({ id: g.name, label: genreName(g.name), count: g.count }))}
          selected={f.genres}
          onToggle={(id) => onChange({ ...f, genres: toggleIn(f.genres, id) })}
        />
      )}
      <InfoNote title={t('制作会社', 'Studio')} loading={loading} error={null} />
      {props.info && (
        <ChipSection
          title={t('制作会社', 'Studio')}
          items={choices.studios.map((st) => ({ id: st.name, label: st.name, count: st.count }))}
          selected={f.studios}
          onToggle={(id) => onChange({ ...f, studios: toggleIn(f.studios, id) })}
          first={STUDIOS_FIRST}
          moreLabel={(rest) => t(`ほかの制作会社も見る（${rest}社）`, `Show ${rest} more ${rest === 1 ? 'studio' : 'studios'}`)}
        />
      )}
      {/* すべて解除は、このシートの条件だけ（一覧の上で選んだクールはそのまま） */}
      <FilterFoot resultCount={props.resultCount} onClear={() => onChange({ ...EMPTY_FILTER, cour: f.cour ?? null })} onClose={props.onClose} />
    </Sheet>
  )
}
