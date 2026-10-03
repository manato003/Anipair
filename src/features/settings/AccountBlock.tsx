import { useEffect, useState } from 'react'
import { fetchViewer } from '../../lib/annict'
import { saveAnnictToken } from '../../lib/storage'
import { Section, StatusChip } from './Section'

// 連携しているアカウントの名前（Annict に1回だけ聞く。読めなくても「連携中」とは出せる）
const viewerCache = new Map<string, Promise<{ name: string; username: string }>>()

export function AccountBlock(props: { token: string; onChange: (token: string | null) => void }) {
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
      title="Annict 連携（必須）"
      summary="評価や視聴状況は、すべてあなたの Annict アカウントに保存されます。"
      status={<StatusChip>{viewer ? `${viewer.name}（@${viewer.username}）で連携中` : 'Annict と連携中'}</StatusChip>}
    >
      <div className="settings__actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            saveAnnictToken(null)
            props.onChange(null)
          }}
        >
          ログアウト
        </button>
      </div>
      <p className="settings__lead">この端末から Annict のログイン情報を削除します。Annict の記録は消えません。</p>
    </Section>
  )
}
