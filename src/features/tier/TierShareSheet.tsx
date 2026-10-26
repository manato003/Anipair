import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { t } from '../../lib/i18n'
import type { TierTable, TierView } from './tierList'
import { createShare, deleteShare, isStale, shareText, shareUrl, sharedPayload, updateShare } from './tierShare'

// Tier表の共有。リンクを作る・中身を新しくする・消す、と投稿文（リンクと #Anipair）を共有する・写す。
// 表紙を含む画像はアプリでは作らない（リンクを開いた人の画面で、/api/shiki から表紙を出す）
export function TierShareSheet(props: { table: TierTable; view: TierView; active: boolean; onChange: (table: TierTable) => void; onClose: () => void }) {
  const { table } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { payload, skipped } = sharedPayload(table, props.view)
  const placed = payload.tiers.reduce((n, x) => n + x.items.length, 0)
  const url = table.share ? shareUrl(table.share.id) : null
  const text = url ? shareText(table.title, url) : ''
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function run(task: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      setError(await task())
    } finally {
      setBusy(false)
    }
  }

  // リンクの情報は表と一緒に保存し、表の変えた日時も同じにする（ほかの端末と合わせたときに、リンクの情報も新しい方が残る）
  const create = () =>
    run(async () => {
      const now = new Date()
      const r = await createShare(payload, now)
      if (!r.ok) return r.message
      props.onChange({ ...table, share: r.value, updatedAt: r.value.at })
      return null
    })
  const update = () =>
    run(async () => {
      if (!table.share) return null
      const r = await updateShare(table.share, payload)
      if (!r.ok) {
        // リンクがもう無いなら、表からも外す（作り直せるようにする）
        if (r.missing) props.onChange({ ...table, share: undefined, updatedAt: new Date().toISOString() })
        return r.message
      }
      props.onChange({ ...table, share: r.value, updatedAt: r.value.at })
      return null
    })
  const remove = () =>
    run(async () => {
      if (!table.share) return null
      const r = await deleteShare(table.share)
      if (!r.ok) return r.message
      props.onChange({ ...table, share: undefined, updatedAt: new Date().toISOString() })
      setConfirming(false)
      return null
    })

  async function share() {
    try {
      await navigator.share({ text })
    } catch (e) {
      // 利用者が共有の画面を閉じたときも、ここに来る（何も出さない）
      if (e instanceof DOMException && e.name === 'AbortError') return
      await copy()
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setNote(t('投稿文を写しました。', 'Copied the post text.'))
    } catch {
      setNote(t('写せませんでした。リンクを長押しして写してください。', 'Couldn’t copy. Press and hold the link to copy it.'))
    }
  }

  return (
    <Sheet label={t('リンクで共有', 'Share as a link')} active={props.active} onClose={props.onClose}>
      <div className="tiershare">
        <p className="note">
          {t(
            'リンクを知っている人は誰でも、ログインしなくてもこの表を見られます。送るのは題名・段の名前・作品の並びだけで、Annictの名前や評価は送りません。',
            'Anyone with the link can see this list without logging in. Only the title, tier names and the order of the anime are sent—not your Annict name or ratings.',
          )}
        </p>
        {skipped > 0 && (
          <p className="note">{t(`MyAnimeListのIDが無い作品は、リンクに入りません（${skipped}作品）。`, `${skipped} anime without a MyAnimeList ID won’t be in the link.`)}</p>
        )}

        {!url ? (
          <button type="button" className="btn btn--primary" onClick={create} disabled={busy || placed === 0}>
            {busy ? t('作っています…', 'Making…') : t('リンクを作る', 'Make a link')}
          </button>
        ) : (
          <>
            <input className="tiershare__url" type="text" readOnly value={url} aria-label={t('共有のリンク', 'Share link')} onFocus={(e) => e.target.select()} />
            <div className="tiershare__actions">
              {canShare && (
                <button type="button" className="btn btn--primary" onClick={share}>
                  {t('共有する', 'Share')}
                </button>
              )}
              <button type="button" className="btn" onClick={copy}>
                {t('投稿文を写す', 'Copy post text')}
              </button>
            </div>
            {isStale(table) ? (
              <div className="tiershare__stale">
                <p className="note">{t('表を変えたあと、リンクの中身はまだ前のままです。', 'You changed the list after making the link. The link still shows the earlier version.')}</p>
                <button type="button" className="btn" onClick={update} disabled={busy || placed === 0}>
                  {busy ? t('送っています…', 'Sending…') : t('リンクの中身を新しくする', 'Update the link')}
                </button>
              </div>
            ) : (
              <p className="note">{t('リンクの中身は、いまの表と同じです。', 'The link shows the list as it is now.')}</p>
            )}
            <p className="note">{t('新しくした中身や消したことがリンクに出るまで、1〜2分かかることがあります。', 'Updates and deletions can take a minute or two to show up on the link.')}</p>

            <div className="tiersettings__danger">
              {confirming ? (
                <>
                  <p className="note">{t('このリンクでは表を見られなくなります。表はこの端末に残ります。', 'The list will no longer be visible at this link. The list stays on this device.')}</p>
                  <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
                    {t('リンクを消す', 'Delete the link')}
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>
                    {t('やめる', 'Cancel')}
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => setConfirming(true)}>
                  {t('リンクを消す', 'Delete the link')}
                </button>
              )}
            </div>
          </>
        )}

        {error && (
          <p className="note tiershare__error" role="alert">
            {error}
          </p>
        )}
        {note && (
          <p className="note" role="status">
            {note}
          </p>
        )}
      </div>
    </Sheet>
  )
}
