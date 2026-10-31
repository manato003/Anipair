import type { ReactNode } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { genreName } from '../match/taste'
import { RATINGS } from '../rate/queue'
import { defaultTierName, tierColor } from '../tier/tierList'
import { t } from '../../lib/i18n'
import { shikiTitle } from '../../lib/names'
import { seasonLabel } from '../../lib/season'
import type { Media } from '../../lib/shikimori'
import { DEMO_RATINGS, DEMO_TIER_COUNT, type DemoRating, type MatchPick } from './demo'
import { DEMO_SHELVES, type DemoAnswer } from './demoWorks'

// 紹介ページのデモの段（評価のカード → 理由つきの提案 → Tier表 → ほかにも）。計算は demo.ts、作品の情報は useLandingMedia.ts。
// 本物の画面に見た目と操作の感触を寄せるが、Annict には送らず、端末にも残さない

const titleOf = (m: Media | undefined) => (m ? shikiTitle(m.title, '') : '')

// 答えの名前（評価は本物の評価の画面と同じ言葉）
function answerLabel(a: DemoAnswer): string {
  if (a === 'NONE') return t('見た', 'Watched')
  if (a === 'WANNA') return t('見たい', 'Want to watch')
  if (a === 'SKIP') return t('見てない', 'Haven’t seen')
  return RATINGS.find((r) => r.rating === a)?.label ?? ''
}

const seasonOfId = new Map(DEMO_SHELVES.flatMap((s) => s.ids.map((id) => [id, s.season] as const)))

// Shikimori のポスター。読めないときは題名を出す
export function DemoPoster(props: { media: Media | undefined; size: 'large' | 'thumb'; className?: string }) {
  const title = titleOf(props.media)
  const alt = <span className="lp-poster__alt">{title}</span>
  return (
    <span className={`lp-poster ${props.className ?? ''}`}>
      {props.media?.cover ? <CoverImage cover={props.media.cover} size={props.size} lazy fallback={alt} /> : alt}
    </span>
  )
}

// 左に説明、右に触れるデモを置く段
function Chapter(props: { id: string; no: string; title: string; lead: string; side?: ReactNode; children: ReactNode }) {
  return (
    <section id={props.id} className="lp-sec lp-chapter" aria-labelledby={`${props.id}-title`}>
      <div className="lp-chapter__inner">
        <div className="lp-chapter__text">
          <p className="lp-chapter__no">{props.no}</p>
          <h2 id={`${props.id}-title`} className="lp-chapter__title">
            {props.title}
          </h2>
          <p className="lp-chapter__lead">{props.lead}</p>
          {props.side}
        </div>
        <div className="lp-chapter__demo">{props.children}</div>
      </div>
    </section>
  )
}

