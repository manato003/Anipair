import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
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
import { loadAnnictToken, loadGithubConnection } from './lib/storage'

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
  const [token, setToken] = useState<string | null>(loadAnnictToken)
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

  function onTokenChange(next: string | null) {
    setToken(next)
    // 別のトークンの画面を引き継がないよう、開いたタブの記憶も戻す（画面は token を key にして作り直される）
    setVisited(new Set(['rate']))
    if (next) setTab('rate')
  }

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
