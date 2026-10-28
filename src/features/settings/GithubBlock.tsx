import { useState, type FormEvent } from 'react'
import { checkAccess, type GithubConnection } from '../../lib/github'
import { parseRepo, saveGithubRepo, saveGithubToken } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { t } from '../../lib/i18n'
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
      setMessage({ ok: false, text: t('リポジトリ名は「ユーザー名/anipair-data」の形式で入力してください', 'Enter the repository name as “username/anipair-data”') })
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
      setMessage({ ok: true, text: t(`${repo}と連携しました`, `Connected to ${repo}`) })
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
    setMessage({ ok: true, text: t('GitHubとの連携を解除しました。この端末からトークンとリポジトリ名を削除しました', 'Disconnected from GitHub. The token and repository name were removed from this device') })
  }

  return (
    <Section
      id="settings-github"
      title={t('GitHub連携（任意）', 'GitHub sync (optional)')}
      summary={t('興味なし・見てないなどを、PCとスマホで共有して毎日バックアップします。', 'Share Not interested, Haven’t seen and similar answers between your PC and phone, and back them up every day.')}
      status={
        props.github ? (
          <StatusChip>
            <a href={`https://github.com/${props.github.repo}`} target="_blank" rel="noreferrer">
              {props.github.repo}
            </a>
            {t('と連携中', ' connected')}
          </StatusChip>
        ) : (
          <StatusChip tone="off">{t('未連携', 'Not connected')}</StatusChip>
        )
      }
    >
      {props.github ? (
        <div className="settings__actions">
          <button type="button" className="btn" onClick={disconnect}>
            {t('連携を解除', 'Disconnect')}
          </button>
        </div>
      ) : !setup ? (
        // 手順と入力欄は、連携したい人が押したときだけ出す（前は説明・箇条書き・3つの手順が、いつも全部出ていた）
        <div className="settings__actions">
          <button type="button" className="btn" onClick={() => setSetup(true)}>
            {t('連携する', 'Connect')}
          </button>
        </div>
      ) : (
        <>
          {/* なぜ GitHub なのか（連携しようとしている人にだけ） */}
          <p className="settings__lead">
            {t(
              '興味なし・保留・見てない・見たいの印とメモ・見るサービス・Tier表はAnipairだけの記録で、Annictには置けません。GitHubと連携すると、あなた自身のリポジトリに保存します。連携しない場合は、この端末の中にだけ残ります。',
              'Not interested, Later, Haven’t seen, Want to watch marks and notes, where you watch, and tier lists are records only Anipair keeps, so they can’t be stored on Annict. Connecting GitHub saves them in your own repository. If you don’t connect, they stay only on this device.',
            )}
          </p>
          <details className="settings__fold" open>
            <summary>{t('連携の手順（3ステップ）', 'How to connect (3 steps)')}</summary>
            <ol className="settings__list settings__lead">
              <li>
                {t('GitHubでprivateリポジトリを作成します（', 'Create a private repository on GitHub (')}
                <a href="https://github.com/new?name=anipair-data&visibility=private" target="_blank" rel="noreferrer">
                  {t('リポジトリの作成画面を開く', 'open the new repository page')}
                </a>
                {t(
                  '）。名前はanipair-dataのままでかまいません。公開範囲はPrivateのままにしてください。',
                  '). Keeping the name anipair-data is fine. Leave the visibility set to Private.',
                )}
              </li>
              <li>
                {t('Fine-grainedトークンを作成します（', 'Create a fine-grained token (')}
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                  {t('トークンの作成画面を開く', 'open the new token page')}
                </a>
                {t(
                  '）。Repository accessは「Only select repositories」にして手順1のリポジトリだけを選び、PermissionsのContentsを「Read and write」にします。',
                  '). Set Repository access to “Only select repositories” and choose only the repository from step 1, then set Contents under Permissions to “Read and write”.',
                )}
              </li>
              <li>
                {t(
                  '下の欄にリポジトリ名（ユーザー名/anipair-data）とトークンを入力し、「連携する」を押します。',
                  'Enter the repository name (username/anipair-data) and the token in the fields below, then press “Connect”.',
                )}
              </li>
            </ol>
          </details>
          <form className="settings__form" onSubmit={connect}>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={t('ユーザー名/anipair-data', 'username/anipair-data')}
              value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              aria-label={t('GitHubのリポジトリ名', 'GitHub repository name')}
            />
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('トークン', 'Token')}
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              aria-label={t('GitHubのFine-grainedトークン', 'GitHub fine-grained token')}
            />
            <button type="submit" className="btn btn--primary" disabled={checking || !repoDraft.trim() || !tokenDraft.trim()}>
              {checking ? (
            <>
              <Spinner />
              {t('確認しています…', 'Checking…')}
            </>
          ) : (
            t('連携する', 'Connect')
          )}
            </button>
          </form>
        </>
      )}
      {message && <p className={message.ok ? 'settings__ok' : 'settings__error'}>{message.text}</p>}
    </Section>
  )
}
