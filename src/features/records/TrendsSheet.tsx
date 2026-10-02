import { Sheet } from '../../components/Sheet'
import { ENOUGH_LIKED, type Taste } from '../match/tasteLoader'
import type { TasteState } from './useTaste'
import { genreName, ratingDistribution, tagName, topTrends, type Ranked } from './trends'

const BARS = [
  { key: 'GREAT', label: 'とても良い', tone: 'var(--r-great)' },
  { key: 'GOOD', label: '良い', tone: 'var(--r-good)' },
  { key: 'AVERAGE', label: '普通', tone: 'var(--r-average)' },
  { key: 'BAD', label: '良くない', tone: 'var(--r-bad)' },
] as const

// 好みの傾向（読むだけ）。評価の分布と、好みのジャンル・タグ・制作会社、苦手なもの
export function TrendsSheet(props: { state: TasteState; onRetry: () => void; active: boolean; onClose: () => void }) {
  return (
    <Sheet label="好みの傾向" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">好みの傾向</h2>
      {props.state.status === 'ready' ? (
        <TrendsBody taste={props.state.taste} />
      ) : props.state.status === 'error' ? (
        <section className="detail__section">
          <p className="settings__error">{props.state.message}</p>
          <button type="button" className="btn" onClick={props.onRetry}>
            もう一度
          </button>
        </section>
      ) : (
        <p className="records__loading">好みを調べています</p>
      )}
    </Sheet>
  )
}

function TrendsBody({ taste }: { taste: Taste }) {
  const dist = ratingDistribution(taste.library, taste.ratings)
  const trends = topTrends(taste.profile)
  const liked = taste.seeds.filter((s) => s.weight > 0).length
  const max = Math.max(1, dist.watchedUnrated, ...BARS.map((b) => dist.ratings[b.key]))
  const hasLikes = trends.genres.length + trends.tags.length + trends.studios.length > 0

  return (
    <>
      <section className="detail__section">
        <h3 className="detail__label">評価の分布</h3>
        <ul className="bars">
          {BARS.map((b) => (
            <BarRow key={b.key} label={b.label} tone={b.tone} count={dist.ratings[b.key]} max={max} />
          ))}
          <BarRow label="見た（評価なし）" tone="var(--muted)" count={dist.watchedUnrated} max={max} />
        </ul>
        <p className="detail__hint">評価 {dist.rated} 件から計算しています。</p>
        {liked < ENOUGH_LIKED && (
          <p className="detail__hint">
            好きな作品の記録がまだ{liked}件なので、傾向は大まかです。{ENOUGH_LIKED}件ほど評価すると好みに寄ってきます。
          </p>
        )}
      </section>

      {hasLikes ? (
        <>
          <TrendList title="好きなジャンル" items={trends.genres} name={genreName} />
          <TrendList title="好きなタグ" items={trends.tags} name={tagName} />
          <TrendList title="好きな制作会社" items={trends.studios} name={(s) => s} />
        </>
      ) : (
        <p className="detail__hint">好きな作品の記録がまだありません。評価すると、ここに好みが出ます。</p>
      )}

      {(trends.dislikedGenres.length > 0 || trends.dislikedTags.length > 0) && (
        <>
          <TrendList title="苦手なジャンル" items={trends.dislikedGenres} name={genreName} />
          <TrendList title="苦手なタグ" items={trends.dislikedTags} name={tagName} />
        </>
      )}
    </>
  )
}

function BarRow(props: { label: string; tone: string; count: number; max: number }) {
  return (
    <li className="bars__row">
      <span className="bars__label">{props.label}</span>
      <span className="bars__track">
        <span className="bars__fill" style={{ width: `${(props.count / props.max) * 100}%`, background: props.tone }} />
      </span>
      <span className="bars__count">{props.count}</span>
    </li>
  )
}

function TrendList(props: { title: string; items: Ranked[]; name: (raw: string) => string }) {
  if (props.items.length === 0) return null
  return (
    <section className="detail__section">
      <h3 className="detail__label">{props.title}</h3>
      <p className="detail__genres">{props.items.map((i) => props.name(i.name)).join('・')}</p>
    </section>
  )
}
