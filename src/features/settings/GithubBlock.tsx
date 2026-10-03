import { useState, type FormEvent } from 'react'
import { checkAccess, type GithubConnection } from '../../lib/github'
import { parseRepo, saveGithubRepo, saveGithubToken } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { Section, StatusChip } from './Section'

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
    <Section
      id="settings-github"
      title="GitHub 連携（任意）"
      summary="つながなくても、ほかの機能はすべて使えます。そのときパス・スルー・見てないは、端末ごとに記録します。"
      status={
        props.github ? (
          <StatusChip>
            <a href={`https://github.com/${props.github.repo}`} target="_blank" rel="noreferrer">
              {props.github.repo}
            </a>{' '}
            に接続中
          </StatusChip>
        ) : (
          <StatusChip tone="off">未接続</StatusChip>
        )
      }
    >
      {/* なぜ GitHub なのかを、つないでいてもいなくても見せる */}
      <p className="settings__lead">
        パス・スルー・見てないは Anipair だけの印で、Annict には記録する場所がありません。Anipair は運営のサーバーを持たないので、
        端末をまたいで残したいときは、あなた自身の GitHub のリポジトリを置き場所に使います。評価や見た・見たいなどは、つながなくても Annict に保存されます。
      </p>
      {props.github ? (
        <div className="settings__actions">
          <button type="button" className="btn" onClick={disconnect}>
            つなぐのをやめる
          </button>
        </div>
      ) : (
        <>
          <p className="settings__lead">つなぐと、次のことができます。</p>
          <ul className="settings__list settings__lead">
            <li>パス・スルー・見てないを、PC とスマホで共有する</li>
            <li>全記録を、自分の GitHub に毎日バックアップする（履歴つき）</li>
          </ul>
          <details className="settings__fold" open>
            <summary>つなぎ方（3ステップ）</summary>
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
              {checking ? '確認中…' : 'つなぐ'}
            </button>
          </form>
        </>
      )}
      {message && <p className={message.ok ? 'settings__ok' : 'settings__error'}>{message.text}</p>}
    </Section>
  )
}
