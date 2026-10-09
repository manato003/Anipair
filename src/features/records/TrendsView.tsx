import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CoverImage } from '../../components/CoverImage'
import { loadTitlesState } from '../achievements/achievementStore'
import { trendsShare, type ShareCard } from '../share/shareCard'
import { ShareSheet } from '../share/ShareSheet'
import type { RatingState } from '../../lib/annict'
import { AXIS_LABEL, RATING_LABEL } from '../../lib/reviewOps'
import type { Media } from '../../lib/shikimori'
import { genreName } from '../match/taste'
import { Balance, Columns, Diverging, RankBars, Radar, Ring, Stack } from './Charts'
import { MEDIA_KINDS, SEASON_KEYS, type RecordRow } from './recordList'
import type { TrendsData } from './useTrendsData'
import {
  axisWeights,
  byYear,
  castAffinity,
  contrasts,
  formatShare,
  genreAxes,
  goldenPeriod,
  harshness,
  mainstream,
  monthlyPace,
  ratingCounts,
  seasonCounts,
  summarize,
  topPeople,
  type Affinity,
  type Ranked,
} from './trends'
import { Loading } from '../../components/Loading'

// 記録の「まとめ ▸ 傾向」。記録を端末で集計して、カードごとに図にする（サーバーは使わない）。
// 作品の情報（ジャンル・制作会社・世間の点数）は Shikimori、声優と監督は Annict から裏の優先度で読み、読めたカードから順に出す（useTrendsData。ふり返りと共有）

const RATING_BARS: readonly { key: RatingState; tone: string }[] = [
  { key: 'GREAT', tone: 'var(--r-great)' },
  { key: 'GOOD', tone: 'var(--r-good)' },
  { key: 'AVERAGE', tone: 'var(--r-average)' },
  { key: 'BAD', tone: 'var(--r-bad)' },
]

// 平均評価（1〜4）を文に
const averageText = (avg: number | null) => (avg === null ? null : `平均 ${avg.toFixed(1)}`)


