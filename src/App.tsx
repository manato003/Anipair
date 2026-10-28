import { Fragment, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AuthExpiredBanner } from './components/AuthExpiredBanner'
import { TabIcon } from './components/Icons'
import { Logo } from './components/Logo'
import { t } from './lib/i18n'
import { useAutoBackup } from './features/backup/useAutoBackup'
import { ScreenBoundary } from './components/ErrorBoundary'
import { Loading } from './components/Loading'
import { usePrefetchTaste } from './features/match/usePrefetchTaste'
import { Backfill } from './features/rate/Backfill'
import { useAnnictLogin } from './features/settings/useAnnictLogin'
import { useHistoryUnseen } from './features/settings/historySeen'
import { onAnnictAuthFailed } from './lib/authEvents'
import { UnsentWrites } from './features/unsent/UnsentWrites'
import type { GithubConnection } from './lib/github'
import { fetchViewer, ownerKeyOf } from './lib/annict'
import { reloadPage } from './lib/reload'
import {
  ACCOUNT_KEYS,
  forgetAccount,
  freezeStorage,
  hasUnclaimed,
  loadAnnictToken,
  loadGithubConnection,
  loadOwner,
  pageIsCurrent,
  saveAnnictToken,
  setAsideUnclaimed,
  settleUnclaimed,
  StorageFullError,
  switchAccount,
} from './lib/storage'
import { hasPendingWrites } from './lib/useWriteQueue'
import { useArrowNav } from './lib/useArrowNav'
import { useSwipeNav, type SwipeDir } from './lib/useSwipeNav'
import { TitleToastView } from './features/achievements/TitleToastView'
import { TipToast } from './components/TipToast'
import { SheetLayer } from './components/sheetLayer'
import { setNavigator } from './lib/navigate'
import type { SettingsRequest } from './features/settings/Settings'
import { rememberScroll, restoreScroll, scrollToTop } from './lib/pageScroll'
import { MascotPeek } from './components/MascotPeek'
import { ToTop } from './components/ToTop'
import { Analytics } from '@vercel/analytics/react'
import { syncBroadcastPrefs, useBroadcastPrefs } from './lib/broadcast'
import { analyticsEnabled, screenPath, withoutQuery } from './lib/analytics'

type Tab = 'rate' | 'match' | 'records' | 'browse' | 'settings'

// 最初に開く評価の画面のほかは、別のファイルに分けて後から読む（最初に読む JS を小さくして、起動を早くする）。
// 最初の画面が出て手が空いたら、裏で先に読んでおく（タブを押したときに待たせない。下の useEffect）
const loadMatching = () => import('./features/match/Matching')
const loadRecords = () => import('./features/records/Records')
const loadBrowse = () => import('./features/browse/Browse')
const loadSettings = () => import('./features/settings/Settings')
const Matching = lazy(() => loadMatching().then((m) => ({ default: m.Matching })))
const Records = lazy(() => loadRecords().then((m) => ({ default: m.Records })))
const Browse = lazy(() => loadBrowse().then((m) => ({ default: m.Browse })))
const Settings = lazy(() => loadSettings().then((m) => ({ default: m.Settings })))
// 「?」の中身（components/HelpButton.tsx が押したときに読む）も、手が空いたら先に読む
const loadHelp = () => Promise.all([import('./components/helpContent'), import('./components/Help'), import('./components/Tour')])

function preloadScreens(): () => void {
  const run = () => void [loadMatching, loadRecords, loadBrowse, loadSettings, loadHelp].reduce((p, load) => p.then(() => load().then(() => undefined)), Promise.resolve())
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(run, 2000)
  return () => window.clearTimeout(id)
}

// label は読んだときの言語で返す（ファイルの一番外で t() を呼ばない）
const TABS: { id: Tab; readonly label: string }[] = [
  { id: 'rate', get label() { return t('評価', 'Rate') } },
  { id: 'match', get label() { return t('マッチング', 'Match') } },
  { id: 'records', get label() { return t('記録', 'Records') } },
  { id: 'browse', get label() { return t('ブラウズ', 'Browse') } },
  { id: 'settings', get label() { return t('設定', 'Settings') } },
]

