import { Fragment, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { LangToggle } from '../../components/LangToggle'
import { Spinner } from '../../components/Loading'
import { Logo } from '../../components/Logo'
import { fetchViewer } from '../../lib/annict'
import { startLogin } from '../../lib/annictLogin'
import { TAGLINE_PHRASES, TAGLINE_PHRASES_EN } from '../../lib/brand'
import { getLang, t } from '../../lib/i18n'
import { shikiTitle } from '../../lib/names'
import { seasonLabel } from '../../lib/season'
import { applyTheme, loadTheme } from '../../lib/theme'
import { AboutBlock } from '../settings/AboutBlock'
import { LegalLinks } from '../settings/LegalLinks'
import { TokenForm } from '../settings/TokenForm'
import { likedOf, pendingOf, pickMatch, ratingCounts, sharedGenres, tierRowsOf, topGenre, usableMedia } from './demo'
import { DEMO_QUEUE, DEMO_SAMPLE, DEMO_SHELVES, type DemoAnswer } from './demoWorks'
import { DemoMatch, DemoMore, DemoPoster, DemoRate, DemoTier } from './LandingDemo'
import { useLandingMedia } from './useLandingMedia'

async function verifyAnnictToken(token: string): Promise<string> {
  const v = await fetchViewer(token)
  return t(`${v.name}（@${v.username}）で連携しました`, `Connected as ${v.name} (@${v.username})`)
}

// 段へ流す（URL に # を付けない。動きを減らす設定なら飛ぶだけ）
function jump(id: string) {
  const reduce = document.documentElement.dataset.motion === 'reduce'
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

// 最上段の薄明の空に出る三日月。光るのは右下の細い弧だけで、弧の先ほど淡くする。欠けた所は地球照でうっすら見せる
function Crescent() {
  return (
    <svg className="lp-moon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <mask id="lp-moon-lit">
          <rect width="48" height="48" fill="#fff" />
          <circle cx="19" cy="20" r="18" fill="#000" />
        </mask>
        <radialGradient id="lp-moon-fade" cx="0.82" cy="0.82" r="0.75">
          <stop offset="0" stopColor="#f6e8ce" stopOpacity="0.62" />
          <stop offset="1" stopColor="#f6e8ce" stopOpacity="0.18" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="18" className="lp-moon__earthshine" />
      <circle cx="24" cy="24" r="18" fill="url(#lp-moon-fade)" mask="url(#lp-moon-lit)" />
    </svg>
  )
}

const jumpTo = (id: string) => (e: MouseEvent) => {
  e.preventDefault()
  jump(id)
}

// ログインする前の紹介ページ。
// 最上段（全体のイメージと棚）→ Annictとは → デモの一本道（評価のカード → 理由つきの提案 → Tier表）→ ほかにも → ログイン → フッター。
// デモの答えは Annict に送らず端末にも残さない。ログインしても引き継がない。
// loggedOut: この端末でログアウトしたあと。「Annictでログイン」は、ブラウザで Annict にログインしているアカウントでそのまま入るので、
// 別のアカウントに替えたい人に入り方を添える（Anipair からは Annict のログインを見られも消せもしないので、状態は言わずに手順だけ）
export function Landing(props: {
  clientId: string | null
  busy: boolean
  error: string | null
  loggedOut?: boolean
  onAnnictTokenChange: (token: string | null) => void
}) {
  const en = getLang() === 'en'
  // 出しているあいだ、ページの地・上端の帯・ブラウザの枠の色を紹介ページの色にする（styles/landing.css の :root[data-landing]）。
  // 枠の色（theme-color）は applyTheme が --theme-chrome から決めるので、付け外しのたびに当て直す。
  // 下半分まで流したら 'end' にして、端より先へ引っぱったときに見える html の単色を下端の色に替える（Safari はここをこの単色で塗る）
  useEffect(() => {
    const root = document.documentElement
    root.dataset.landing = ''
    applyTheme(loadTheme())
    const onScroll = () => {
      const end = window.scrollY > (root.scrollHeight - window.innerHeight) / 2 ? 'end' : ''
      if (root.dataset.landing !== end) root.dataset.landing = end
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      delete root.dataset.landing
      applyTheme(loadTheme())
    }
  }, [])
  const { media, state, retry, similar, similarFailed, askSimilar } = useLandingMedia()
  const usable = (id: number) => usableMedia(media.get(id))

  // デモの答え（画面の中だけ）
  const [answers, setAnswers] = useState<ReadonlyMap<number, DemoAnswer>>(new Map())
  const [order, setOrder] = useState<readonly number[]>([])
  const [front, setFront] = useState<number | null>(null)
  const [decided, setDecided] = useState<ReadonlyMap<number, boolean>>(new Map())
  const [moved, setMoved] = useState<ReadonlyMap<number, number>>(new Map())

  const answer = (id: number, a: DemoAnswer) => {
    setAnswers((cur) => new Map(cur).set(id, a))
    setOrder((cur) => [...cur.filter((x) => x !== id), id])
    if (front === id) setFront(null)
  }
  const auto = () => {
    const add = [...DEMO_SAMPLE].filter(([id]) => !answers.has(id) && usable(id))
    setAnswers((cur) => new Map([...cur, ...add]))
    setOrder((cur) => [...cur, ...add.map(([id]) => id)])
    setFront(null)
  }
  const reset = () => {
    setAnswers(new Map())
    setOrder([])
    setFront(null)
    setDecided(new Map())
    setMoved(new Map())
  }

  const pending = pendingOf(DEMO_QUEUE, answers, front, usable)
  const last = order.length > 0 ? { id: order[order.length - 1], answer: answers.get(order[order.length - 1])! } : null
  const liked = likedOf(order, answers)
  const excluded = useMemo(() => new Set([...answers.keys(), ...decided.keys()]), [answers, decided])
  const pick = pickMatch(liked, similar, media, excluded)
  const needBasis = pick.kind === 'need' ? pick.basis : null
  useEffect(() => {
    if (needBasis !== null && similarFailed !== needBasis) askSimilar(needBasis)
  }, [needBasis, similarFailed, askSimilar])
  const pickMedia = pick.kind === 'pick' ? media.get(pick.id) : undefined
  const wanna = [...decided].filter(([, w]) => w).map(([id]) => id)

  const loginButton = (className: string) =>
    props.clientId && (
      <button
        type="button"
        className={className}
        disabled={props.busy}
        onClick={() => startLogin({ clientId: props.clientId!, origin: window.location.origin, assign: (url) => window.location.assign(url) })}
      >
        {props.busy ? (
          <>
            <Spinner />
            {t('ログインしています…', 'Logging in…')}
          </>
        ) : (
          t('Annictでログイン', 'Log in with Annict')
        )}
      </button>
    )

  // 開発者向け: 個人用アクセストークン（ログインのボタンが無いときは、最後のログインの段に開いて置く）
  const devToken = (
    <details className="settings__dev lp-dev" open={!props.clientId}>
      <summary>{t('開発者向け: 個人用アクセストークンで使う', 'For developers: use a personal access token')}</summary>
      <p className="settings__lead">
        {t('Annictの', 'In Annict’s ')}
        <a href="https://annict.com/settings/apps" target="_blank" rel="noreferrer">
          {t('アプリケーション設定', 'application settings')}
        </a>
        {t(
          'で、スコープを「読み込み + 書き込み」にして個人用アクセストークンを作成し、下の欄に貼り付けてください。',
          ', create a personal access token with the “Read + Write” scope, and paste it below.',
        )}
        {/* Annict の API利用規約 第4条（2026-11-25 施行）: トークンでできることと、他人に教えないことを説明する */}
        {t(
          'このトークンがあると、あなたのAnnictの記録を読んだり、記録や感想を付けたりできます。ほかの人には教えないでください。',
          ' This token can read your Annict records and add records and reviews. Don’t share it with anyone.',
        )}
      </p>
      <TokenForm label={t('Annictの個人用アクセストークン', 'Annict personal access token')} verify={verifyAnnictToken} save={(token) => props.onAnnictTokenChange(token)} />
    </details>
  )

  const tagline = en ? TAGLINE_PHRASES_EN : TAGLINE_PHRASES
  return (
    <div className="lp">
      <header className="lp-hero">
        {/* 夕方のオレンジは、ログインのボタンのすぐ下まで */}
        <div className="lp-hero__top">
          <Crescent />
          <div className="lp-bar">
            <Logo size="small" />
            <LangToggle className="lp-btn lp-btn--ghost lp-btn--small" />
            {/* 使っている人がすぐログインに着けるように */}
            <a href="#lp-start" className="lp-btn lp-btn--ghost lp-btn--small" onClick={jumpTo('lp-start')}>
              {t('ログイン', 'Log in')}
            </a>
          </div>
          <div className="lp-hero__body">
            <p className="lp-kicker">{t('Annictの非公式アプリ', 'An unofficial app for Annict')}</p>
            <h1 className="lp-hero__title">
              {tagline.map((phrase, i) => (
                <Fragment key={phrase}>
                  {/* 英語は語のあいだに空白が要る（日本語の句は詰めて並べる） */}
                  {en && i > 0 && ' '}
                  <span>{phrase}</span>
                </Fragment>
              ))}
            </h1>
            <p className="lp-lead">
              {t(
                'Annictの視聴記録を、タップだけで付けられるアプリです。見たアニメを評価していくと、好みに合う作品を理由つきで提案します。',
                'Anipair lets you log your anime on Annict with just a tap. Rate the anime you’ve watched, and it suggests new ones that match your taste, with the reason why.',
              )}
            </p>
            {/* 英語のとき: 作品名はローマ字の題名で出し、作品のデータの一部は日本語のままであることを、ログインの前に伝える */}
            {en && <p className="lp-note">Anime titles are shown in romanized Japanese. Some details, like episode titles and synopses, stay in Japanese.</p>}
            <div className="lp-row lp-hero__actions">
              {loginButton('lp-btn lp-btn--primary lp-btn--large')}
              <a href="#lp-try" className="lp-btn lp-btn--ghost lp-btn--large" onClick={jumpTo('lp-try')}>
                {t('ログインせずに試す ↓', 'Try it without logging in ↓')}
              </a>
            </div>
            {props.error && (
              <p className="lp-error" role="alert">
                {props.error}
              </p>
            )}
            <p className="lp-note">
              {t('Annictを使ったことがない方は、', 'New to Annict? See ')}
              <a href="#lp-annict" onClick={jumpTo('lp-annict')}>
                {t('Annictとは', 'What is Annict')}
              </a>
              {t('をご覧ください。', '.')}
            </p>
          </div>
        </div>
        {/* 棚: 全体のイメージ。押すと第1章の評価のカードにその作品を出す（棚では評価させない） */}
        <div className="lp-shelves">
          {DEMO_SHELVES.map((shelf) => {
            const ids = shelf.ids.filter(usable)
            return (
              <section key={`${shelf.season.year}-${shelf.season.name}`} className="lp-shelf" aria-label={seasonLabel(shelf.season)}>
                <h2 className="lp-shelf__title">{seasonLabel(shelf.season)}</h2>
                <div className="lp-shelf__row">
                  {state === 'ready'
                    ? ids.map((id) => {
                        const m = media.get(id)
                        const title = m ? shikiTitle(m.title, '') : ''
                        return (
                          <a
                            key={id}
                            href="#lp-try"
                            className="lp-shelf__item"
                            aria-label={t(`${title}を評価のカードで出す`, `Show ${title} on the rating card`)}
                            onClick={(e) => {
                              e.preventDefault()
                              setFront(id)
                              jump('lp-try')
                            }}
                          >
                            <DemoPoster media={m} size="thumb" />
                            <span className="lp-shelf__name">{title}</span>
                          </a>
                        )
                      })
                    : Array.from({ length: 9 }, (_, i) => <span key={i} className="lp-shelf__item lp-poster lp-skel" />)}
                </div>
              </section>
            )
          })}
        </div>
      </header>

      <section id="lp-annict" className="lp-sec lp-annict" aria-labelledby="lp-annict-title">
        <div className="lp-annict__inner">
          <h2 id="lp-annict-title" className="lp-annict__title">
            {t('Annictとは', 'What is Annict')}
          </h2>
          <div className="lp-annict__body">
            <p>
              {t(
                'Annict（アニクト）は、見たアニメを記録して、ほかの人と共有できる日本のサービスです。10年以上続いていて、作品やエピソードの情報が整っています。',
                'Annict is a Japanese service for logging the anime you watch and sharing it with others. It has been running for over ten years, with well-kept information on anime and episodes.',
              )}
            </p>
            <ul className="lp-list">
              <li>{t('Anipairは、Annictのアカウントでログインして使います。', 'You log in to Anipair with your Annict account.')}</li>
              <li>
                {t(
                  '付けた記録はAnnictに保存されます。Annictのサイトからも同じ記録が見え、Anipairが止まっても記録は消えません。',
                  'Your records are saved on Annict. You can see the same records on the Annict website, and they stay even if Anipair stops.',
                )}
              </li>
              <li>{t('AnipairはAnnictの非公式アプリで、Annictが運営しているものではありません。', 'Anipair is an unofficial app and is not run by Annict.')}</li>
            </ul>
            <p className="lp-row">
              <a href="https://annict.com/" target="_blank" rel="noreferrer">
                {t('Annictのサイトを見る', 'Visit Annict')}
              </a>
              <a href="https://annict.com/sign_up" target="_blank" rel="noreferrer">
                {t('Annictで新規登録', 'Sign up on Annict')}
              </a>
            </p>
          </div>
        </div>
      </section>

      <DemoRate
        media={media}
        loading={state === 'loading'}
        failed={state === 'failed'}
        onRetry={retry}
        current={pending[0] ?? null}
        next={pending[1] ?? null}
        last={last}
        answered={order.length}
        onAnswer={answer}
        onAuto={auto}
        onReset={reset}
        onJump={jump}
      />
      <DemoMatch
        media={media}
        pick={pick}
        basisAnswer={pick.kind === 'pick' ? (answers.get(pick.basis) ?? null) : null}
        chips={pickMedia && pick.kind === 'pick' ? sharedGenres(pickMedia, media.get(pick.basis)) : []}
        failed={needBasis !== null && similarFailed === needBasis}
        hasLiked={liked.length > 0}
        wanna={wanna}
        onDecide={(id, w) => setDecided((cur) => new Map(cur).set(id, w))}
        onRetry={askSimilar}
        onAuto={auto}
      />
      <DemoTier media={media} rows={tierRowsOf(order, answers, moved)} onMove={(id, row) => setMoved((cur) => new Map(cur).set(id, row))} />
      <DemoMore counts={ratingCounts(answers)} topGenre={topGenre(liked, media)} />

      <section id="lp-start" className="lp-sec lp-start" aria-labelledby="lp-start-title">
        <div className="lp-start__inner">
          <h2 id="lp-start-title" className="lp-start__title">
            {t('この続きを、あなたのAnnictの記録で。', 'Continue with your own Annict records.')}
          </h2>
          <p className="lp-note">
            {t(
              'ログインすると、最初の使い方の案内から始まります。デモで付けた答えはAnnictに送られず、このページを閉じると消えます。',
              'After you log in, a short guide shows you how to use the app. Your demo answers aren’t sent to Annict and disappear when you close this page.',
            )}
          </p>
          {loginButton('lp-btn lp-btn--primary lp-btn--large')}
          {/* ボタンの下の補足。多くの人に関わる新規登録を先に（別のアカウントは少数） */}
          <ul className="lp-notes">
            <li>
              {t('アカウントをお持ちでない方は、', 'Anipair uses an account on Annict, a Japanese anime tracking service. If you don’t have one, ')}
              <a href="https://annict.com/sign_up" target="_blank" rel="noreferrer">
                {t('Annictで新規登録', 'sign up on Annict')}
              </a>
              {t('してください。', '.')}
            </li>
            {props.clientId && props.loggedOut && (
              <li>
                {t(
                  '別のアカウントで連携するときは、先にAnnictのサイトでそのアカウントにログインしてください。',
                  'To connect a different account, first log in to that account on the Annict website. ',
                )}
                {/* 同じ画面のまま開く（ホーム画面に置いたアプリは Safari と別にログインを持つので、新しいタブだとアプリの中のログインを替えられない） */}
                <a href="https://annict.com/">{t('Annictを開く', 'Open Annict')}</a>
              </li>
            )}
          </ul>
          {/* ログインのボタンが無いとき（ローカルの開発など）は、トークンの欄をここに開いて置く */}
          {!props.clientId && devToken}
        </div>
      </section>

      <footer className="lp-sec lp-foot">
        <div className="lp-foot__inner">
          {/* アプリの説明・規約・開発者向けは、開いたときだけ */}
          <details className="lp-fold">
            <summary>{t('このアプリについて', 'About this app')}</summary>
            <AboutBlock showTagline={false} welcome />
          </details>
          {props.clientId && devToken}
          <p>{t('AnipairはAnnictの非公式アプリです。作品の情報と表紙はShikimoriから取得しています。', 'Anipair is an unofficial Annict app. Anime information and posters come from Shikimori.')}</p>
          <LegalLinks className="lp-row" />
        </div>
      </footer>
    </div>
  )
}
