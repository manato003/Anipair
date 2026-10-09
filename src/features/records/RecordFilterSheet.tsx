import { ChipSection, FilterFoot, InfoNote, YearRange } from '../../components/FilterParts'
import { Sheet } from '../../components/Sheet'
import { seasonLabel } from '../../lib/season'
import { RATING_LABEL } from '../../lib/reviewOps'
import { genreName } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { EMPTY_FILTER, MEDIA_KINDS, SEASON_KEYS, filterChoices, toggleIn, type MediaInfo, type RatingFilter, type RecordFilter, type RecordRow } from './recordList'

// 記録の絞り込み。選ぶとすぐ一覧に効き、下のボタンに当てはまる件数が出る（押すと閉じる）。
// 項目の中は「どれか」、項目どうしは「すべて」に当てはまるもの（recordList.ts の applyFilter）
const RATING_CHOICES: readonly { id: RatingFilter; label: string }[] = [...[...RATINGS].reverse().map((r) => ({ id: r.rating, label: RATING_LABEL[r.rating] })), { id: 'NONE', label: '評価なし' }]

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
    <Sheet label="絞り込み" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">絞り込み</h2>
      <ChipSection title="評価" items={RATING_CHOICES} selected={f.ratings} onToggle={(id) => onChange({ ...f, ratings: toggleIn(f.ratings, id) })} />
      {/* 放送クールは一覧の上で選ぶ。選んでいるあいだは、放送年の範囲と季節は重なるので出さない */}
      {f.cour ? (
        <section className="filtersheet__group">
          <h3 className="detail__label">放送年・季節</h3>
          <p className="note">一覧の上で {seasonLabel(f.cour)} を選んでいます。放送年と季節で選ぶときは、一覧の上の「すべて」を押してください。</p>
        </section>
      ) : (
        <>
          <YearRange years={choices.years} from={f.yearFrom} to={f.yearTo} onChange={(yearFrom, yearTo) => onChange({ ...f, yearFrom, yearTo })} />
          <ChipSection title="季節" items={SEASON_KEYS} selected={f.seasons} onToggle={(id) => onChange({ ...f, seasons: toggleIn(f.seasons, id) })} />
        </>
      )}
      <ChipSection title="形式" items={MEDIA_KINDS} selected={f.media} onToggle={(id) => onChange({ ...f, media: toggleIn(f.media, id) })} />
      <InfoNote title="ジャンル" loading={loading} error={props.infoError} />
      {props.info && (
        <ChipSection
          title="ジャンル"
          items={choices.genres.map((g) => ({ id: g.name, label: genreName(g.name), count: g.count }))}
          selected={f.genres}
          onToggle={(id) => onChange({ ...f, genres: toggleIn(f.genres, id) })}
        />
      )}
      <InfoNote title="制作会社" loading={loading} error={null} />
      {props.info && (
        <ChipSection
          title="制作会社"
          items={choices.studios.map((st) => ({ id: st.name, label: st.name, count: st.count }))}
          selected={f.studios}
          onToggle={(id) => onChange({ ...f, studios: toggleIn(f.studios, id) })}
          first={STUDIOS_FIRST}
          moreLabel={(rest) => `ほかの制作会社も見る（${rest}社）`}
        />
      )}
      {/* すべて解除は、このシートの条件だけ（一覧の上で選んだクールはそのまま） */}
      <FilterFoot resultCount={props.resultCount} onClear={() => onChange({ ...EMPTY_FILTER, cour: f.cour ?? null })} onClose={props.onClose} />
    </Sheet>
  )
}
