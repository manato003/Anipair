import { useEffect, useState } from 'react'
import { fetchViewer } from '../../lib/annict'
import { saveAnnictToken } from '../../lib/storage'
import { Section, StatusChip } from './Section'

// 接続しているアカウントの名前（Annict に1回だけ聞く。読めなくても「接続中」とは出せる）
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
      title="アカウント（Annict）"
      summary="記録はすべて Annict に保存します。"
      status={<StatusChip>{viewer ? `${viewer.name}（@${viewer.username}）として接続中` : 'Annict に接続中'}</StatusChip>}
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
          トークンを消す
        </button>
      </div>
    </Section>
  )
}