// actions: 見出しの右の置き場（「画像で共有」をそこに出す）
export function TrendsView(props: { rows: readonly RecordRow[]; data: TrendsData; active: boolean; actions: HTMLElement | null }) {
  const { rows } = props
  const { media, credits, error } = props.data
  const empty = useMemo(() => new Map<number, Media>(), [])
  const m = media ?? empty
  const summary = summarize(rows)
  const dist = ratingCounts(rows)
  const harsh = media ? harshness(rows, media) : null
  const axes = media ? genreAxes(rows, media) : []
  const years = byYear(rows)
  const golden = goldenPeriod(rows)
  const formats = formatShare(rows)
  const seasons = seasonCounts(rows)
  const vs = media ? contrasts(rows, media) : null
  const major = mainstream(rows)
  const people = topPeople(rows, credits, m)
  // 声優との相性は、声優（Annict）と世間の点数（Shikimori）の両方がそろってから
  const affinity = credits && media ? castAffinity(rows, credits, media) : undefined
  const pace = monthlyPace(rows, new Date())
  const weights = axisWeights(rows)
  // 共有する画像の中身（押したときに決める）
  const [shareCard, setShareCard] = useState<ShareCard | null>(null)
  const openShare = () => {
    const t = loadTitlesState()
    setShareCard(
      trendsShare({
        summary,
        harsh,
        genres: axes,
        golden,
        major,
        affinity: affinity ?? null,
        topAxis: weights.top,
        title: t.equipped && t.equippedName && t.equippedRarity ? { name: t.equippedName, rarity: t.equippedRarity } : null,
      }),
    )
  }
  const maxRating = Math.max(1, dist.unrated, ...RATING_BARS.map((b) => dist.counts[b.key]))

  return (
    <div className="summary">
      {props.actions &&
        createPortal(
          <button type="button" className="btn rhead__edit" onClick={openShare} disabled={!media}>
            画像で共有
          </button>,
          props.actions,
        )}
      {error && <p className="note">一部の情報を読めませんでした（{error}）。読めた分で出しています。</p>}

      {/* まとめ: 大きな数と完走率のリング */}
      <section className="trend">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__value">{summary.watched}</span>
            <span className="kpi__label">見た作品</span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{summary.rated}</span>
            <span className="kpi__label">評価した作品</span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{summary.watching}</span>
            <span className="kpi__label">見てる</span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{summary.wanna}</span>
            <span className="kpi__label">見たい</span>
          </div>
        </div>
        {summary.completion !== null && (
          <div className="trend__ring">
            <Ring value={summary.completion} label="完走率" />
            <p>
              <strong>完走率</strong>
              <br />
              見始めた作品のうち、最後まで見た割合です（視聴中断 {summary.stopped}本）。
            </p>
          </div>
        )}
      </section>

      {/* 評価の分布と、世間と比べた甘口・辛口 */}
      <section className="trend">
        <h3 className="trend__title">評価の分布</h3>
        <ul className="dist">
          {RATING_BARS.map((b) => (
            <li key={b.key} className="dist__row">
              <span className="dist__label">{RATING_LABEL[b.key]}</span>
              <span className="dist__track">
                <span className="dist__fill" style={{ width: `${(dist.counts[b.key] / maxRating) * 100}%`, background: b.tone }} />
              </span>
              <span className="dist__count">{dist.counts[b.key]}</span>
            </li>
          ))}
          <li className="dist__row">
            <span className="dist__label">評価なし</span>
            <span className="dist__track">
              <span className="dist__fill" style={{ width: `${(dist.unrated / maxRating) * 100}%`, background: 'var(--line-strong)' }} />
            </span>
            <span className="dist__count">{dist.unrated}</span>
          </li>
        </ul>
        {harsh ? (
          <div className="trend__sub">
            <p className="trend__headline">
              {harsh.label}
              <span className="trend__fig">（{harsh.diff >= 0 ? '+' : ''}{harsh.diff.toFixed(1)}点）</span>
            </p>
            <Balance value={harsh.diff} left="辛口" right="甘口" />
            <p className="trend__note">評価した{harsh.n}作品で、あなたの評価を10点満点に寄せた点と、世間の点数（Shikimori）を比べています。</p>
          </div>
        ) : (
          media && <p className="trend__note">世間と比べるには、評価した作品があと少し要ります。</p>
        )}
      </section>

      {/* ジャンルの好み（レーダーチャート） */}
      <section className="trend">
        <h3 className="trend__title">ジャンルの好み</h3>
        {!media ? (
          <Loading label="作品の情報を読み込み中" />
        ) : axes.length >= 3 ? (
          <>
            <Radar
              title="よく見るジャンルの平均評価"
              axes={axes.map((a) => ({ label: genreName(a.name), sub: `${a.count}本${a.average !== null ? `・${a.average.toFixed(1)}` : ''}`, value: a.average === null ? null : Math.max(0, Math.min(1, (a.average - 2) / 2)) }))}
            />
            <p className="trend__note">
              よく見るジャンルの上位{axes.length}つの、平均評価です（数字は本数・平均）。中心が「普通」、外側が「とても良い」で、外に広がるほど高く評価しています。
            </p>
          </>
        ) : (
          <p className="trend__note">見た作品が増えると出ます。</p>
        )}
      </section>

      {/* 重視する観点（項目別の評価と総合評価の連動） */}
      <section className="trend">
        <h3 className="trend__title">重視する観点</h3>
        {weights.axes.some((a) => a.link !== null) ? (
          <>
            {weights.top && (
              <p className="trend__headline">
                あなたの評価を左右しているのは「{AXIS_LABEL[weights.top.key]}」
              </p>
            )}
            <RankBars
              items={weights.axes.map((a) => ({
                key: a.key,
                name: AXIS_LABEL[a.key],
                count: Math.round(Math.max(0, a.link ?? 0) * 100),
                unit: '',
                note: `平均 ${a.average.toFixed(1)}・${a.n}本`,
                valueText: a.link === null ? '—' : `${Math.round(a.link * 100)}`,
              }))}
            />
            <p className="trend__note">
              項目の評価が総合評価とどれだけ連動しているかです（100 で完全に連動）。連動が強い項目ほど、その良し悪しで作品全体の評価が決まっています。項目を付けた作品が5本以上の項目だけ数えます。
            </p>
          </>
        ) : (
          <p className="trend__note">作品の詳細の「項目別の評価と感想を書く」で、映像・キャラクター・ストーリー・音楽を評価した作品が5本以上になると出ます。</p>
        )}
      </section>

      {/* 放送年ごとの本数と黄金期 */}
      {years.length > 0 && (
        <section className="trend">
          <h3 className="trend__title">放送年</h3>
          {golden && (
            <p className="trend__headline">
              黄金期は {golden.from}〜{golden.to}年
              <span className="trend__fig">（平均 {golden.average.toFixed(1)}・{golden.n}作品）</span>
            </p>
          )}
          <Columns
            title="放送年ごとの見た本数"
            bars={years.map((y) => ({
              label: String(y.year),
              value: y.count,
              emphasis: !!golden && y.year >= golden.from && y.year <= golden.to,
              title: `${y.year}年 ${y.count}本${y.average !== null ? `・平均 ${y.average.toFixed(1)}` : ''}`,
            }))}
          />
          <p className="trend__note">放送年ごとの見た本数です。{golden ? '明るい棒が、評価がいちばん高い3年間です。' : ''}</p>
        </section>
      )}

      {/* 形式と季節 */}
      <section className="trend">
        <h3 className="trend__title">形式と季節</h3>
        <Stack title="見た作品の形式の割合" parts={formats.map((f) => ({ label: MEDIA_KINDS.find((k) => k.id === f.kind)?.label ?? f.kind, value: f.count }))} />
        <div className="seasons">
          {SEASON_KEYS.map((s) => (
            <div key={s.id} className="seasons__cell">
              <span className="seasons__value">{seasons[s.id]}</span>
              <span className="seasons__label">{s.label}アニメ</span>
            </div>
          ))}
        </div>
      </section>

      {/* 世間との比較 */}
      {vs && (vs.gems.length > 0 || vs.overrated.length > 0) && (
        <section className="trend">
          <h3 className="trend__title">世間との比較</h3>
          {vs.gems.length > 0 && (
            <>
              <p className="trend__headline">あなたが見つけた隠れた名作</p>
              <ContrastList items={vs.gems} />
            </>
          )}
          {vs.overrated.length > 0 && (
            <>
              <p className="trend__headline">世間ほどではなかった作品</p>
              <ContrastList items={vs.overrated} />
            </>
          )}
          <p className="trend__note">世間の点数は Shikimori の10点満点です。</p>
        </section>
      )}

      {/* 王道派か発掘派か */}
      {major && (
        <section className="trend">
          <h3 className="trend__title">王道派か、発掘派か</h3>
          <p className="trend__hero">{major.label}</p>
          <p className="trend__note">
            あなたが見た作品は、Annict でふつう {major.median.toLocaleString('ja-JP')}人が記録しています（中央値）。多いほど王道、少ないほど発掘です。
          </p>
        </section>
      )}

      {/* よく見る声優・監督・制作会社 */}
      <section className="trend">
        <h3 className="trend__title">よく見る声優</h3>
        <PeopleList items={people.casts} />
        <h3 className="trend__title">よく見る監督</h3>
        <PeopleList items={people.directors} />
        <h3 className="trend__title">よく見る制作会社</h3>
        <PeopleList items={media ? people.studios : null} />
      </section>

      {/* 声優との相性（よく見る声優は本数の順なので、出演の多い人が上に来やすい。こちらは評価の差で並べる） */}
      <section className="trend">
        <h3 className="trend__title">声優との相性</h3>
        <AffinityCard affinity={affinity} />
      </section>

      {/* 記録のペース */}
      <section className="trend">
        <h3 className="trend__title">記録のペース</h3>
        <Columns title="直近12か月の、月ごとに見た本数" every={2} bars={pace.map((p, i) => ({ label: p.label, value: p.count, emphasis: i === pace.length - 1, title: `${p.label} ${p.count}本` }))} />
        <p className="trend__note">直近12か月に「見た」にした本数です（明るい棒が今月）。</p>
      </section>
      {shareCard && <ShareSheet card={shareCard} filename="anipair-trends.png" active={props.active} onClose={() => setShareCard(null)} />}
    </div>
  )
}

