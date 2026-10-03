import { annictClientId } from '../../lib/annictLogin'
import type { GithubConnection } from '../../lib/github'
import { AboutBlock } from './AboutBlock'
import { AccountBlock } from './AccountBlock'
import { BackupBlock } from './BackupBlock'
import { GithubBlock } from './GithubBlock'
import { Keybinds } from './Keybinds'
import { Welcome } from './Welcome'

export function Settings(props: {
  annictToken: string | null
  github: GithubConnection | null
  onAnnictTokenChange: (token: string | null) => void
  onGithubChange: (github: GithubConnection | null) => void
  // 「Annict でログイン」から戻ってきて、受け取っている最中か・失敗したときの文言
  loginBusy?: boolean
  loginError?: string | null
  // 指定が無ければビルドに埋め込まれた client_id を使う（無ければログインのボタンを出さない）
  clientId?: string | null
}) {
  // ログインする前は、最初の画面として説明とログインだけを出す（GitHub やキーバインドは、使い始めてからでよい）
  if (!props.annictToken) {
    return (
      <section className="settings">
        <Welcome
          clientId={props.clientId === undefined ? annictClientId() : props.clientId}
          busy={props.loginBusy ?? false}
          error={props.loginError ?? null}
          onAnnictTokenChange={props.onAnnictTokenChange}
        />
        <AboutBlock />
      </section>
    )
  }
  return (
    <section className="settings settings--nav">
      <SectionNav />
      <div className="settings__main">
        <AccountBlock token={props.annictToken} onChange={props.onAnnictTokenChange} />
        <GithubBlock github={props.github} onChange={props.onGithubChange} />
        <BackupBlock annictToken={props.annictToken} github={props.github} />
        {/* このアプリについては大切な説明なので、長いキーバインドの一覧より前に置く（キーバインドは PC だけで使うもの） */}
        <AboutBlock />
        <Keybinds />
      </div>
    </section>
  )
}

// 広い画面だけ、左に出るページ内の目次（押すとその項目へ動く）。狭い画面では出さない
const SECTIONS = [
  { id: 'settings-account', label: 'Annict 連携' },
  { id: 'settings-github', label: 'GitHub 連携' },
  { id: 'settings-backup', label: 'バックアップ' },
  { id: 'settings-about', label: 'このアプリについて' },
  { id: 'settings-keys', label: 'キーバインド' },
] as const

function SectionNav() {
  return (
    <nav className="settings__nav" aria-label="設定の項目">
      {SECTIONS.map((x) => (
        <button key={x.id} type="button" className="settings__navitem" onClick={() => document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          {x.label}
        </button>
      ))}
    </nav>
  )
}
