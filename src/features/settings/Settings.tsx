import { useState, type FormEvent, type ReactNode } from 'react'
import { fetchViewer } from '../../lib/annict'
import { Logo } from '../../components/Logo'
import { annictClientId, startLogin } from '../../lib/annictLogin'
import { TAGLINE_PHRASES } from '../../lib/brand'
import { checkAccess, type GithubConnection } from '../../lib/github'
import { parseRepo, saveAnnictToken, saveGithubRepo, saveGithubToken } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { loadBackupStatus, runBackup, type BackupResult, type BackupStatus } from '../backup/backupStore'
import { exportBackupFile, type ExportResult } from '../backup/exportFile'
import { describeCounts } from '../backup/snapshot'
import { Keybinds } from './Keybinds'

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
  // ログインする前は、最初の画面として説明とログインだけを出す（GitHub やキー操作は、使い始めてからでよい）
  if (!props.annictToken) {
    return (
      <section className="settings">
        <Welcome
          clientId={props.clientId === undefined ? annictClientId() : props.clientId}
          busy={props.loginBusy ?? false}
          error={props.loginError ?? null}
          onAnnictTokenChange={props.onAnnictTokenChange}
        />
        <About />
      </section>
    )
  }
  return (
    <section className="settings">
      <TokenField
        title="Annict とつなぐ"
        lead="記録はすべて Annict に保存します。"
        label="Annict の個人用アクセストークン"
        token={props.annictToken}
        verify={verifyAnnictToken}
        save={(t) => {
          saveAnnictToken(t)
          props.onAnnictTokenChange(t)
        }}
      />
      <GithubBlock github={props.github} onChange={props.onGithubChange} />
      <BackupBlock annictToken={props.annictToken} github={props.github} />
      <Keybinds />
      <About />
    </section>
  )
}

async function verifyAnnictToken(token: string): Promise<string> {
  const v = await fetchViewer(token)
  return `${v.name}（@${v.username}）として接続しました`
}

// ログインする前の最初の画面
function Welcome(props: { clientId: string | null; busy: boolean; error: string | null; onAnnictTokenChange: (token: string | null) => void }) {
  return (
    <div className="settings__block">
      <h1 className="welcome__logo">
        <Logo size="large" />
      </h1>
      <p className="welcome__tagline">
        {TAGLINE_PHRASES.map((phrase) => (
          <span key={phrase}>{phrase}</span>
        ))}
      </p>
      <p className="settings__lead">Annict の記録を、タップだけで付けていくアプリです。見たアニメを1タップで評価し、好みに合う作品も提案します。</p>
      {props.clientId && (
        <button
          type="button"
          className="btn btn--primary settings__login"
          disabled={props.busy}
          onClick={() => startLogin({ clientId: props.clientId!, origin: window.location.origin, assign: (url) => window.location.assign(url) })}
        >
          {props.busy ? 'ログインしています…' : 'Annict でログイン'}
        </button>
      )}
      {props.error && (
        <p className="settings__error" role="alert">
          {props.error}
        </p>
      )}
      <p className="settings__lead settings__need">
        使うには Annict のアカウントが必要です。まだお持ちでなければ、
        <a href="https://annict.com/sign_up" target="_blank" rel="noreferrer">
          Annict に登録
        </a>
        してください。
      </p>
      {/* ログインのボタンが無いとき（ローカルの開発など）は、最初から開いておく */}
      <details className="settings__dev" open={!props.clientId}>
        <summary>開発者向け: 個人用アクセストークンで使う</summary>
        <p className="settings__lead">
          Annict の
          <a href="https://annict.com/settings/apps" target="_blank" rel="noreferrer">
            アプリケーションの設定
          </a>
          で個人用アクセストークンを作り、権限は「読み込み + 書き込み」を選んで、ここに貼ってください。
        </p>
        <TokenForm
          label="Annict の個人用アクセストークン"
          token={null}
          verify={verifyAnnictToken}
          save={(t) => {
            saveAnnictToken(t)
            props.onAnnictTokenChange(t)
          }}
        />
      </details>
    </div>
  )
}

