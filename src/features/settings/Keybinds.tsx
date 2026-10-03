import { useEffect, useState } from 'react'
import { Section } from './Section'
import { DEFAULT_KEYMAP, KEY_ACTIONS, assignKey, keyLabel, normalizeKey, setKeymap, useKeymap, type KeyAction } from '../../lib/keymap'

// タッチの端末（指で触る画面）では、キーボードの設定は使わないので畳んでおく
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function Keybinds() {
  const keymap = useKeymap()
  // キーを押してもらうのを待っている操作
  const [waiting, setWaiting] = useState<KeyAction | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!waiting) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setWaiting(null)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = normalizeKey(e.key)
      if (!key) {
        setMessage(`${e.key === ' ' ? 'Space' : e.key} は割り当てられません。文字・数字・矢印・BackSpace のどれかを押してください`)
        return
      }
      const holder = KEY_ACTIONS.find((a) => a.action !== waiting && keymap[a.action] === key)
      setKeymap(assignKey(keymap, waiting, key))
      setMessage(holder ? `「${holder.label}」と入れ替えました` : null)
      setWaiting(null)
    }
    // 他の画面のショートカットより先に受け取る
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [waiting, keymap])

  const isDefault = KEY_ACTIONS.every(({ action }) => keymap[action] === DEFAULT_KEYMAP[action])

  return (
    <Section id="settings-keys" title="キーバインド（PC）" summary="評価画面とマッチングで使うキーボードの割り当てです。">
      <details className="settings__fold" open={!isTouchDevice()}>
        <summary>キーの割り当て</summary>
      <p className="settings__lead">
        変えたい操作のキーを押してから、割り当てたいキーを押してください。
        別の操作が使っているキーを選ぶと、2つのキーが入れ替わります。Esc でやめられます。
      </p>
      <ul className="keybinds">
        {KEY_ACTIONS.map(({ action, label, where }) => (
          <li key={action} className="keybind">
            <span className="keybind__label">
              {label}
              <span className="keybind__where">{where}</span>
            </span>
            <button
              type="button"
              className="keycap"
              aria-pressed={waiting === action}
              aria-label={`${label}のキー（今は ${keyLabel(keymap[action])}）を変える`}
              onClick={() => {
                setMessage(null)
                setWaiting(waiting === action ? null : action)
              }}
            >
              {waiting === action ? 'キーを押す' : keyLabel(keymap[action])}
            </button>
          </li>
        ))}
      </ul>
      <div className="settings__row">
        <button
          type="button"
          className="btn"
          disabled={isDefault}
          onClick={() => {
            setKeymap({ ...DEFAULT_KEYMAP })
            setWaiting(null)
            setMessage('既定に戻しました')
          }}
        >
          既定に戻す
        </button>
        {message && <p className="settings__note">{message}</p>}
      </div>
      </details>
    </Section>
  )
}
