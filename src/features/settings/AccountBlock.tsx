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
      title="Annict連携"
      status={<StatusChip>{viewer ? `${viewer.name}（@${viewer.username}）で連携中` : 'Annictと連携中'}</StatusChip>}
    >
      {/* Anipair は Annict とつながって動く。遅い・出ないときに、原因が通信のどこにあるかを見分けられるように */}
      <AnnictHealth token={props.token} />
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
      </div>
      {/* 説明は1行に。細かいこと（端末の記録の戻り方・GitHub のトークン）は畳む（#30: 5行あって読まれにくかった） */}
      <p className="settings__hint">ログアウトしても、Annictの記録は消えません。</p>
      <details className="settings__fold">
        <summary>詳しく</summary>
        <p className="settings__lead">
          {'記録はすべてAnnictに保存されます。この端末に置いた記録（興味なし・見てない・称号など）は、同じアカウントでログインし直すと戻ります。' +
            'ほかの人がログインしても、アプリには出ません。GitHubのトークンは消えるので、もう一度つなぐときに入れ直してください。'}
        </p>
        {/* コレクションは Annict の機能（API では読み書きできないので、Anipair では作らずに案内する） */}
        {viewer && (
          <p className="settings__lead">
            作品をまとめるコレクションは、
            <a href={annictCollectionsUrl(viewer.username)} target="_blank" rel="noreferrer">
              Annictで作れます
            </a>
            。
          </p>
        )}
        {/* 消す方は、端末を手放すときなどにしか使わないので畳んだ中に置き、確認を挟む。
            前は「ログアウト」と並んでいて、Annict のログインまで切れそうに見えた（2026-10-13 利用者） */}
        <div className="settings__actions">
          <button
            type="button"
            className="link"
            onClick={() => {
              if (confirm('この端末のAnipairのデータを削除して、ログアウトします。削除したデータは元に戻せません。')) props.onChange(null, { forget: true })
            }}
          >
            ログアウトして、Anipairのデータを削除
          </button>
        </div>
        <p className="settings__hint">Annictの記録は消えません。この端末に置いた、興味なし・見てない・称号などを削除します。</p>
      </details>
    </Section>
  )
}