// 最後に開いていた画面（ページを読み込み直したら、そこへ戻る）。
// そのタブのあいだだけ覚える（sessionStorage）。アプリを開き直したときは、いつもの評価の画面から
const TAB_KEY = 'animax.tab'
function loadTab(signedIn: boolean): Tab {
  if (!signedIn) return 'settings'
  try {
    const saved = sessionStorage.getItem(TAB_KEY)
    const found = TABS.find((x) => x.id === saved)
    if (found) return found.id
  } catch {
    // 読めなければ、いつもの評価の画面から
  }
  return 'rate'
}

// ログインしたら、読み込み直したあとに「○○でログインしました」と一度だけ出す。「Annictでログイン」は Annict にログインしている
// アカウントでそのまま入るので、別のアカウントのつもりで前のアカウントに入っても気づけるように
const SIGNED_IN_KEY = 'anipair.signedInAs'
function loadSignedInAs(): string | null {
  try {
    return sessionStorage.getItem(SIGNED_IN_KEY)
  } catch {
    return null
  }
}
function setSignedInAs(name: string | null): void {
  try {
    if (name) sessionStorage.setItem(SIGNED_IN_KEY, name)
    else sessionStorage.removeItem(SIGNED_IN_KEY)
  } catch {
    // 出せないだけ
  }
}

function forgetTab(): void {
  try {
    sessionStorage.removeItem(TAB_KEY)
  } catch {
    // 消せなくても、開く画面が変わるだけ
  }
}

// 一度開いた画面は隠すだけで残す。作り直すと、マッチングの候補や取り消し、ブラウズの検索、記録の一覧が消えてしまうため。
// 高さは中の画面（height: 100%）に受け渡す
// enter: 直前に分類を替えた向き。隠していた画面が出るとき、その向きから入る（styles/app.css。display を戻すと動きが毎回始まる）
// 画面ごとに、シートを描く層を持つ（components/sheetLayer.ts。画面と一緒に隠れる）
function Screen(props: { active: boolean; enter: SwipeDir | null; children: ReactNode; className?: string }) {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)
  return (
    <div className={props.className ?? 'app__screen'} hidden={!props.active} data-enter={props.enter ?? undefined}>
      <SheetLayer.Provider value={layer}>
        <ScreenBoundary>
          <Suspense fallback={<Loading block label={t('画面を読み込み中', 'Loading screen')} />}>{props.children}</Suspense>
        </ScreenBoundary>
      </SheetLayer.Provider>
      <div className="app__layer" ref={setLayer} />
    </div>
  )
}