// 設定の末尾。何のアプリで、何が外に出て、何が出ないか
function About() {
  return (
    <div className="settings__block">
      <h1 className="settings__title">このアプリについて</h1>
      <ul className="settings__list settings__lead">
        <li>Anipair は、Annict の非公式の個人開発アプリです。Annict とは関係がありません。</li>
        <li>運営のサーバーはありません。ログインの受け渡しと Shikimori への中継をする関数があるだけで、利用者の情報は何も保存しません。</li>
        <li>通信先は Annict と、作品データの Shikimori（このサイトの中継を通します）です。GitHub とつないだ場合だけ、GitHub にも送ります。</li>
        <li>トークンはこの端末の中にだけ保存します。</li>
        <li>表紙の画像は Annict の画像（各作品の公式サイトのもの）と Shikimori のポスターを表示しています。権利は各権利者にあります。</li>
        <li>
          作品データの一部（ジャンル・似た作品・一部の表紙）:{' '}
          <a href="https://shikimori.io/" target="_blank" rel="noreferrer">
            Shikimori
          </a>
        </li>
        <li>作品の詳細に出すあらすじは Annict の作品ページから読み、引用元を付けて表示しています。</li>
      </ul>
      <p className="settings__lead settings__about-foot">
        <a href="https://github.com/manato003/anipair" target="_blank" rel="noreferrer">
          ソースコード（GitHub）
        </a>
        <span className="settings__version">版 {__APP_VERSION__}</span>
      </p>
    </div>
  )
}

// GitHub の連携。リポジトリもトークンも利用者が自分で用意する（作者のものは使わない）
function GithubBlock(props: { github: GithubConnection | null; onChange: (github: GithubConnection | null) => void }) {
  const [repoDraft, setRepoDraft] = useState('')
  const [tokenDraft, setTokenDraft] = useState('')
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function connect(e: FormEvent) {
    e.preventDefault()
    const repo = parseRepo(repoDraft)
    const token = tokenDraft.trim()
    if (!token) return
    if (!repo) {
      setMessage({ ok: false, text: 'リポジトリ名は「ユーザー名/anipair-data」の形で入れてください' })
      return
    }
    setChecking(true)
    setMessage(null)
    try {
      // 届くことを確かめてから、両方をいっしょに保存する
      await checkAccess({ token, repo })
      saveGithubToken(token)
      saveGithubRepo(repo)
      props.onChange({ token, repo })
      setRepoDraft('')
      setTokenDraft('')
      setMessage({ ok: true, text: `${repo} につながりました` })
    } catch (err) {
      setMessage({ ok: false, text: messageOf(err) })
    } finally {
      setChecking(false)
    }
  }

  function disconnect() {
    saveGithubToken(null)
    saveGithubRepo(null)
    props.onChange(null)
    setMessage({ ok: true, text: 'GitHub とのつなぎをやめました。この端末からトークンとリポジトリ名を消しました' })
  }

  return (
    <div className="settings__block">
      <h1 className="settings__title">GitHub とつなぐ（任意）</h1>
      <p className="settings__lead">つなぐと、次のことができます。</p>
      <ul className="settings__list settings__lead">
        <li>パス・スルー・見てないを、PC とスマホで共有する</li>
        <li>全記録を、自分の GitHub に毎日バックアップする（履歴つき）</li>
      </ul>
      <p className="settings__lead">つながなくても、ほかの機能はすべて使えます。そのときパス・スルー・見てないは、端末ごとに記録します。</p>
      {props.github ? (
        <div className="settings__row">
          <p>
            つながっています:{' '}
            <a href={`https://github.com/${props.github.repo}`} target="_blank" rel="noreferrer">
              {props.github.repo}
            </a>
          </p>
          <button type="button" className="btn" onClick={disconnect}>
            つなぐのをやめる
          </button>
        </div>
      ) : (
        <>
          <ol className="settings__list settings__lead">
            <li>
              GitHub で private リポジトリを作ります（
              <a href="https://github.com/new?name=anipair-data&visibility=private" target="_blank" rel="noreferrer">
                作成画面を開く
              </a>
              。名前は anipair-data のままで大丈夫です。Private のまま作ってください）
            </li>
            <li>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                Fine-grained トークンの作成画面
              </a>
              で、Repository access を「Only select repositories」にして、いま作ったリポジトリだけを選び、Permissions の Contents を「Read and write」にしてトークンを作ります
            </li>
            <li>リポジトリ名（ユーザー名/anipair-data）とトークンを入れて、「つなぐ」を押します</li>
          </ol>
          <form className="settings__form" onSubmit={connect}>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="ユーザー名/anipair-data"
              value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              aria-label="GitHub のリポジトリ名"
            />
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="トークン"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              aria-label="GitHub の Fine-grained トークン"
            />
            <button type="submit" className="btn btn--primary" disabled={checking || !repoDraft.trim() || !tokenDraft.trim()}>
              {checking ? '確認中…' : 'つなぐ'}
            </button>
          </form>
        </>
      )}
      {message && <p className={message.ok ? 'settings__ok' : 'settings__error'}>{message.text}</p>}
    </div>
  )
}

