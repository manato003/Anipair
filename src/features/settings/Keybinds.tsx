import { useEffect, useState } from 'react'
import { Section, SettingRow } from './Section'
import { Choices } from '../../components/QuickSettings'
import {
  DEFAULT_KEYMAP,
  KEY_ACTIONS,
  RESERVED_KEYS,
  assignKey,
  clash,
  getKeymap,
  hadReservedKeys,
  keyLabel,
  normalizeKey,
  setKeymap,
  setKeysOn,
  useKeymap,
  useKeysOn,
  type KeyAction,
} from '../../lib/keymap'
import { t } from '../../lib/i18n'
import { loadKeymapRaw } from '../../lib/storage'

const KEYS_ON = [
  { value: true, get label() { return t('する', 'On') } },
  { value: false, get label() { return t('しない', 'Off') } },
] as const

// タッチの端末（指で触る画面）では、キーボードの設定は使わないので畳んでおく
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function Keybinds() {
  const keymap = useKeymap()
  const keysOn = useKeysOn()
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
        setMessage(t('← → は画面の切り替えに使うので、割り当てられません。ほかのキーを押してください', '← → are used to switch screens, so they can’t be assigned. Press another key'))
        return
      }
      const key = normalizeKey(e.key)
      if (!key) {
        const pressed = e.key === ' ' ? 'Space' : e.key
        setMessage(t(`${pressed}は割り当てられません。英数字・↑ ↓・BackSpaceのいずれかを押してください`, `${pressed} can’t be assigned. Press a letter, a number, ↑ ↓ or BackSpace`))
        return
      }
      const holder = KEY_ACTIONS.find((a) => keymap[a.action] === key && clash(a.action, waiting))
      setKeymap(assignKey(keymap, waiting, key))
      setMessage(holder ? t(`「${holder.label}」のキーと入れ替えました`, `Swapped keys with “${holder.label}”`) : null)
      setWaiting(null)
    }
    // 他の画面のショートカットより先に受け取る
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [waiting, keymap])

  const isDefault = KEY_ACTIONS.every(({ action }) => keymap[action] === DEFAULT_KEYMAP[action])

  return (
    <Section id="settings-keys" title={t('キーバインド（PC）', 'Keybindings (PC)')} summary={t('評価とマッチングで、キーで答えられるようにします。', 'Answer with keys in Rate and Match.')}>
      <SettingRow label={t('キーで答える', 'Answer with keys')} hint={t('するとボタンの横にキーが出ます', 'Shows the keys next to the buttons')}>
        <Choices
          label={t('キーで答える', 'Answer with keys')}
          choices={KEYS_ON}
          value={keysOn}
          onChoose={(v) => {
            setKeysOn(v)
            setWaiting(null)
          }}
        />
      </SettingRow>
      {keysOn && (
      <details className="settings__fold" open={!isTouchDevice()}>
        <summary>{t('キーの割り当て', 'Key assignments')}</summary>
      <p className="settings__lead">
        {t(
          '変えたい操作のキーを押してから、新しいキーを押します。使っているキーを選ぶと入れ替わります。Escで取り消せます（← →は画面の切り替え用です）。',
          'Press the key of the action you want to change, then press the new key. Choosing a key that’s already in use swaps the two. Press Esc to cancel (← → are reserved for switching screens).',
        )}
      </p>
      {moved && <p className="settings__lead settings__lead--notice">
          {t(
            '← → で画面を切り替えられるようにしたので、← → に割り当てていた操作を、空いているキーに移しました。下で確かめてください。',
            '← → now switch screens, so the actions that were assigned to them have moved to free keys. Please check below.',
          )}
        </p>}
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
              aria-label={t(`${label}のキー（今は ${keyLabel(keymap[action])}）を変える`, `Change the key for ${label} (currently ${keyLabel(keymap[action])})`)}
              onClick={() => {
                setMessage(null)
                setWaiting(waiting === action ? null : action)
              }}
            >
              {waiting === action ? t('キーを押す', 'Press a key') : keyLabel(keymap[action])}
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
            setMessage(t('初期設定に戻しました', 'Reset to defaults'))
          }}
        >
          {t('初期設定に戻す', 'Reset to defaults')}
        </button>
        {message && <p className="settings__note">{message}</p>}
      </div>
      </details>
      )}
    </Section>
  )
}
