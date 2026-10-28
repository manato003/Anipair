import { useState } from 'react'
import { ChipSection, CourField, FilterFoot, InfoNote } from '../../components/FilterParts'
import { Sheet } from '../../components/Sheet'
import type { BrowseWork } from '../../lib/annict'
import { t } from '../../lib/i18n'
import { nextSeason, seasonOf, yearsDescending } from '../../lib/season'
import { genreName } from '../match/taste'
import { OLDEST_SEASON } from '../rate/queue'
import { MEDIA_KINDS, toggleIn, type MediaInfo } from '../records/recordList'
import { EMPTY_BROWSE_FILTER, MINE_CHOICES, NO_PERIOD, browseFilterChoices, periodActive, type BrowseFilter, type BrowsePeriod } from './browseFilter'

// ブラウズの絞り込み（記録の絞り込みと同じ見た目）。
// 期間（始めと終わりのクール）は、上のクールの代わりにその期間の作品を Annict から読み直す。ほかの項目は、読み込んだ作品の中で絞る。
// ただし期間を選んでジャンル・制作会社をかけたときは、期間の全作品から探す（conditionSearch.ts）
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
  active: boolean
  // 選べる制作会社の数（期間の全作品から探すとき。1社ごとに Shikimori へ問い合わせるため）
  studioMax?: number
  onChange: (next: BrowseFilter) => void
  onPeriodChange: (next: BrowsePeriod) => void
  onClose: () => void
}) {
  const { filter: f, onChange, period: p, onPeriodChange } = props
  // 期間を変えて作品と作品の情報を読み直すあいだは、前に読み込んだ分の選択肢を薄くして残す。
  // 消して「読み込み中」に置き換えると、シートの高さが大きく縮んでまた伸び、暗い背景が一瞬広がって見え、開いているプルダウンもずれた
  const [last, setLast] = useState<{ works: readonly BrowseWork[]; info: ReadonlyMap<number, MediaInfo> } | null>(null)
  if (props.works && props.info && (props.works !== last?.works || props.info !== last?.info)) setLast({ works: props.works, info: props.info })
  const stale = (!props.works || !props.info) && !props.infoError && last !== null
  const works = stale ? last.works : (props.works ?? [])
  const info = stale ? last.info : props.info
  const choices = browseFilterChoices(works, info, props.unseen, f)
  const loading = !info && !props.infoError
  const years = yearsDescending(OLDEST_SEASON, nextSeason(seasonOf(new Date())))
  // 期間のときは、読み込んだ件数を出さない（ジャンル・制作会社は読み込んだ分ではなく、期間の全作品から探すため）
  const fromPeriod = periodActive(p) && !props.searching

  return (
    <Sheet label={t('絞り込み', 'Filter')} active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{t('絞り込み', 'Filter')}</h2>
      {/* 期間は読み込む作品そのものを決める。ほかの項目（読み込んだ作品の中で絞る）とは線と見出しで分ける */}
      <div className="filtersheet__block">
        <h3 className="filtersheet__part">{props.searching ? t('探す期間', 'Period to search') : t('読み込む期間', 'Period to load')}</h3>
        <section className="filtersheet__group">
          <h3 className="detail__label">{t('放送時期', 'Aired')}</h3>
          <div className="filtersheet__cours">
            <CourField label={t('から', 'From')} value={p.from} years={years} fallback="winter" onChange={(from) => onPeriodChange({ ...p, from })} />
            <CourField label={t('まで', 'To')} value={p.to} years={years} fallback="autumn" onChange={(to) => onPeriodChange({ ...p, to })} />
          </div>
        </section>
      </div>
      <h3 className="filtersheet__part">
        {fromPeriod
          ? t('この期間の作品から', 'From anime in this period')
          : props.works
            ? t(`読み込んだ${works.length}作品から`, `From the ${works.length} loaded`)
            : t('読み込んだ作品から', 'From the loaded anime')}
      </h3>
      <div className={stale ? 'filtersheet__choices filtersheet__choices--stale' : 'filtersheet__choices'} aria-busy={stale || undefined}>
        <ChipSection
          title={t('自分の記録', 'My records')}
          items={MINE_CHOICES.map((c) => ({ ...c, count: choices.mine[c.id] }))}
          selected={f.mine}
          onToggle={(id) => onChange({ ...f, mine: toggleIn(f.mine, id) })}
        />
        <ChipSection title={t('形式', 'Format')} items={MEDIA_KINDS} selected={f.media} onToggle={(id) => onChange({ ...f, media: toggleIn(f.media, id) })} />
        <InfoNote title={t('ジャンル', 'Genre')} loading={loading} error={props.infoError} />
        {info && (
          <ChipSection
            title={t('ジャンル', 'Genre')}
            items={choices.genres.map((g) => ({ id: g.name, label: genreName(g.name), count: g.count }))}
            selected={f.genres}
            onToggle={(id) => onChange({ ...f, genres: toggleIn(f.genres, id) })}
          />
        )}
        <InfoNote title={t('制作会社', 'Studio')} loading={loading} error={null} />
        {info && (
          <ChipSection
            title={t('制作会社', 'Studio')}
            items={choices.studios.map((st) => ({ id: st.name, label: st.name, count: st.count }))}
            selected={f.studios}
            onToggle={(id) => onChange({ ...f, studios: toggleIn(f.studios, id) })}
            first={STUDIOS_FIRST}
            max={props.studioMax}
            maxNote={props.studioMax ? t(`制作会社は${props.studioMax}社まで選べます`, `You can pick up to ${props.studioMax} studios`) : undefined}
            moreLabel={(rest) => t(`ほかの制作会社も見る（${rest}社）`, `Show ${rest} more ${rest === 1 ? 'studio' : 'studios'}`)}
          />
        )}
      </div>
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