export function DemoRate(props: {
  media: ReadonlyMap<number, Media>
  loading: boolean
  failed: boolean
  onRetry: () => void
  current: number | null
  next: number | null
  last: { id: number; answer: DemoAnswer } | null
  answered: number
  onAnswer: (id: number, a: DemoAnswer) => void
  onAuto: () => void
  onReset: () => void
  onJump: (id: string) => void
}) {
  const cur = props.current !== null ? props.media.get(props.current) : undefined
  const nxt = props.next !== null ? props.media.get(props.next) : undefined
  const last = props.last ? props.media.get(props.last.id) : undefined
  const season = props.current !== null ? seasonOfId.get(props.current) : undefined
  const answer = (a: DemoAnswer) => props.current !== null && props.onAnswer(props.current, a)
  return (
    <Chapter
      id="lp-try"
      no={t('1　記録する', '1  Log')}
      title={t('見たアニメに、ひと押しで答える', 'Answer each anime with a single tap')}
      lead={t(
        'クールごとの人気作が1枚ずつ出ます。見た作品は4段階で評価し、見ていなければ「見てない」か「見たい」。評価を押すと、そのまま「見た」の記録になります。',
        'Popular anime from each season appear one at a time. Rate the ones you’ve watched on a four-point scale, or choose “Haven’t seen” or “Want to watch.” Rating an anime logs it as watched.',
      )}
      side={
        <>
          <p className="lp-note">{t(`答えた数: ${props.answered}`, `Answered: ${props.answered}`)}</p>
          <div className="lp-row">
            <button type="button" className="lp-btn lp-btn--ghost" onClick={props.onAuto}>
              {t('おまかせで答える', 'Answer for me')}
            </button>
            {props.answered > 0 && (
              <button type="button" className="lp-textbtn" onClick={props.onReset}>
                {t('最初からやり直す', 'Start over')}
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="lp-card" aria-live="polite">
        {last && props.last && (
          <p className="lp-card__last">
            <DemoPoster media={last} size="thumb" className="lp-poster--mini" />
            <b>{titleOf(last)}</b>
            <span className="lp-chip lp-chip--solid">{answerLabel(props.last.answer)}</span>
          </p>
        )}
        {props.failed ? (
          <div className="lp-panel">
            <p>{t('作品の情報を読み込めませんでした。', 'Couldn’t load the anime.')}</p>
            <button type="button" className="lp-btn lp-btn--ghost" onClick={props.onRetry}>
              {t('もう一度', 'Try again')}
            </button>
          </div>
        ) : props.loading ? (
          <span className="lp-poster lp-poster--card lp-skel" aria-label={t('読み込み中', 'Loading')} />
        ) : cur ? (
          <>
            <DemoPoster media={cur} size="large" className="lp-poster--card" />
            <h3 className="lp-card__title">{titleOf(cur)}</h3>
            {season && <p className="lp-card__sub">{seasonLabel(season)}</p>}
            {nxt && (
              <p className="lp-card__next" aria-hidden>
                <DemoPoster media={nxt} size="thumb" className="lp-poster--mini" />
                <b>{titleOf(nxt)}</b>
              </p>
            )}
            <div className="lp-rate">
              <button type="button" className="lp-rate__btn lp-rate__btn--none" onClick={() => answer('NONE')}>
                {t('覚えてない', 'Don’t remember')}
              </button>
              {RATINGS.map((r) => (
                <button key={r.rating} type="button" className="lp-rate__btn" onClick={() => answer(r.rating)}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="lp-rate lp-rate--status">
              <button type="button" className="lp-rate__btn lp-rate__btn--line" onClick={() => answer('WANNA')}>
                {t('見たい', 'Want to watch')}
              </button>
              <button type="button" className="lp-rate__btn lp-rate__btn--line lp-rate__btn--wide" onClick={() => answer('SKIP')}>
                {t('見てない', 'Haven’t seen')}
              </button>
            </div>
          </>
        ) : (
          <div className="lp-panel">
            <p className="lp-panel__title">{t(`${props.answered}作品に答えました`, `You answered ${props.answered} anime`)}</p>
            <p>{t('答えをもとにした提案が、すぐ下に届いています。', 'Suggestions based on your answers are waiting just below.')}</p>
            <a href="#lp-match" className="lp-btn" onClick={(e) => (e.preventDefault(), props.onJump('lp-match'))}>
              {t('提案を見る ↓', 'See suggestions ↓')}
            </a>
          </div>
        )}
      </div>
    </Chapter>
  )
}

export function DemoMatch(props: {
  media: ReadonlyMap<number, Media>
  pick: MatchPick
  basisAnswer: DemoAnswer | null
  chips: readonly string[]
  failed: boolean
  hasLiked: boolean
  wanna: readonly number[]
  onDecide: (id: number, wanna: boolean) => void
  onRetry: (basis: number) => void
  onAuto: () => void
}) {
  const pick = props.pick
  const m = pick.kind === 'pick' ? props.media.get(pick.id) : undefined
  const basis = pick.kind !== 'none' ? props.media.get(pick.basis) : undefined
  return (
    <Chapter
      id="lp-match"
      no={t('2　見つける', '2  Discover')}
      title={t('答えから、次の1本を理由つきで', 'Your next anime, with the reason why')}
      lead={t(
        '高く評価した作品と似た作品を、1枚ずつ提案します。なぜ選んだかが見えるので、気になるかどうかをすぐ決められます。',
        'Anipair suggests anime similar to the ones you rated highly, one at a time. You can see why each one was picked, so it’s easy to decide.',
      )}
      side={
        props.wanna.length > 0 && (
          <p className="lp-note">
            {t('「見たい」に入れた作品: ', 'Added to Want to watch: ')}
            {props.wanna.map((id) => titleOf(props.media.get(id))).join(t('、', ', '))}
          </p>
        )
      }
    >
      <div className="lp-card" aria-live="polite">
        {!props.hasLiked ? (
          <div className="lp-panel lp-panel--dashed">
            <p className="lp-panel__title">{t('上で「良い」か「とても良い」を1つ付けると、ここに提案が届きます', 'Rate one anime “Good” or “Great” above, and a suggestion appears here')}</p>
            <button type="button" className="lp-btn lp-btn--ghost" onClick={props.onAuto}>
              {t('おまかせで答える', 'Answer for me')}
            </button>
          </div>
        ) : pick.kind === 'need' && props.failed ? (
          <div className="lp-panel">
            <p>{t('似た作品を読み込めませんでした。', 'Couldn’t load similar anime.')}</p>
            <button type="button" className="lp-btn lp-btn--ghost" onClick={() => props.onRetry(pick.basis)}>
              {t('もう一度', 'Try again')}
            </button>
          </div>
        ) : pick.kind === 'need' ? (
          <>
            <span className="lp-poster lp-poster--match lp-skel" />
            <p className="lp-card__sub">{t(`『${titleOf(basis)}』に似た作品を探しています…`, `Looking for anime like ${titleOf(basis)}…`)}</p>
          </>
        ) : pick.kind === 'pick' && m ? (
          <>
            <DemoPoster media={m} size="large" className="lp-poster--match" />
            <h3 className="lp-card__title">{titleOf(m)}</h3>
            <div className="lp-reason">
              <p className="lp-reason__text">
                {t(
                  `『${titleOf(basis)}』を「${props.basisAnswer ? answerLabel(props.basisAnswer) : ''}」にしたから`,
                  `Because you rated ${titleOf(basis)} “${props.basisAnswer ? answerLabel(props.basisAnswer) : ''}”`,
                )}
              </p>
              {props.chips.length > 0 && (
                <p className="lp-row">
                  {props.chips.map((g) => (
                    <span key={g} className="lp-chip">
                      {genreName(g)}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <div className="lp-rate lp-rate--two">
              <button type="button" className="lp-rate__btn" onClick={() => props.onDecide(pick.id, true)}>
                {t('見たい', 'Want to watch')}
              </button>
              <button type="button" className="lp-rate__btn lp-rate__btn--line" onClick={() => props.onDecide(pick.id, false)}>
                {t('興味なし', 'Not interested')}
              </button>
            </div>
          </>
        ) : (
          <div className="lp-panel">
            <p className="lp-panel__title">{t('デモの提案はここまでです', 'That’s all the suggestions in the demo')}</p>
            <p>{t('ログインすると、あなたの記録全体から提案します。', 'Once you log in, suggestions come from all of your records.')}</p>
          </div>
        )}
      </div>
    </Chapter>
  )
}

export function DemoTier(props: { media: ReadonlyMap<number, Media>; rows: readonly (readonly number[])[]; onMove: (id: number, row: number) => void }) {
  const filled = props.rows.some((r) => r.length > 0)
  return (
    <Chapter
      id="lp-tier"
      no={t('3　まとめる', '3  Rank')}
      title={t('答えた作品が、そのままTier表に', 'Your answers become a Tier list')}
      lead={t(
        '評価をもとに段へ並べた状態から始まります。並べ替えて、共有のリンクで人に見せられます。',
        'It starts with your anime already placed by rating. Rearrange them and share the list with a link.',
      )}
    >
      <div className="lp-tier">
        {props.rows.map((ids, row) => (
          <div key={row} className="lp-tier__row">
            <span className="lp-tier__name" style={{ background: tierColor(row, DEMO_TIER_COUNT) }}>
              {defaultTierName(row)}
            </span>
            <div className="lp-tier__items">
              {ids.map((id) => {
                const title = titleOf(props.media.get(id))
                return (
                  <button
                    key={id}
                    type="button"
                    className="lp-tier__item"
                    title={title}
                    aria-label={t(`${title}を下の段へ`, `Move ${title} down a tier`)}
                    onClick={() => props.onMove(id, (row + 1) % DEMO_TIER_COUNT)}
                  >
                    <DemoPoster media={props.media.get(id)} size="thumb" />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <p className="lp-note">
          {filled ? t('作品を押すと、下の段へ移ります。', 'Tap an anime to move it down a tier.') : t('上で評価した作品が、ここに並びます。', 'The anime you rate above will line up here.')}
        </p>
      </div>
    </Chapter>
  )
}

export function DemoMore(props: { counts: ReadonlyMap<DemoRating, number>; topGenre: string | null }) {
  const max = Math.max(1, ...props.counts.values())
  return (
    <section id="lp-more" className="lp-sec lp-more" aria-labelledby="lp-more-title">
      <div className="lp-more__inner">
        <h2 id="lp-more-title" className="lp-more__title">
          {t('ほかにも', 'And more')}
        </h2>
        <div className="lp-more__grid">
          <div className="lp-box">
            <h3>{t('記録の傾向', 'Trends')}</h3>
            <p className="lp-note">
              {t(
                '評価の分かれ方や、高く評価しやすいジャンルを、記録からまとめます。上のデモの答えで描いています。',
                'See how your ratings spread out and which genres you rate highly. This one is drawn from your demo answers above.',
              )}
            </p>
            <ul className="lp-bars">
              {DEMO_RATINGS.map((r) => {
                const n = props.counts.get(r) ?? 0
                return (
                  <li key={r}>
                    <span className="lp-bars__label">{RATINGS.find((x) => x.rating === r)?.label}</span>
                    <span className="lp-bars__track">
                      <span className="lp-bars__fill" style={{ width: `${Math.round((n / max) * 100)}%` }} />
                    </span>
                    <span className="lp-bars__count">{n}</span>
                  </li>
                )
              })}
            </ul>
            <p className="lp-note">
              {props.topGenre
                ? t(`高く評価しやすいジャンル: ${genreName(props.topGenre)}`, `Genre you rate highly: ${genreName(props.topGenre)}`)
                : t('評価すると、高く評価しやすいジャンルが出ます。', 'Rate some anime to see the genre you rate highly.')}
            </p>
          </div>
          <div className="lp-box">
            <h3>{t('ブラウズ', 'Browse')}</h3>
            <p className="lp-note">
              {t(
                '題名で探したり、クール・ジャンル・制作会社で絞り込んだりして、作品の詳しい情報を見られます。',
                'Search by title, or narrow down by season, genre, or studio, and see the details of each anime.',
              )}
            </p>
            {/* 見本の絵（押せない）。本物の検索はログインしてから */}
            <div className="lp-browse" aria-hidden>
              <span className="lp-browse__field">{t('葬送のフリーレン', 'Frieren')}</span>
              <span className="lp-row">
                <span className="lp-chip">{seasonLabel({ year: 2023, name: 'autumn' })}</span>
                <span className="lp-chip">{t('ジャンル', 'Genre')}</span>
                <span className="lp-chip">{t('制作会社', 'Studio')}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
