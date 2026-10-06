import { Fragment, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthExpiredBanner } from './components/AuthExpiredBanner'
import { TabIcon } from './components/Icons'
import { Logo } from './components/Logo'
import { useAutoBackup } from './features/backup/useAutoBackup'
import { Loading } from './components/Loading'
import { usePrefetchTaste } from './features/match/usePrefetchTaste'
import { Backfill } from './features/rate/Backfill'
import { useAnnictLogin } from './features/settings/useAnnictLogin'
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
  switchAccount,
} from './lib/storage'
import { hasPendingWrites } from './lib/useWriteQueue'

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

function preloadScreens(): () => void {
  const run = () => void [loadMatching, loadRecords, loadBrowse, loadSettings].reduce((p, load) => p.then(() => load().then(() => undefined)), Promise.resolve())
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(run, 2000)
  return () => window.clearTimeout(id)
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'rate', label: '評価' },
  { id: 'match', label: 'マッチング' },
  { id: 'records', label: '記録' },
  { id: 'browse', label: 'ブラウズ' },
  { id: 'settings', label: '設定' },
]

// 一度開いた画面は隠すだけで残す。作り直すと、マッチングの候補や取り消し、ブラウズの検索、記録の一覧が消えてしまうため。
// 高さは中の画面（height: 100%）に受け渡す
function Screen(props: { active: boolean; children: ReactNode }) {
  return (
    <div className="app__screen" hidden={!props.active}>
      <Suspense fallback={<Loading block label="画面を読み込み中" />}>{props.children}</Suspense>
    </div>
  )
}

export default function App() {
  // トークンは開いたときのもの。ログイン・ログアウトでは、ページを読み込み直して変える（onTokenChange）
  const [token] = useState<string | null>(loadAnnictToken)
  // GitHub は任意。トークンとリポジトリの両方がそろったときだけ連携する
  const [github, setGithub] = useState<GithubConnection | null>(loadGithubConnection)
  const [tab, setTab] = useState<Tab>(token ? 'rate' : 'settings')
  // 1日1回、裏でバックアップを取る（時期でなければ何もしない）
  useAutoBackup(token, github)
  // 開いたことのあるタブ（画面を作るのは初めて開いたとき）。設定はいつも作り直すので入れない
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set(token ? ['rate'] : []))

  function go(next: Tab) {
    setTab(next)
    setVisited((v) => (v.has(next) ? v : new Set(v).add(next)))
  }

  // ログイン・ログアウト・アカウントの切り替えの最中（送信待ちを送り切るのを待っている）
  const [switching, setSwitching] = useState(false)

  // ログイン・ログアウト（next が null）。手順（2026-10-06 のセキュリティの点検で作り直した）:
  // 1. 送信待ちを送り切る（前の人の答えを失わない。ログアウトのあとに前の人のトークンで書かない）
  // 2. 新しいトークンの持ち主を Annict に聞く（数字の ID。ユーザー名は変えられるので使わない）
  // 3. トークンの保存と、人ごとの記録（パス・見てない・称号・GitHub のつなぎなど）の入れ替えを一度にして、それ以降は端末に何も書かない
  // 4. ページを読み込み直す（前の人の画面で走っていた同期・バックアップ・読み込みを止め、次の人の記録に混ぜない）
  // forget: 「ログアウトして、この端末の記録も消す」（送り切ってから消す。先に消すと、待つあいだに届いた書き込みが残る）
  // 切り替えの最中（起動時の確かめが、進めているログアウトを打ち消さないように）
  const switchingRef = useRef(false)
  async function onTokenChange(next: string | null, opts: { forget?: boolean } = {}) {
    switchingRef.current = true
    setSwitching(true)
    await untilWritesDone()
    const ownerOf = (t: string) =>
      fetchViewer(t).then(
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
    const owner = next ? await ownerOf(next) : null
    saveAnnictToken(next)
    if (unclaimed) setAsideUnclaimed()
    if (opts.forget) forgetAccount()
    switchAccount(owner, next)
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
        if (switchAccount(key, token) && !reloadedOnce(key)) {
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
  // 評価の画面を出して少したったら、好みの先読みを裏で1回だけ始める（マッチングや記録の初回を速くする）
  usePrefetchTaste(token, shown === 'rate')
  // 最初の画面が出て手が空いたら、ほかの画面の JS を裏で読んでおく
  useEffect(() => preloadScreens(), [])

  return (
    <div className="app">
      {/* 帯を主な画面の上に出すための枠（広い画面では上の帯のタブのすぐ下になる） */}
      <div className="app__body">
        {switching && (
          <div className="auth-banner" role="status">
            <p className="auth-banner__text">記録を送り終えてから切り替えます…</p>
          </div>
        )}
        {unclaimed && !switching && (
          <div className="auth-banner" role="alert">
            <p className="auth-banner__text">
              この端末に、持ち主を確かめられなかった以前の記録（パス・見てない・称号など）があります。あなたの記録なら、いまの記録と合わせます。
            </p>
            <div className="auth-banner__actions">
              <button type="button" className="btn btn--primary" onClick={() => settle(true)}>
                自分の記録
              </button>
              <button type="button" className="link" onClick={() => settle(false)}>
                自分のものではない（消す）
              </button>
            </div>
          </div>
        )}
        {authExpired && <AuthExpiredBanner onOpenSettings={() => go('settings')} onDismiss={() => setExpiredToken(null)} />}
        {/* 前回送れなかった記録（送る前に閉じた・失敗したまま閉じた）。送るかどうかを聞く */}
        {token && !authExpired && <UnsentWrites key={token} token={token} />}
        <main className="app__main">
          {showSettings && (
            <Suspense fallback={<Loading block label="画面を読み込み中" />}>
              <Settings
                annictToken={token}
                github={github}
                onAnnictTokenChange={onTokenChange}
                onGithubChange={setGithub}
                loginBusy={login.busy}
                loginError={login.error}
              />
            </Suspense>
          )}
          {token && (
            <Fragment key={token}>
              {visited.has('rate') && (
                <Screen active={shown === 'rate'}>
                  <Backfill token={token} github={github} active={shown === 'rate'} />
                </Screen>
              )}
              {visited.has('match') && (
                <Screen active={shown === 'match'}>
                  <Matching annictToken={token} github={github} active={shown === 'match'} />
                </Screen>
              )}
              {visited.has('records') && (
                <Screen active={shown === 'records'}>
                  <Records token={token} github={github} active={shown === 'records'} />
                </Screen>
              )}
              {visited.has('browse') && (
                <Screen active={shown === 'browse'}>
                  <Browse token={token} active={shown === 'browse'} />
                </Screen>
              )}
            </Fragment>
          )}
        </main>
      </div>
      <nav className="tabs" aria-label="画面の切り替え">
        {/* 広い画面だけ、上の帯の左に出す */}
        <span className="tabs__brand" aria-hidden>
          <Logo size="small" />
        </span>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tabs__item"
            aria-current={tab === t.id ? 'page' : undefined}
            disabled={!token && t.id !== 'settings'}
            onClick={() => go(t.id)}
          >
            <TabIcon name={t.id} active={tab === t.id} />
            <span className="tabs__label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

// 送信待ちが無くなるまで待つ（長くても20秒。Annict が止まっていて送れないときは、控え（writeJournal）から次に開いたときに送り直せる）
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
