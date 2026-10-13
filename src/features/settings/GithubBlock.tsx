import { useState, type FormEvent } from 'react'
import { checkAccess, type GithubConnection } from '../../lib/github'
import { parseRepo, saveGithubRepo, saveGithubToken } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { Section, StatusChip } from './Section'
import { Spinner } from '../../components/Loading'

// GitHub の連携。リポジトリもトークンも利用者が自分で用意する（作者のものは使わない）
export function GithubBlock(props: { github: GithubConnection | null; onChange: (github: GithubConnection | null) => void }) {
  const [repoDraft, setRepoDraft] = useState('')
  const [tokenDraft, setTokenDraft] = useState('')
  // 未連携のときに「連携する」を押したか（手順と入力欄を出す）
  const [setup, setSetup] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function connect(e: FormEvent) {
    e.preventDefault()
    const repo = parseRepo(repoDraft)
    const token = tokenDraft.trim()
    if (!token) return
    if (!repo) {
      setMessage({ ok: false, text: 'リポジトリ名は「ユーザー名/anipair-data」の形式で入力してください' })
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
      setMessage({ ok: true, text: `${repo}と連携しました` })
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
    setMessage({ ok: true, text: 'GitHubとの連携を解除しました。この端末からトークンとリポジトリ名を削除しました' })
  }

  return (
    <Section
      id="settings-github"
      title="GitHub連携（任意）"
      summary="興味なし・見てないなどを、PCとスマホで共有して毎日バックアップします。"
      status={
        props.github ? (
          <StatusChip>
            <a href={`https://github.com/${props.github.repo}`} target="_blank" rel="noreferrer">
              {props.github.repo}
            </a>
            と連携中
          </StatusChip>
        ) : (
          <StatusChip tone="off">未連携</StatusChip>
        )
      }
    >
      {props.github ? (
        <div className="settings__actions">
          <button type="button" className="btn" onClick={disconnect}>
            連携を解除
          </button>
        </div>
      ) : !setup ? (
        // 手順と入力欄は、連携したい人が押したときだけ出す（#30: 説明・箇条書き・3つの手順が、いつも全部出ていた）
        <div className="settings__actions">
          <button type="button" className="btn" onClick={() => setSetup(true)}>
            連携する
          </button>
        </div>
      ) : (
        <>
          {/* なぜ GitHub なのか（連携しようとしている人にだけ） */}
          <p className="settings__lead">
            興味なし・保留・見てない・見たいの印とメモ・見るサービスはAnipairだけの記録で、Annictには置けません。Anipairは記録を置く運営サーバーを持たないので、あなた自身のGitHubのリポジトリに保存します。連携しない場合は、この端末の中にだけ残ります。
          </p>
          <details className="settings__fold" open>
            <summary>連携の手順（3ステップ）</summary>
            <ol className="settings__list settings__lead">
              <li>
                GitHubでprivateリポジトリを作成します（
                <a href="https://github.com/new?name=anipair-data&visibility=private" target="_blank" rel="noreferrer">
                  リポジトリの作成画面を開く
                </a>
                ）。名前はanipair-dataのままでかまいません。公開範囲はPrivateのままにしてください。
              </li>
              <li>
                Fine-grainedトークンを作成します（
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                  トークンの作成画面を開く
                </a>
                ）。Repository accessは「Only select repositories」にして手順1のリポジトリだけを選び、PermissionsのContentsを「Read and write」にします。
              </li>
              <li>下の欄にリポジトリ名（ユーザー名/anipair-data）とトークンを入力し、「連携する」を押します。</li>
            </ol>
          </details>
          <form className="settings__form" onSubmit={connect}>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="ユーザー名/anipair-data"
              value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              aria-label="GitHubのリポジトリ名"
            />
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="トークン"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              aria-label="GitHubのFine-grainedトークン"
            />
            <button type="submit" className="btn btn--primary" disabled={checking || !repoDraft.trim() || !tokenDraft.trim()}>
              {checking ? (
            <>
              <Spinner />
              確認しています…
            </>
          ) : (
            '連携する'
          )}
            </button>
          </form>
        </>
      )}
      {message && <p className={message.ok ? 'settings__ok' : 'settings__error'}>{message.text}</p>}
    </Section>
  )
}
