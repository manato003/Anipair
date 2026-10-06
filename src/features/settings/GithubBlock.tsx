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
      setMessage({ ok: true, text: `${repo} と連携しました` })
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
    setMessage({ ok: true, text: 'GitHub との連携を解除しました。この端末からトークンとリポジトリ名を削除しました' })
  }

  return (
    <Section
      id="settings-github"
      title="GitHub 連携（任意）"
      summary="連携しなくても、すべての機能を使えます。"
      status={
        props.github ? (
          <StatusChip>
            <a href={`https://github.com/${props.github.repo}`} target="_blank" rel="noreferrer">
              {props.github.repo}
            </a>{' '}
            と連携中
          </StatusChip>
        ) : (
          <StatusChip tone="off">未連携</StatusChip>
        )
      }
    >
      {/* なぜ GitHub なのかを、連携していてもいなくても見せる */}
      <p className="settings__lead">
        パス・スルー・見てないは Anipair 独自の記録で、Annict には保存できません。Anipair は運営サーバーを持たないため、これらはあなた自身の GitHub リポジトリに保存します。連携しない場合は、この端末の中にだけ保存されます。
      </p>
      {props.github ? (
        <div className="settings__actions">
          <button type="button" className="btn" onClick={disconnect}>
            連携を解除
          </button>
        </div>
      ) : (
        <>
          <p className="settings__lead">連携すると、次のことができます。</p>
          <ul className="settings__list settings__lead">
            <li>パス・スルー・見てないを、PC とスマホで共有する</li>
            <li>すべての記録を、毎日自動でバックアップする（変更履歴つき）</li>
          </ul>
          <details className="settings__fold" open>
            <summary>連携の手順（3ステップ）</summary>
            <ol className="settings__list settings__lead">
              <li>
                GitHub で private リポジトリを作成します（
                <a href="https://github.com/new?name=anipair-data&visibility=private" target="_blank" rel="noreferrer">
                  リポジトリの作成画面を開く
                </a>
                ）。名前は anipair-data のままでかまいません。公開範囲は Private のままにしてください。
              </li>
              <li>
                Fine-grained トークンを作成します（
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                  トークンの作成画面を開く
                </a>
                ）。Repository access は「Only select repositories」にして手順1のリポジトリだけを選び、Permissions の Contents を「Read and write」にします。
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
