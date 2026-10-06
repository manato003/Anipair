import { useEffect, useState } from 'react'
import { Loading } from '../../components/Loading'
import { Sheet } from '../../components/Sheet'
import { messageOf } from '../../lib/useWriteQueue'
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
      setNote(`共有できませんでした（${messageOf(e)}）。画像を保存して投稿してください。`)
    }
  }

  function save() {
    if (!image) return
    const a = document.createElement('a')
    a.href = image.url
    a.download = props.filename
    a.click()
    setNote('画像を保存しました。')
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(props.card.text)
      setNote('投稿文を写しました。')
    } catch {
      setNote('投稿文を写せませんでした。')
    }
  }

  return (
    <Sheet label="画像で共有" size="large" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">画像で共有</h2>
      <p className="detail__hint">画像はこの端末の中で作ります。共有するまで、どこにも送られません。作品の表紙は入れていません。</p>
      {error ? (
        <p className="settings__error">画像を作れませんでした（{error}）</p>
      ) : !image ? (
        <Loading block label="画像を作成中" />
      ) : (
        <>
          <img className="share__preview" src={image.url} alt={`共有する画像: ${props.card.headline}`} />
          <div className="share__actions">
            {sharable && (
              <button type="button" className="btn btn--primary" onClick={share}>
                共有する
              </button>
            )}
            <button type="button" className={sharable ? 'btn' : 'btn btn--primary'} onClick={save}>
              画像を保存
            </button>
            <button type="button" className="btn" onClick={copyText}>
              投稿文を写す
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