// 声優との相性のカードの中身。読み込み中（undefined）・作品が足りない（null）・目立つ人がいない、を分けて書く
function AffinityCard({ affinity }: { affinity: { liked: Affinity[]; unliked: Affinity[]; n: number } | null | undefined }) {
  if (affinity === undefined)
    return (
      <Loading label="読み込み中（初回は少し時間がかかります）" />
    )
  if (affinity === null) return <p className="trend__note">世間の点数と比べられる、評価した作品が5本以上になると出ます。</p>
  if (affinity.liked.length === 0 && affinity.unliked.length === 0)
    return <p className="trend__note">世間と比べて、シリーズをまたいでとくに高く（低く）評価している声優は、まだ見つかりません。評価した作品が増えると見えてきます。</p>
  const max = Math.max(1, ...[...affinity.liked, ...affinity.unliked].map((a) => Math.abs(a.score)))
  const items = (list: readonly Affinity[]) =>
    list.map((a) => ({
      key: a.key,
      name: a.name,
      value: a.score,
      valueText: `${a.score >= 0 ? '+' : '−'}${Math.abs(a.score).toFixed(1)}`,
      sub: `${a.series}シリーズ${a.n}本${a.example ? `、例:${a.example.title}（あなた ${RATING_LABEL[a.example.rating]}・世間 ${a.example.world.toFixed(1)}）` : ''}`,
    }))
  return (
    <>
      {affinity.liked.length > 0 && (
        <>
          <p className="trend__headline">隠れ推しかもしれない声優</p>
          <Diverging title="世間より高く評価している声優" items={items(affinity.liked)} max={max} />
        </>
      )}
      {affinity.unliked.length > 0 && (
        <>
          <p className="trend__headline">世間ほどはまらなかった声優</p>
          <Diverging title="世間より低く評価している声優" items={items(affinity.unliked)} max={max} />
        </>
      )}
      <p className="trend__note">
        {`出演の多さではなく、その声優の作品を世間の点数（Shikimori）よりどれだけ高く評価したかで並べています（数字は10点満点の差）。あなたの甘口・辛口のくせは差し引いています。同じシリーズは1つと数え、2つ以上のシリーズに出ている声優だけを出します（シリーズが少ないうちは控えめに出します）。比べた作品は${affinity.n}本です。`}
      </p>
    </>
  )
}

function ContrastList({ items }: { items: readonly { row: RecordRow; rating: RatingState; score: number }[] }) {
  return (
    <ul className="contrast">
      {items.map((c) => (
        <li key={c.row.entry.annictId} className="contrast__item">
          <span className="contrast__cover">{c.row.cover && <CoverImage cover={c.row.cover} size="thumb" lazy />}</span>
          <span className="contrast__title">{c.row.entry.title}</span>
          <span className="contrast__scores">
            あなた <strong>{RATING_LABEL[c.rating]}</strong>・世間 <strong>{c.score.toFixed(1)}</strong>
          </span>
        </li>
      ))}
    </ul>
  )
}

function PeopleList({ items }: { items: readonly Ranked[] | null }) {
  if (!items)
    return (
      <Loading label="読み込み中（初回は少し時間がかかります）" />
    )
  if (items.length === 0) return <p className="trend__note">2本以上見た人（会社）がまだいません。</p>
  return <RankBars items={items.map((i) => ({ key: i.key, name: i.name, count: i.count, note: averageText(i.average) }))} />
}