// 2026/10/1 21:04（端末の時刻で）
function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function BackupBlock(props: { annictToken: string; github: GithubConnection | null }) {
  // 自動の結果もここに出るよう、開くたびに控えから読む（設定は開くたびに作り直される）
  const [status, setStatus] = useState<BackupStatus>(loadBackupStatus)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BackupResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  async function backupNow() {
    if (!props.github) return
    setRunning(true)
    setResult(null)
    try {
      setResult(await runBackup(props.annictToken, props.github))
    } catch {
      // 失敗は控えに残るので、下の「前回の失敗」に出る
    } finally {
      setStatus(loadBackupStatus())
      setRunning(false)
    }
  }

  // GitHub につないでいなくても取れる（端末にファイルとして保存する）
  async function exportNow() {
    setExporting(true)
    setExported(null)
    setExportError(null)
    try {
      setExported(await exportBackupFile(props.annictToken))
    } catch (e) {
      setExportError(messageOf(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="settings__block">
      <h1 className="settings__title">バックアップ</h1>
      <p className="settings__lead">見た・見たいなどの状態と日時、評価（5項目と本文）、パス・スルー、「見てない」を、JSON ファイルにして控えられます。</p>
      <div className="settings__row">
        <button type="button" className="btn" disabled={exporting} onClick={exportNow}>
          {exporting ? '書き出しています…' : 'ファイルに書き出す'}
        </button>
      </div>
      {exportError && <p className="settings__error">{exportError}</p>}
      {exported && <p className="settings__ok">{`書き出しました（${exported.fileName}。${describeCounts(exported.counts)}）`}</p>}
      {!props.github ? (
        <p className="settings__status">上の「GitHub とつなぐ」でつなぐと、毎日の自動バックアップも取れます（履歴つき）。</p>
      ) : (
        <>
          <p className="settings__lead settings__auto">
            つないだ GitHub の {props.github.repo} の backup.json にも保存し、変わったときだけ書き込むので、過去の版は GitHub の履歴に残ります。
            アプリを開いたとき、前回から1日たっていれば自動でも取ります。
          </p>
          <p className="settings__status">
            {status.lastAt ? `前回: ${formatTime(status.lastAt)}（${status.written ? '保存' : '変更なし'}）` : 'まだ取っていません'}
          </p>
          {status.error && <p className="settings__error">前回の失敗: {status.error}</p>}
          <div className="settings__row">
            <button type="button" className="btn" disabled={running} onClick={backupNow}>
              {running ? 'バックアップ中…' : '今すぐバックアップ'}
            </button>
            <a href={`https://github.com/${props.github.repo}/blob/main/backup.json`} target="_blank" rel="noreferrer">
              GitHub で見る
            </a>
            <a href={`https://github.com/${props.github.repo}/commits/main/backup.json`} target="_blank" rel="noreferrer">
              履歴
            </a>
          </div>
          {result && (
            <p className="settings__ok">
              {result.written ? `保存しました（${describeCounts(result.counts)}）` : '前回から変わっていないので、書き込みませんでした'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function TokenField(props: {
  title: string
  lead: ReactNode
  label: string
  token: string | null
  verify: (token: string) => Promise<string>
  save: (token: string | null) => void
}) {
  return (
    <div className="settings__block">
      <h1 className="settings__title">{props.title}</h1>
      <p className="settings__lead">{props.lead}</p>
      <TokenForm label={props.label} token={props.token} verify={props.verify} save={props.save} />
    </div>
  )
}

// トークンを貼って確かめて保存する欄（つながっているときは「トークンを消す」）
function TokenForm(props: {
  label: string
  token: string | null
  verify: (token: string) => Promise<string>
  save: (token: string | null) => void
}) {
  const [draft, setDraft] = useState('')
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function connect(e: FormEvent) {
    e.preventDefault()
    const token = draft.trim()
    if (!token) return
    setChecking(true)
    setMessage(null)
    try {
      const text = await props.verify(token)
      props.save(token)
      setDraft('')
      setMessage({ ok: true, text })
    } catch (err) {
      setMessage({ ok: false, text: messageOf(err) })
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      {props.token ? (
        <div className="settings__row">
          <p>この端末はつながっています。</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              props.save(null)
              setMessage({ ok: true, text: 'この端末からトークンを消しました' })
            }}
          >
            トークンを消す
          </button>
        </div>
      ) : (
        <form className="settings__form" onSubmit={connect}>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="トークン"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={props.label}
          />
          <button type="submit" className="btn btn--primary" disabled={checking || !draft.trim()}>
            {checking ? '確認中…' : 'つなぐ'}
          </button>
        </form>
      )}
      {message && <p className={message.ok ? 'settings__ok' : 'settings__error'}>{message.text}</p>}
    </>
  )
}
