import { useEffect, useState } from 'react'
import { annictCollectionsUrl, fetchViewer } from '../../lib/annict'
import { AnnictHealth } from './AnnictHealth'
import { Section, StatusChip } from './Section'

// 連携しているアカウントの名前（Annict に1回だけ聞く。読めなくても「連携中」とは出せる）
const viewerCache = new Map<string, Promise<{ name: string; username: string }>>()

export function AccountBlock(props: { token: string; onChange: (token: string | null, opts?: { forget?: boolean }) => void }) {
  const [viewer, setViewer] = useState<{ name: string; username: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    const p = viewerCache.get(props.token) ?? fetchViewer(props.token)
    viewerCache.set(props.token, p)
    p.then((v) => !cancelled && setViewer(v)).catch(() => viewerCache.delete(props.token))
    return () => {
      cancelled = true
    }
  }, [props.token])

  return (
    <Section
      id="settings-account"
      title="Annict連携（必須）"
      summary="評価や視聴状況は、すべてあなたのAnnictアカウントに保存されます。"
      status={<StatusChip>{viewer ? `${viewer.name}（@${viewer.username}）で連携中` : 'Annictと連携中'}</StatusChip>}
    >
      {/* Anipair は Annict とつながって動く。遅い・出ないときに、原因が通信のどこにあるかを見分けられるように */}
      <AnnictHealth token={props.token} />
      {/* コレクションは Annict の機能（API では読み書きできないので、Anipair では作らずに案内する） */}
      {viewer && (
        <p className="settings__lead">
          作品をまとめるコレクションは、Annictで作れます。
          <a href={annictCollectionsUrl(viewer.username)} target="_blank" rel="noreferrer">
            Annictの自分のコレクション
          </a>
        </p>
      )}
      <div className="settings__actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            props.onChange(null)
          }}
        >
          ログアウト
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            props.onChange(null, { forget: true })
          }}
        >
          ログアウトして、この端末の記録も消す
        </button>
      </div>
      <p className="settings__lead">
        {'この端末からAnnictのログイン情報を削除します。Annictの記録は消えません。' +
          'この端末に置いた記録（興味なし・見てない・称号など）は、同じアカウントでログインし直すと戻ります。ほかの人がログインしても、アプリには出ません。' +
          'GitHubのトークンは消えるので、もう一度つなぐときに入れ直してください。'}
      </p>
    </Section>
  )
}
