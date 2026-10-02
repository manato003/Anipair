import { Fragment, useState, type ReactNode } from 'react'
import { useAutoBackup } from './features/backup/useAutoBackup'
import { Browse } from './features/browse/Browse'
import { Matching } from './features/match/Matching'
import { Backfill } from './features/rate/Backfill'
import { Records } from './features/records/Records'
import { Settings } from './features/settings/Settings'
import { useAnnictLogin } from './features/settings/useAnnictLogin'
import type { GithubConnection } from './lib/github'
import { loadAnnictToken, loadGithubConnection } from './lib/storage'

type Tab = 'rate' | 'match' | 'records' | 'browse' | 'settings'

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
      {props.children}
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

  // 「Annict でログイン」から戻ってきたとき、ここで受け取る（成功すればトークンが入り、評価の画面に移る）
  const login = useAnnictLogin(onTokenChange)

  const showSettings = tab === 'settings' || !token
  // 表示中の画面（設定のときは null）
  const shown = showSettings ? null : tab

  return (
    <div className="app">
      <main className="app__main">
        {showSettings && (
          <Settings
            annictToken={token}
            github={github}
            onAnnictTokenChange={onTokenChange}
            onGithubChange={setGithub}
            loginBusy={login.busy}
            loginError={login.error}
          />
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
                <Records token={token} active={shown === 'records'} />
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
      <nav className="tabs" aria-label="画面の切り替え">
        {/* 広い画面だけ、上の帯の左に出す */}
        <span className="tabs__brand" aria-hidden>
          Anipair
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
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
