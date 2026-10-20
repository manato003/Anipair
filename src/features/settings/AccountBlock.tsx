import { useEffect, useState } from 'react'
import { annictCollectionsUrl, fetchViewer } from '../../lib/annict'
import { AnnictHealth } from './AnnictHealth'
import { t } from '../../lib/i18n'
import { Section, StatusChip } from './Section'


export function AccountBlock(props: { token: string; onChange: (token: string | null, opts?: { forget?: boolean }) => void }) {
  const [viewer, setViewer] = useState<{ name: string; username: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    // 連携しているアカウントの名前（起動の確かめで読んだものを使う。読めなくても「連携中」とは出せる）
    fetchViewer(props.token).then(
      (v) => !cancelled && setViewer(v),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [props.token])

  return (
    <Section
      id="settings-account"
      title={t('Annict連携', 'Annict connection')}
      status={<StatusChip>{viewer ? t(`${viewer.name}（@${viewer.username}）で連携中`, `Connected as ${viewer.name} (@${viewer.username})`) : t('Annictと連携中', 'Connected to Annict')}</StatusChip>}
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
          {t('ログアウト', 'Log out')}
        </button>
      </div>
      {/* 説明は1行に。細かいこと（端末の記録の戻り方・GitHub のトークン）は畳む（#30: 5行あって読まれにくかった） */}
      <p className="settings__hint">{t('ログアウトしても、Annictの記録は消えません。', 'Logging out doesn’t delete your records on Annict.')}</p>
      <details className="settings__fold">
        <summary>{t('詳しく', 'Details')}</summary>
        <p className="settings__lead">
          {t(
            '記録はすべてAnnictに保存されます。この端末に置いた記録（興味なし・見てない・称号など）は、同じアカウントでログインし直すと戻ります。',
            'All your records are stored on Annict. Records kept on this device (Not interested, Haven’t seen, Titles and so on) come back when you log in again with the same account.',
          )}
          {t(
            'ほかの人がログインしても、アプリには出ません。GitHubのトークンは消えるので、もう一度つなぐときに入れ直してください。',
            ' Nobody else logging in will see them in the app. Your GitHub token is removed, so enter it again when you reconnect.',
          )}
        </p>
        {/* コレクションは Annict の機能（API では読み書きできないので、Anipair では作らずに案内する） */}
        {viewer && (
          <p className="settings__lead">
            {t('作品をまとめるコレクションは、', 'You can create collections of anime ')}
            <a href={annictCollectionsUrl(viewer.username)} target="_blank" rel="noreferrer">
              {t('Annictで作れます', 'on Annict')}
            </a>
            {t('。', '.')}
          </p>
        )}
        {/* 消す方は、端末を手放すときなどにしか使わないので畳んだ中に置き、確認を挟む。
            前は「ログアウト」と並んでいて、Annict のログインまで切れそうに見えた（2026-10-13 利用者） */}
        <div className="settings__actions">
          <button
            type="button"
            className="link"
            onClick={() => {
              if (confirm(t('この端末のAnipairのデータを削除して、ログアウトします。削除したデータは元に戻せません。', 'This deletes Anipair’s data on this device and logs you out. Deleted data can’t be restored.'))) props.onChange(null, { forget: true })
            }}
          >
            {t('ログアウトして、Anipairのデータを削除', 'Log out and delete Anipair’s data')}
          </button>
        </div>
        <p className="settings__hint">{t('Annictの記録は消えません。この端末に置いた、興味なし・見てない・称号などを削除します。', 'Your Annict records are kept. This removes what Anipair stored on this device: Not interested, Haven’t seen, Titles and so on.')}</p>
      </details>
    </Section>
  )
}
