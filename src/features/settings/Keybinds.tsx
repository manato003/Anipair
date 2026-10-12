import { useEffect, useState } from 'react'
import { Section } from './Section'
import { DEFAULT_KEYMAP, KEY_ACTIONS, RESERVED_KEYS, assignKey, clash, getKeymap, hadReservedKeys, keyLabel, normalizeKey, setKeymap, useKeymap, type KeyAction } from '../../lib/keymap'
import { loadKeymapRaw } from '../../lib/storage'

// タッチの端末（指で触る画面）では、キーボードの設定は使わないので畳んでおく
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function Keybinds() {
  const keymap = useKeymap()
  // キーを押してもらうのを待っている操作
  const [waiting, setWaiting] = useState<KeyAction | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // 前に ← → を割り当てていたか（その操作は、読むときに空いているキーへ移している）。知らせてから、移した割り当てを保存する
  const [moved] = useState(() => hadReservedKeys(loadKeymapRaw()))
  useEffect(() => {
    if (moved) setKeymap(getKeymap())
  }, [moved])

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
      if (RESERVED_KEYS.includes(e.key)) {
        setMessage('← → は画面の切り替えに使うので、割り当てられません。ほかのキーを押してください')
        return
      }
      const key = normalizeKey(e.key)
      if (!key) {
        setMessage(`${e.key === ' ' ? 'Space' : e.key}は割り当てられません。英数字・↑ ↓・BackSpaceのいずれかを押してください`)
        return
      }
      const holder = KEY_ACTIONS.find((a) => keymap[a.action] === key && clash(a.action, waiting))
      setKeymap(assignKey(keymap, waiting, key))
      setMessage(holder ? `「${holder.label}」のキーと入れ替えました` : null)
      setWaiting(null)
    }
    // 他の画面のショートカットより先に受け取る
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [waiting, keymap])

  const isDefault = KEY_ACTIONS.every(({ action }) => keymap[action] === DEFAULT_KEYMAP[action])

  return (
    <Section id="settings-keys" title="キーバインド（PC）" summary="評価とマッチングで使うキーを変えられます。">
      <details className="settings__fold" open={!isTouchDevice()}>
        <summary>キーの割り当て</summary>
      <p className="settings__lead">
        変えたい操作のキーを押してから、新しいキーを押します。使っているキーを選ぶと入れ替わります。Escで取り消せます（← →は画面の切り替え用です）。
      </p>
      {moved && <p className="settings__lead settings__lead--notice">← → で画面を切り替えられるようにしたので、← → に割り当てていた操作を、空いているキーに移しました。下で確かめてください。</p>}
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
            setMessage('初期設定に戻しました')
          }}
        >
          初期設定に戻す
        </button>
        {message && <p className="settings__note">{message}</p>}
      </div>
      </details>
    </Section>
  )
}
