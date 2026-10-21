import { useMemo, useState } from 'react'
import { useEnglishPeople } from '../../lib/englishNames'
import { workTitle } from '../../lib/names'
import { createPortal } from 'react-dom'
import { CoverImage } from '../../components/CoverImage'
import { loadTitlesState } from '../achievements/achievementStore'
import { trendsShare, type ShareCard } from '../share/shareCard'
import { ShareSheet } from '../share/ShareSheet'
import type { RatingState } from '../../lib/annict'
import { AXIS_LABEL, RATING_LABEL } from '../../lib/reviewOps'
import type { Media } from '../../lib/shikimori'
import { t } from '../../lib/i18n'
import { genreName } from '../match/taste'
import { Balance, Columns, Diverging, RankBars, Radar, Ring, Stack } from './Charts'
import { MEDIA_KINDS, SEASON_KEYS, type RecordRow } from './recordList'
import type { TrendsData } from './useTrendsData'
import {
  axisWeights,
  byYear,
  countText,
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
const averageText = (avg: number | null) => (avg === null ? null : t(`平均 ${avg.toFixed(1)}`, `Avg ${avg.toFixed(1)}`))


// actions: 見出しの右の置き場（「画像で共有」をそこに出す）
export function TrendsView(props: { rows: readonly RecordRow[]; data: TrendsData; active: boolean; actions: HTMLElement | null }) {
  const { rows } = props
  const { media, credits, error } = props.data
  const empty = useMemo(() => new Map<number, Media>(), [])
  const m = media ?? empty
  // 集計は、記録・世間の点数・スタッフが変わったときだけやり直す（英語名が届いた・共有を開いたなどの描き直しでは数え直さない。2026-10-21）
  const { summary, dist, harsh, axes, years, golden, formats, seasons, vs, major, people, affinity, pace, weights } = useMemo(
    () => ({
      summary: summarize(rows),
      dist: ratingCounts(rows),
      harsh: media ? harshness(rows, media) : null,
      axes: media ? genreAxes(rows, media) : [],
      years: byYear(rows),
      golden: goldenPeriod(rows),
      formats: formatShare(rows),
      seasons: seasonCounts(rows),
      vs: media ? contrasts(rows, media) : null,
      major: mainstream(rows),
      people: topPeople(rows, credits, m),
      // 声優との相性は、声優（Annict）と世間の点数（Shikimori）の両方がそろってから
      affinity: credits && media ? castAffinity(rows, credits, media) : undefined,
      pace: monthlyPace(rows, new Date()),
      weights: axisWeights(rows),
    }),
    [rows, media, credits, m],
  )
  // 英語の画面では、出す人の英語名を Wikidata から引く（引けたら描き直す）
  useEnglishPeople([
    ...[...(people.casts ?? []), ...(people.directors ?? [])].flatMap((p) => (p.ja ? [p.ja] : [])),
    ...[...(affinity?.liked ?? []), ...(affinity?.unliked ?? [])].flatMap((a) => a.ja ?? []),
  ])
  // 共有する画像の中身（押したときに決める）
  const [shareCard, setShareCard] = useState<ShareCard | null>(null)
  const openShare = () => {
    const titles = loadTitlesState()
    setShareCard(
      trendsShare({
        summary,
        harsh,
        genres: axes,
        golden,
        major,
        affinity: affinity ?? null,
        topAxis: weights.top,
        title: titles.equipped && titles.equippedName && titles.equippedRarity ? { name: titles.equippedName, rarity: titles.equippedRarity } : null,
      }),
    )
  }
  const maxRating = Math.max(1, dist.unrated, ...RATING_BARS.map((b) => dist.counts[b.key]))

  return (
    <div className="summary">
      {props.actions &&
        createPortal(
          <button type="button" className="btn rhead__edit" onClick={openShare} disabled={!media}>
            {t('画像で共有', 'Share as image')}
          </button>,
          props.actions,
        )}
      {error && <p className="note">{t(`一部の情報を読めませんでした（${error}）。読めた分で出しています。`, `Some information couldn’t be loaded (${error}). Showing what was loaded.`)}</p>}

      {/* まとめ: 大きな数と完走率のリング */}
      <section className="trend">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__value">{summary.watched}</span>
            <span className="kpi__label">{t('見た作品', 'Watched')}</span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{summary.rated}</span>
            <span className="kpi__label">{t('評価した作品', 'Rated')}</span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{summary.watching}</span>
            <span className="kpi__label">{t('見てる', 'Watching')}</span>
          </div>
          <div className="kpi">
            <span className="kpi__value">{summary.wanna}</span>
            <span className="kpi__label">{t('見たい', 'Want to watch')}</span>
          </div>
        </div>
        {summary.completion !== null && (
          <div className="trend__ring">
            <Ring value={summary.completion} label={t('完走率', 'Completion rate')} />
            <p>
              <strong>{t('完走率', 'Completion rate')}</strong>
              <br />
              {t(`見始めた作品のうち、最後まで見た割合です（視聴中断 ${summary.stopped}本）。`, `The share of anime you started that you finished (${summary.stopped} dropped).`)}
            </p>
          </div>
        )}
      </section>

      {/* 評価の分布と、世間と比べた甘口・辛口 */}
      <section className="trend">
        <h3 className="trend__title">{t('評価の分布', 'Rating distribution')}</h3>
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
            <span className="dist__label">{t('評価なし', 'Not rated')}</span>
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
              <span className="trend__fig">{t(`（${harsh.diff >= 0 ? '+' : ''}${harsh.diff.toFixed(1)}点）`, `(${harsh.diff >= 0 ? '+' : ''}${harsh.diff.toFixed(1)} pts)`)}</span>
            </p>
            <Balance value={harsh.diff} left={t('辛口', 'Harsher')} right={t('甘口', 'More generous')} />
            <p className="trend__note">{t(`評価した${harsh.n}作品で、あなたの評価を10点満点に寄せた点と、世間の点数（Shikimori）を比べています。`, `Compares your ratings, scaled to 10 points, with the public score (Shikimori) across the ${harsh.n} anime you rated.`)}</p>
          </div>
        ) : (
          media && <p className="trend__note">{t('世間と比べるには、評価した作品があと少し要ります。', 'Rate a few more anime to compare with the public.')}</p>
        )}
      </section>

      {/* ジャンルの好み（レーダーチャート） */}
      <section className="trend">
        <h3 className="trend__title">{t('ジャンルの好み', 'Genre taste')}</h3>
        {!media ? (
          <Loading label={t('作品の情報を読み込み中', 'Loading anime info')} />
        ) : axes.length >= 3 ? (
          <>
            <Radar
              title={t('よく見るジャンルの平均評価', 'Average rating of your most-watched genres')}
              axes={axes.map((a) => ({ label: genreName(a.name), sub: `${countText(a.count)}${a.average !== null ? t(`・${a.average.toFixed(1)}`, ` · ${a.average.toFixed(1)}`) : ''}`, value: a.average === null ? null : Math.max(0, Math.min(1, (a.average - 2) / 2)) }))}
            />
            <p className="trend__note">
              {t(`よく見るジャンルの上位${axes.length}つの、平均評価です（数字は本数・平均）。中心が「普通」、外側が「とても良い」で、外に広がるほど高く評価しています。`, `Average ratings for your top ${axes.length} genres (numbers show how many anime and the average). The center is “Okay” and the edge is “Great”, so the farther out, the higher you rate.`)}
            </p>
          </>
        ) : (
          <p className="trend__note">{t('見た作品が増えると出ます。', 'This appears once you’ve watched more anime.')}</p>
        )}
      </section>

      {/* 重視する観点（項目別の評価と総合評価の連動） */}
      <section className="trend">
        <h3 className="trend__title">{t('重視する観点', 'What you value most')}</h3>
        {weights.axes.some((a) => a.link !== null) ? (
          <>
            {weights.top && (
              <p className="trend__headline">
                {t(`あなたの評価を左右しているのは「${AXIS_LABEL[weights.top.key]}」`, `What drives your ratings most: ${AXIS_LABEL[weights.top.key]}`)}
              </p>
            )}
            <RankBars
              items={weights.axes.map((a) => ({
                key: a.key,
                name: AXIS_LABEL[a.key],
                count: Math.round(Math.max(0, a.link ?? 0) * 100),
                unit: '',
                note: t(`平均 ${a.average.toFixed(1)}・${a.n}本`, `Avg ${a.average.toFixed(1)} · ${a.n} anime`),
                valueText: a.link === null ? '—' : `${Math.round(a.link * 100)}`,
              }))}
            />
            <p className="trend__note">
              {t('項目の評価が総合評価とどれだけ連動しているかです（100で完全に連動）。連動が強い項目ほど、その良し悪しで作品全体の評価が決まっています。項目を付けた作品が5本以上の項目だけ数えます。', 'How closely each category’s rating tracks your overall rating (100 means they move together perfectly). The stronger the link, the more that category decides your overall rating. Only categories rated on 5 or more anime are counted.')}
            </p>
          </>
        ) : (
          <p className="trend__note">{t('作品の詳細の「詳細な評価と感想を書く」で、映像・キャラクター・ストーリー・音楽を評価した作品が5本以上になると出ます。', 'This appears once you’ve rated animation, characters, story, and music on 5 or more anime using “Write a detailed rating and review” in the anime details.')}</p>
        )}
      </section>

      {/* 放送年ごとの本数と黄金期 */}
      {years.length > 0 && (
        <section className="trend">
          <h3 className="trend__title">{t('放送年', 'Air year')}</h3>
          {golden && (
            <p className="trend__headline">
              {t(`黄金期は ${golden.from}〜${golden.to}年`, `Golden era: ${golden.from}–${golden.to}`)}
              <span className="trend__fig">{t(`（平均 ${golden.average.toFixed(1)}・${golden.n}作品）`, ` (avg ${golden.average.toFixed(1)}, ${golden.n} anime)`)}</span>
            </p>
          )}
          <Columns
            title={t('放送年ごとの見た本数', 'Anime watched by air year')}
            bars={years.map((y) => ({
              label: String(y.year),
              value: y.count,
              emphasis: !!golden && y.year >= golden.from && y.year <= golden.to,
              title: yearBarTitle(y),
            }))}
          />
          <p className="trend__note">{t('放送年ごとの見た本数です。', 'Anime watched, by air year.')}{golden ? t('明るい棒が、評価がいちばん高い3年間です。', ' The bright bars are the 3 years you rated highest.') : ''}</p>
        </section>
      )}

      {/* 形式と季節 */}
      <section className="trend">
        <h3 className="trend__title">{t('形式と季節', 'Format and season')}</h3>
        <Stack title={t('見た作品の形式の割合', 'Share of watched anime by format')} parts={formats.map((f) => ({ label: MEDIA_KINDS.find((k) => k.id === f.kind)?.label ?? f.kind, value: f.count }))} />
        <div className="seasons">
          {SEASON_KEYS.map((s) => (
            <div key={s.id} className="seasons__cell">
              <span className="seasons__value">{seasons[s.id]}</span>
              <span className="seasons__label">{t(`${s.label}アニメ`, `${s.label} anime`)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 世間との比較 */}
      {vs && (vs.gems.length > 0 || vs.overrated.length > 0) && (
        <section className="trend">
          <h3 className="trend__title">{t('世間との比較', 'You vs. the public')}</h3>
          {vs.gems.length > 0 && (
            <>
              <p className="trend__headline">{t('あなたが見つけた隠れた名作', 'Hidden gems you found')}</p>
              <ContrastList items={vs.gems} />
            </>
          )}
          {vs.overrated.length > 0 && (
            <>
              <p className="trend__headline">{t('世間ほどではなかった作品', 'Less loved by you than by the public')}</p>
              <ContrastList items={vs.overrated} />
            </>
          )}
          <p className="trend__note">{t('世間の点数はShikimoriの10点満点です。', 'Public scores are on Shikimori’s 10-point scale.')}</p>
        </section>
      )}

      {/* 王道派か発掘派か */}
      {major && (
        <section className="trend">
          <h3 className="trend__title">{t('王道派か、発掘派か', 'Mainstream or hidden gems?')}</h3>
          <p className="trend__hero">{major.label}</p>
          <p className="trend__note">
            {t(`あなたが見た作品は、Annictでふつう ${major.median.toLocaleString('ja-JP')}人が記録しています（中央値）。多いほど王道、少ないほど発掘です。`, `The anime you watched are typically recorded by ${major.median.toLocaleString('en-US')} people on Annict (median). More means mainstream, fewer means hidden gems.`)}
          </p>
        </section>
      )}

      {/* よく見る声優・監督・制作会社 */}
      <section className="trend">
        <h3 className="trend__title">{t('よく見る声優', 'Most-watched voice actors')}</h3>
        <PeopleList items={people.casts} />
        <h3 className="trend__title">{t('よく見る監督', 'Most-watched directors')}</h3>
        <PeopleList items={people.directors} />
        <h3 className="trend__title">{t('よく見る制作会社', 'Most-watched studios')}</h3>
        <PeopleList items={media ? people.studios : null} />
      </section>

      {/* 声優との相性（よく見る声優は本数の順なので、出演の多い人が上に来やすい。こちらは評価の差で並べる） */}
      <section className="trend">
        <h3 className="trend__title">{t('声優との相性', 'Voice actor match')}</h3>
        <AffinityCard affinity={affinity} />
      </section>

      {/* 記録のペース */}
      <section className="trend">
        <h3 className="trend__title">{t('記録のペース', 'Recording pace')}</h3>
        <Columns title={t('直近12か月の、月ごとに見た本数', 'Anime watched per month, last 12 months')} every={2} bars={pace.map((p, i) => ({ label: p.label, value: p.count, emphasis: i === pace.length - 1, title: `${p.label} ${countText(p.count)}` }))} />
        <p className="trend__note">{t('直近12か月に「見た」にした本数です（明るい棒が今月）。', 'Anime you marked as watched in the last 12 months (the bright bar is this month).')}</p>
      </section>
      {shareCard && <ShareSheet card={shareCard} filename="anipair-trends.png" active={props.active} onClose={() => setShareCard(null)} />}
    </div>
  )
}

// 放送年の棒の説明（2020年 5本・平均 3.0）
function yearBarTitle(y: { year: number; count: number; average: number | null }): string {
  const avg = y.average === null ? '' : t(`・平均 ${y.average.toFixed(1)}`, ` · avg ${y.average.toFixed(1)}`)
  const head = t(`${y.year}年`, `${y.year}:`)
  return `${head} ${countText(y.count)}${avg}`
}

// 相性をいちばんよく表す作品
const exampleText = (e: NonNullable<Affinity['example']>) =>
  t(`、例:${e.title}（あなた ${RATING_LABEL[e.rating]}・世間 ${e.world.toFixed(1)}）`, `; e.g. ${e.title} (you: ${RATING_LABEL[e.rating]}, public: ${e.world.toFixed(1)})`)

// 声優との相性のカードの中身。読み込み中（undefined）・作品が足りない（null）・目立つ人がいない、を分けて書く
function AffinityCard({ affinity }: { affinity: { liked: Affinity[]; unliked: Affinity[]; n: number } | null | undefined }) {
  if (affinity === undefined)
    return (
      <Loading label={t('読み込み中（初回は少し時間がかかります）', 'Loading (the first time takes a little while)')} />
    )
  if (affinity === null) return <p className="trend__note">{t('世間の点数と比べられる、評価した作品が5本以上になると出ます。', 'This appears once you’ve rated 5 or more anime that have public scores.')}</p>
  if (affinity.liked.length === 0 && affinity.unliked.length === 0)
    return <p className="trend__note">{t('世間と比べて、シリーズをまたいでとくに高く（低く）評価している声優は、まだ見つかりません。評価した作品が増えると見えてきます。', 'No voice actors stand out yet as rated especially high (or low) across series compared with the public. They will show up as you rate more anime.')}</p>
  const max = Math.max(1, ...[...affinity.liked, ...affinity.unliked].map((a) => Math.abs(a.score)))
  const items = (list: readonly Affinity[]) =>
    list.map((a) => ({
      key: a.key,
      name: a.name,
      value: a.score,
      valueText: `${a.score >= 0 ? '+' : '−'}${Math.abs(a.score).toFixed(1)}`,
      sub: t(`${a.series}シリーズ${a.n}本`, `${a.series} series, ${a.n} anime`) + (a.example ? exampleText(a.example) : ''),
    }))
  return (
    <>
      {affinity.liked.length > 0 && (
        <>
          <p className="trend__headline">{t('隠れ推しかもしれない声優', 'Voice actors you may secretly love')}</p>
          <Diverging title={t('世間より高く評価している声優', 'Voice actors you rate higher than the public')} items={items(affinity.liked)} max={max} />
        </>
      )}
      {affinity.unliked.length > 0 && (
        <>
          <p className="trend__headline">{t('世間ほどはまらなかった声優', 'Voice actors you liked less than the public')}</p>
          <Diverging title={t('世間より低く評価している声優', 'Voice actors you rate lower than the public')} items={items(affinity.unliked)} max={max} />
        </>
      )}
      <p className="trend__note">
        {t(
          `出演の多さではなく、その声優の作品を世間の点数（Shikimori）よりどれだけ高く評価したかで並べています（数字は10点満点の差）。あなたの甘口・辛口のくせは差し引いています。同じシリーズは1つと数え、2つ以上のシリーズに出ている声優だけを出します（シリーズが少ないうちは控えめに出します）。比べた作品は${affinity.n}本です。`,
          `Ranked not by how often they appear, but by how much higher you rated their anime than the public score (Shikimori); numbers are the difference on a 10-point scale. Your own tendency to rate harsher or more generously is subtracted. A series counts once, and only voice actors in 2 or more series are shown (with few series, results are kept modest). ${affinity.n} anime were compared.`,
        )}
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
          <span className="contrast__title">{workTitle(c.row.entry)}</span>
          <span className="contrast__scores">
            {t('あなた ', 'You: ')}<strong>{RATING_LABEL[c.rating]}</strong>{t('・世間 ', ' · Public: ')}<strong>{c.score.toFixed(1)}</strong>
          </span>
        </li>
      ))}
    </ul>
  )
}

function PeopleList({ items }: { items: readonly Ranked[] | null }) {
  if (!items)
    return (
      <Loading label={t('読み込み中（初回は少し時間がかかります）', 'Loading (the first time takes a little while)')} />
    )
  if (items.length === 0) return <p className="trend__note">{t('2本以上見た人（会社）がまだいません。', 'No one (or studio) yet has 2 or more of your watched anime.')}</p>
  return <RankBars items={items.map((i) => ({ key: i.key, name: i.name, count: i.count, note: averageText(i.average) }))} />
}