export default function App() {
  // トークンは開いたときのもの。ログイン・ログアウトでは、ページを読み込み直して変える（onTokenChange）
  const [token] = useState<string | null>(loadAnnictToken)
  // GitHub は任意。トークンとリポジトリの両方がそろったときだけ連携する
  const [github, setGithub] = useState<GithubConnection | null>(loadGithubConnection)
  const [tab, setTab] = useState<Tab>(() => loadTab(token !== null))
  // 1日1回、裏でバックアップを取る（時期でなければ何もしない）
  useAutoBackup(token, github)
  // 開いたことのあるタブ（画面を作るのは初めて開いたとき）。設定はいつも作り直すので入れない
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set(token ? [tab] : []))

  // 画面の外（コントロールセンターの近道など）から頼まれた設定の欄
  const [settingsRequest, setSettingsRequest] = useState<SettingsRequest | null>(null)
  // 新しい版を「開発記録」でまだ見ていなければ、下の「設定」に点を付ける
  const historyUnseen = useHistoryUnseen()
  // 直前に分類を替えた向き（新しい画面が入ってくる向き）
  const [enter, setEnter] = useState<SwipeDir | null>(null)
  function go(next: Tab) {
    rememberScroll(tab)
    const from = TABS.findIndex((x) => x.id === tab)
    const to = TABS.findIndex((x) => x.id === next)
    setEnter(to > from ? 'next' : to < from ? 'prev' : null)
    setTab(next)
    setVisited((v) => (v.has(next) ? v : new Set(v).add(next)))
    // 近道で開いた欄は、設定を離れたら忘れる（次に設定を開いたときは一覧から）
    if (next !== 'settings') setSettingsRequest(null)
  }

  // ログイン・ログアウト・アカウントの切り替えの最中（送信待ちを送り切るのを待っている）
  const [switching, setSwitching] = useState(false)
  // 端末の容量が足りず、切り替えられなかった
  const [switchFailed, setSwitchFailed] = useState(false)
  // ログインした直後の知らせ（読むのは描画のとき、消すのは描画のあと。開発の二重の呼び出しで消えないように）。
  // 意図したアカウントか確かめるためのものなので、閉じるまで残す（前は6秒で消えた）
  const [signedInAs, setSignedInAsShown] = useState(() => (token ? loadSignedInAs() : null))
  useEffect(() => {
    if (signedInAs) setSignedInAs(null)
  }, [signedInAs])
  // 見るサービスを GitHub と同期する（開いたときと、選び直したあと。どの画面で選び直しても。前は記録の画面を開くまで送っていなかった）
  const broadcastPrefs = useBroadcastPrefs()
  const broadcastSyncedAt = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!token || !github || broadcastSyncedAt.current === broadcastPrefs.at) return
    broadcastSyncedAt.current = broadcastPrefs.at
    syncBroadcastPrefs(github).then(
      (merged) => {
        broadcastSyncedAt.current = merged.at
      },
      () => {
        // 送れなかったら、次に開いたとき・選び直したときにまた送る
        broadcastSyncedAt.current = undefined
      },
    )
  }, [token, github, broadcastPrefs.at])

  // ログイン・ログアウト（next が null）。手順（2026-10-06 のセキュリティの点検で作り直した）:
  // 1. 送信待ちを送り切る（前の人の答えを失わない。ログアウトのあとに前の人のトークンで書かない）
  // 2. 新しいトークンの持ち主を Annict に聞く（数字の ID。ユーザー名は変えられるので使わない）
  // 3. トークンの保存と、人ごとの記録（興味なし・見てない・称号・GitHub のつなぎなど）の入れ替えを一度にして、それ以降は端末に何も書かない
  // 4. ページを読み込み直す（前の人の画面で走っていた同期・バックアップ・読み込みを止め、次の人の記録に混ぜない）
  // forget: 「ログアウトして、Anipairのデータを削除」（送り切ってから消す。先に消すと、待つあいだに届いた書き込みが残る）
  // 切り替えの最中（起動時の確かめが、進めているログアウトを打ち消さないように）
  const switchingRef = useRef(false)
  async function onTokenChange(next: string | null, opts: { forget?: boolean } = {}) {
    switchingRef.current = true
    setSwitching(true)
    // ログイン・ログアウト・切り替えのあとは、覚えた画面（ログアウトした設定など）ではなく、いつもの評価の画面から
    forgetTab()
    await untilWritesDone()
    const ownerOf = (accessToken: string) =>
      fetchViewer(accessToken).then(
        (v) => ownerKeyOf(v),
        () => null,
      )
    // 持ち主を覚えていない記録（この仕組みの前から使っている端末）なら、いまの人を確かめて、その人のものにしてから切り替える。
    // 確かめられなければ、記録は消さずに隔離し、次にログインした人に「あなたの記録ですか」と聞く（黙って渡さない・黙って消さない）
    // ログアウトしたままの端末（v0.11 まではログアウトしても記録と GitHub のつなぎが残っていた）も、持ち主が分からないので隔離する
    // （2026-10-06 のセキュリティの点検: 次にログインした人が、前の人の記録と GitHub のつなぎを丸ごと引き継いでいた）
    const prev = loadAnnictToken()
    let unclaimed = false
    if (loadOwner() === null) {
      const prevOwner = prev ? await ownerOf(prev) : null
      if (prev && prevOwner) switchAccount(prevOwner, prev)
      else unclaimed = true
    }
    // 持ち主を読めなければ、名前の分からないログインとして進む（前の人の記録は退避し、あとで分かったらその人の分を戻す）
    const viewer = next ? await fetchViewer(next).catch(() => null) : null
    const owner = viewer ? ownerKeyOf(viewer) : null
    try {
      saveAnnictToken(next)
      if (unclaimed) setAsideUnclaimed()
      if (opts.forget) forgetAccount()
      switchAccount(owner, next)
    } catch (e) {
      if (!(e instanceof StorageFullError)) throw e
      // 端末の容量が足りず、前の人の記録を退避できなかった（記録は消さずに残っている）。トークンを前のものに戻し、切り替えをやめる
      if (loadAnnictToken() !== prev) saveAnnictToken(prev)
      switchingRef.current = false
      setSwitching(false)
      setSwitchFailed(true)
      return
    }
    // 名前を読めなかったログインは '?'（ログインはできている）
    setSignedInAs(viewer ? (viewer.name ? t(`${viewer.name}（@${viewer.username}）`, `${viewer.name} (@${viewer.username})`) : `@${viewer.username}`) : next ? '?' : null)
    freezeStorage()
    reloadPage()
  }

  // 開いているあいだに一度、記録の持ち主がいまの人かを確かめる（この仕組みの前から使っている端末で持ち主を覚える・
  // ログインのときに名前を読めなかった）。別の人の記録だったら入れ替えて、読み込み直す
  // 同じ持ち主への入れ替えで読み込み直すのは、1回の起動（タブ）で1回まで（保存できない環境で、入れ替えが毎回起きて読み込み直しが続かないように）
  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetchViewer(token).then(
      (v) => {
        const key = ownerKeyOf(v)
        if (cancelled || switchingRef.current || loadAnnictToken() !== token || loadOwner() === key) return
        let switched: boolean
        try {
          switched = switchAccount(key, token)
        } catch (e) {
          // 容量が足りず退避できなかった（記録は消さずに残っている）。入れ替えずに知らせる
          if (!(e instanceof StorageFullError)) throw e
          setSwitchFailed(true)
          return
        }
        if (switched && !reloadedOnce(key)) {
          freezeStorage()
          reloadPage()
        }
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [token])

  // 持ち主を確かめられなかった以前の記録があれば、いまの人のものかを聞く（lib/storage.ts の setAsideUnclaimed）
  const [unclaimed, setUnclaimed] = useState(() => token !== null && hasUnclaimed())
  function settle(mine: boolean) {
    settleUnclaimed(mine)
    setUnclaimed(false)
    if (mine) {
      freezeStorage()
      reloadPage()
    }
  }

  // 別のタブでログイン・ログアウト・切り替えをしたら、このタブも読み込み直す（前の人のつもりのまま、次の人の記録に書かない）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && !ACCOUNT_KEYS.includes(e.key)) return
      freezeStorage()
      reloadPage()
    }
    // 戻るボタンで、前の内容のままよみがえったページ。持ち主が替わっていれば読み込み直す
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted || pageIsCurrent()) return
      freezeStorage()
      reloadPage()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  // Annict が 401 を返したら（トークンが使えない）、上に「もう一度ログイン」の帯を出す。
  // 失敗したトークンがいまのものと違えば（ログインし直したあとに遅れて届いた古い要求）無視する。トークンが変われば帯は消える
  const [expiredToken, setExpiredToken] = useState<string | null>(null)
  useEffect(() => {
    if (!token) return
    return onAnnictAuthFailed((failed) => {
      if (failed === token) setExpiredToken(failed)
    })
  }, [token])
  const authExpired = token !== null && expiredToken === token

  // 「Annict でログイン」から戻ってきたとき、ここで受け取る（成功すればトークンが入り、評価の画面に移る）
  const login = useAnnictLogin(onTokenChange)

  const showSettings = tab === 'settings' || !token
  // 表示中の画面（設定のときは null）
  const shown = showSettings ? null : tab
  // 記録・ブラウズ・設定は、ページ全体で流す（Safari の下のバーが縮むように）。評価・マッチングは1画面に収める
  const pageScroll = shown !== 'rate' && shown !== 'match'
  // ページ全体で流す画面の名前（CSS が使う。PC では表紙の一覧の記録・ブラウズだけ、画面の幅いっぱいに広げる）
  const page = pageScroll ? (shown ?? 'settings') : undefined
  // 分類を替えたら、その画面で前に流した位置に戻す（初めては先頭）
  useLayoutEffect(() => restoreScroll(tab), [tab])
  useEffect(() => {
    if (!token) return
    try {
      sessionStorage.setItem(TAB_KEY, tab)
    } catch {
      // 覚えられなくても、読み込み直したときに評価の画面から始まるだけ
    }
  }, [token, tab])
  // 評価の画面を出して少したったら、好みの先読みを裏で1回だけ始める（マッチングや記録の初回を速くする）
  usePrefetchTaste(token, shown === 'rate')
  // 最初の画面が出て手が空いたら、ほかの画面の JS を裏で読んでおく
  useEffect(() => preloadScreens(), [])

  // 画面の外（コントロールセンターの近道など）からの移動。設定の欄へは、設定がその欄のまとまりを開いて送る
  useEffect(() => {
    setNavigator((d) => {
      go(d.tab)
      const section = d.anchor
      if (d.tab === 'settings' && section) setSettingsRequest((cur) => ({ section, n: (cur?.n ?? 0) + 1 }))
    })
    return () => setNavigator(null)
  })

  // 中身を左右に払うか、PC の ← → で分類を替える（ログインしていないあいだは設定だけなので替えない）
  const mainRef = useRef<HTMLElement>(null)
  const step = (dir: SwipeDir) => {
    const i = TABS.findIndex((x) => x.id === tab)
    const next = TABS[i + (dir === 'next' ? 1 : -1)]
    if (next) go(next.id)
  }
  useSwipeNav(mainRef, step, token !== null && !switching)
  useArrowNav(step, token !== null && !switching)

  return (
    <div className="app" data-page={page}>
      {/* アクセス解析: 開いた画面だけを数える（lib/analytics.ts） */}
      {analyticsEnabled(window.location.hostname) && (
        <Analytics route={screenPath(tab, token !== null)} path={screenPath(tab, token !== null)} beforeSend={withoutQuery} />
      )}
      {/* 帯を主な画面の上に出すための枠（広い画面では上の帯のタブのすぐ下になる） */}
      <div className="app__body">
        {switching && (
          <div className="auth-banner" role="status">
            <p className="auth-banner__text">{t('記録を送り終えてから切り替えます…', 'Switching after your records finish sending…')}</p>
          </div>
        )}
        {signedInAs && !switching && (
          <div className="auth-banner" role="status">
            <p className="auth-banner__text">
              {signedInAs === '?'
                ? t(
                    'ログインしました。アカウント名を確かめられなかったので、設定の「Annict連携」で確かめてください。',
                    'You’re logged in. We couldn’t confirm the account name, so please check it under “Annict connection” in Settings.',
                  )
                : t(`${signedInAs}でログインしました。`, `Logged in as ${signedInAs}.`)}
            </p>
            <div className="auth-banner__actions">
              <button type="button" className="link" onClick={() => setSignedInAsShown(null)}>
                {t('閉じる', 'Close')}
              </button>
            </div>
          </div>
        )}
        {switchFailed && !switching && (
          <div className="auth-banner" role="alert">
            <p className="auth-banner__text">
              {t(
                'この端末の保存容量が足りないため、アカウントを切り替えられませんでした。記録はそのまま残っています。ほかのサイトのデータを消すなどして空きを作ってから、もう一度お試しください。',
                'This device doesn’t have enough storage, so the account couldn’t be switched. Your records are still intact. Free up some space, for example by clearing data from other sites, and try again.',
              )}
            </p>
            <div className="auth-banner__actions">
              <button type="button" className="link" onClick={() => setSwitchFailed(false)}>
                {t('閉じる', 'Close')}
              </button>
            </div>
          </div>
        )}
        {unclaimed && !switching && (
          <div className="auth-banner" role="alert">
            <p className="auth-banner__text">
              {t(
                'この端末に、持ち主を確かめられなかった以前の記録（興味なし・見てない・称号など）があります。あなたの記録なら、いまの記録と合わせます。',
                'This device has earlier records (Not interested, Haven’t seen, titles, and so on) whose owner couldn’t be confirmed. If they’re yours, they’ll be merged with your current records.',
              )}
            </p>
            <div className="auth-banner__actions">
              <button type="button" className="btn btn--primary" onClick={() => settle(true)}>
                {t('自分の記録', 'These are mine')}
              </button>
              <button type="button" className="link" onClick={() => settle(false)}>
                {t('自分のものではない（消す）', 'Not mine (delete)')}
              </button>
            </div>
          </div>
        )}
        {authExpired && <AuthExpiredBanner onOpenSettings={() => go('settings')} onDismiss={() => setExpiredToken(null)} />}
        {/* 前回送れなかった記録（送る前に閉じた・失敗したまま閉じた）。送るかどうかを聞く */}
        {token && !authExpired && <UnsentWrites key={token} token={token} />}
        <main className="app__main" ref={mainRef}>
          {showSettings && (
            <Screen className="app__settings" active enter={enter}>
              <Settings
                annictToken={token}
                github={github}
                onAnnictTokenChange={onTokenChange}
                onGithubChange={setGithub}
                loginBusy={login.busy}
                loginError={login.error}
                request={settingsRequest}
                active={showSettings}
              />
            </Screen>
          )}
          {token && (
            <Fragment key={token}>
              {visited.has('rate') && (
                <Screen active={shown === 'rate'} enter={enter}>
                  <Backfill token={token} github={github} active={shown === 'rate'} />
                </Screen>
              )}
              {visited.has('match') && (
                <Screen active={shown === 'match'} enter={enter}>
                  <Matching annictToken={token} github={github} active={shown === 'match'} />
                </Screen>
              )}
              {visited.has('records') && (
                <Screen active={shown === 'records'} enter={enter}>
                  <Records token={token} github={github} active={shown === 'records'} />
                </Screen>
              )}
              {visited.has('browse') && (
                <Screen active={shown === 'browse'} enter={enter}>
                  <Browse token={token} active={shown === 'browse'} />
                </Screen>
              )}
            </Fragment>
          )}
        </main>
      </div>
      <ToTop enabled={pageScroll} />
      {/* アニとペアが、ときどき下の帯の陰から顔を出す（記録・ブラウズ・設定だけ。答える画面には出さない） */}
      {token && <MascotPeek enabled={pageScroll && !switching} />}
      {/* 称号を手に入れたときの右上の知らせ */}
      {token && <TitleToastView />}
      {/* 押した結果が画面に出ない操作の、一度だけの知らせ（lib/tips.ts） */}
      {token && <TipToast />}
      {/* ログインする前は、最初の画面（設定のログイン）しか使えないので、分類の帯を出さない */}
      {token && (
        <nav className="tabs" aria-label={t('画面の切り替え', 'Screens')}>
          {/* 広い画面だけ、上の帯の左に出す。押すとページを読み込み直す（開いていた画面に戻る） */}
          <button type="button" className="tabs__brand" aria-label={t('Anipair（読み込み直す）', 'Anipair (reload)')} title={t('読み込み直す', 'Reload')} onClick={reloadPage}>
            <Logo size="small" />
          </button>
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              className="tabs__item"
              aria-current={tab === x.id ? 'page' : undefined}
              // いまの分類をもう一度押したら、いちばん上へ
              onClick={() => (x.id === tab ? scrollToTop() : go(x.id))}
            >
              <TabIcon name={x.id} active={tab === x.id} />
              <span className="tabs__label">{x.label}</span>
              {/* 点は飾り（タブの名前は「設定」のまま。言葉の「新しい版」は設定の「最新情報」に出す） */}
              {x.id === 'settings' && historyUnseen && <span className="viewswitch__dot" aria-hidden />}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

// 送信待ちが無くなるまで待つ（長くても20秒。Annict に届かず送れないときは、控え（writeJournal）から次に開いたときに送り直せる）
async function untilWritesDone(): Promise<void> {
  const until = Date.now() + 20_000
  while (hasPendingWrites() && Date.now() < until) await new Promise((r) => setTimeout(r, 200))
}

// この起動（タブ）で、この持ち主に入れ替えて読み込み直したか。まだなら印を付ける
function reloadedOnce(owner: string): boolean {
  try {
    if (sessionStorage.getItem('anipair.reidentified') === owner) return true
    sessionStorage.setItem('anipair.reidentified', owner)
  } catch {
    // 読めない環境では、読み込み直さない（続けて読み込み直すよりよい）
    return true
  }
  return false
}
