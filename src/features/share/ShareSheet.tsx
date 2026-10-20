import { useEffect, useState } from 'react'
import { Loading } from '../../components/Loading'
import { Sheet } from '../../components/Sheet'
import { messageOf } from '../../lib/useWriteQueue'
import { t } from '../../lib/i18n'
import { drawShareCard } from './drawShareCard'
import type { ShareCard } from './shareCard'

// 共有の画像を作って見せ、共有する（スマホの共有ボタン）・保存する・投稿文を写す、を選べるシート。
// 画像は端末の中で作り、利用者が選んだ先にだけ渡る（Anipair のサーバーには送らない）

function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export function ShareSheet(props: { card: ShareCard; filename: string; active: boolean; onClose: () => void }) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    drawShareCard(props.card).then(
      (blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setImage({ blob, url })
      },
      (e) => !cancelled && setError(messageOf(e)),
    )
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [props.card])

  const file = image ? new File([image.blob], props.filename, { type: 'image/png' }) : null
  const sharable = file !== null && canShareFile(file)

  async function share() {
    if (!file) return
    try {
      await navigator.share({ files: [file], text: props.card.text })
      setNote(null)
    } catch (e) {
      // 利用者が共有の画面を閉じたときも、ここに来る（何も出さない）
      if (e instanceof DOMException && e.name === 'AbortError') return
      setNote(t(`共有できませんでした（${messageOf(e)}）。画像を保存して投稿してください。`, `Couldn’t share (${messageOf(e)}). Save the image and post it yourself.`))
    }
  }

  function save() {
    if (!image) return
    const a = document.createElement('a')
    a.href = image.url
    a.download = props.filename
    a.click()
    setNote(t('画像を保存しました。', 'Image saved.'))
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(props.card.text)
      setNote(t('投稿文を写しました。', 'Post text copied.'))
    } catch {
      setNote(t('投稿文を写せませんでした。', 'Couldn’t copy the post text.'))
    }
  }

  return (
    <Sheet label={t('画像で共有', 'Share as image')} size="large" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{t('画像で共有', 'Share as image')}</h2>
      <p className="detail__hint">{t('画像はこの端末の中で作ります。共有するまで、どこにも送られません。作品の表紙は入れていません。', 'The image is made on this device and isn’t sent anywhere until you share it. Anime covers aren’t included.')}</p>
      {error ? (
        <p className="settings__error">{t(`画像を作れませんでした（${error}）`, `Couldn’t make the image (${error})`)}</p>
      ) : !image ? (
        <Loading block label={t('画像を作成中', 'Making image')} />
      ) : (
        <>
          <img className="share__preview" src={image.url} alt={t(`共有する画像: ${props.card.headline}`, `Image to share: ${props.card.headline}`)} />
          <div className="share__actions">
            {sharable && (
              <button type="button" className="btn btn--primary" onClick={share}>
                {t('共有する', 'Share')}
              </button>
            )}
            <button type="button" className={sharable ? 'btn' : 'btn btn--primary'} onClick={save}>
              {t('画像を保存', 'Save image')}
            </button>
            <button type="button" className="btn" onClick={copyText}>
              {t('投稿文を写す', 'Copy post text')}
            </button>
          </div>
          <p className="share__text">{props.card.text}</p>
          {note && (
            <p className="note" role="status">
              {note}
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}
