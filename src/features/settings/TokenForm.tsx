import { useState, type FormEvent } from 'react'
import { messageOf } from '../../lib/useWriteQueue'

// トークンを貼って確かめて保存する欄（開発者向け）
export function TokenForm(props: {
  label: string
  verify: (token: string) => Promise<string>
  save: (token: string | null) => void
}) {
  const [draft, setDraft] = useState('')
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function connect(e: FormEvent) {
    e.preventDefault()
    const token = draft.trim()
    if (!token) return
    setChecking(true)
    setMessage(null)
    try {
      const text = await props.verify(token)
      props.save(token)
      setDraft('')
      setMessage({ ok: true, text })
    } catch (err) {
      setMessage({ ok: false, text: messageOf(err) })
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <form className="settings__form" onSubmit={connect}>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="トークン"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={props.label}
          />
          <button type="submit" className="btn btn--primary" disabled={checking || !draft.trim()}>
            {checking ? '確認中…' : 'つなぐ'}
          </button>
      </form>
      {message && <p className={message.ok ? 'settings__ok' : 'settings__error'}>{message.text}</p>}
    </>
  )
}
