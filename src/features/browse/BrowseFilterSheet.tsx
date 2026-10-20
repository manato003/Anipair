import { ChipSection, FilterFoot, InfoNote, YearRange } from '../../components/FilterParts'
import { Sheet } from '../../components/Sheet'
import type { BrowseWork } from '../../lib/annict'
import { t } from '../../lib/i18n'
import { nextSeason, seasonOf, yearsDescending } from '../../lib/season'
import { genreName } from '../match/taste'
import { OLDEST_SEASON } from '../rate/queue'
import { MEDIA_KINDS, SEASON_KEYS, toggleIn, type MediaInfo } from '../records/recordList'
import { EMPTY_BROWSE_FILTER, MINE_CHOICES, NO_PERIOD, browseFilterChoices, type BrowseFilter, type BrowsePeriod } from './browseFilter'

// ブラウズの絞り込み（記録の絞り込みと同じ見た目）。
// 放送年と季節（期間）は、上のクールの代わりにその期間の作品を Annict から読み直す。ほかの項目は、読み込んだ作品の中で絞る
const STUDIOS_FIRST = 18

export function BrowseFilterSheet(props: {
  // 読み直している間は null
  works: readonly BrowseWork[] | null
  searching: boolean
  filter: BrowseFilter
  period: BrowsePeriod
  info: ReadonlyMap<number, MediaInfo> | null
  // 評価の画面で「見てない」にした作品（Annict の作品 ID）
  unseen: ReadonlySet<number>
  infoError: string | null
  resultCount: number
  // まだ読み込んでいない作品がある（「もっと見る」）
  hasMore: boolean
  active: boolean
  onChange: (next: BrowseFilter) => void
  onPeriodChange: (next: BrowsePeriod) => void
  onClose: () => void
}) {
  const { filter: f, onChange, period: p, onPeriodChange } = props
  const works = props.works ?? []
  const choices = browseFilterChoices(works, props.info, props.unseen)
  const loading = !props.info && !props.infoError
  const years = yearsDescending(OLDEST_SEASON, nextSeason(seasonOf(new Date())))

  return (
    <Sheet label={t('絞り込み', 'Filter')} active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{t('絞り込み', 'Filter')}</h2>
      {/* 期間は読み込む作品そのものを決める。ほかの項目（読み込んだ作品の中で絞る）とは線で分ける */}
      <div className="filtersheet__block">
        <YearRange years={years} from={p.yearFrom} to={p.yearTo} onChange={(yearFrom, yearTo) => onPeriodChange({ ...p, yearFrom, yearTo })} />
        <ChipSection title={t('季節', 'Season')} items={SEASON_KEYS} selected={p.seasons} onToggle={(id) => onPeriodChange({ ...p, seasons: toggleIn(p.seasons, id) })} />
        <p className="note filtersheet__lead">
          {props.searching
            ? t('放送年と季節を選ぶと、その期間に放送した作品から探します。', 'Pick years and seasons to search only anime that aired in that period.')
            : t('放送年と季節を選ぶと、上のクールの代わりに、その期間の作品を読み込みます。', 'Pick years and seasons to load anime from that period instead of the season above.')}
        </p>
      </div>
      {props.hasMore && props.works && (
        <p className="note filtersheet__lead">
          {t(`ここから下は、読み込んだ${works.length}作品の中で絞り込みます。一覧の「もっと見る」で、絞り込む作品を増やせます。`, `Everything below filters the ${works.length} anime loaded so far. Use “Show more” in the list to filter more.`)}
        </p>
      )}
      <ChipSection
        title={t('自分の記録', 'My records')}
        items={MINE_CHOICES.map((c) => ({ ...c, count: choices.mine[c.id] }))}
        selected={f.mine}
        onToggle={(id) => onChange({ ...f, mine: toggleIn(f.mine, id) })}
      />
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
      <FilterFoot
        resultCount={props.works ? props.resultCount : null}
        onClear={() => {
          onChange(EMPTY_BROWSE_FILTER)
          onPeriodChange(NO_PERIOD)
        }}
        onClose={props.onClose}
      />
    </Sheet>
  )
}
