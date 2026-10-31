import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { t } from '../lib/i18n'
import { messageOf } from '../lib/useWriteQueue'
import { Spinner } from './Loading'

// 入力しながら候補を出す検索欄（WAI-ARIA の combobox）。打ち終えて少し待ってから search を呼び、古い問い合わせの答えは捨てる。
// ↑↓で選び、Enter で決める。Esc は候補を閉じるだけ（開いているシートは閉じない）
// 2つの使い方: 選ぶと欄を空にする（苦手な人物・制作会社を足す）と、欄の値を親が持ち、選ぶと親が値を埋める（value。ブラウズと記録の題名の検索）

export interface AutocompleteItem {
  key: string
  label: string
  // 名前の下に添える説明（出演の数など）
  sub?: string
  // 選べない候補（理由は sub に書く）
  disabled?: boolean
}

const WAIT_MS = 350

export function Autocomplete<T>(props: {
  label: string
  placeholder?: string
  // 手元で探すときは配列をそのまま返してよい（wait: 0 と一緒に）
  search: (q: string) => Promise<T[]> | T[]
  // 候補を探す語か（英字の語など、探しても当たらない語には候補を出さない）
  accept?: (q: string) => boolean
  item: (value: T) => AutocompleteItem
  onPick: (value: T) => void
  // 選んだあとの処理中（人物を Shikimori で探しているなど）。そのあいだは入力できない
  busy?: boolean
  // 欄の値を親が持つとき
  value?: string
  onValueChange?: (value: string) => void
  // 打ち終えてから探すまでの待ち（手元で探すときは短く）
  wait?: number
  inputClassName?: string
  className?: string
}) {
  const id = useId()
  const [own, setOwn] = useState('')
  const q = props.value ?? own
  const [results, setResults] = useState<T[] | null>(null)
  // results がどの語の答えか（親が欄の値を替えたら、前の語の候補は出さない）
  const [resultsFor, setResultsFor] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(-1)
  const seq = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stopTimer, [])

  function change(value: string) {
    if (props.onValueChange) props.onValueChange(value)
    else setOwn(value)
    setOpen(true)
    stopTimer()
    const query = value.trim()
    const mine = ++seq.current
    if (!query || (props.accept && !props.accept(query))) {
      setResults(null)
      setLoading(false)
      setError(null)
      return
    }
    const done = (list: T[]) => {
      if (seq.current !== mine) return
      setResults(list)
      setResultsFor(query)
      setError(null)
      setLoading(false)
      setAt(-1)
    }
    const fail = (e: unknown) => {
      if (seq.current !== mine) return
      setResults(null)
      setError(messageOf(e))
      setLoading(false)
    }
    const run = () => {
      const found = props.search(query)
      // 手元で探すとき（配列を返す）は、すぐ出す
      if (Array.isArray(found)) done(found)
      else found.then(done, fail)
    }
    if (props.wait === 0) return run()
    setLoading(true)
    timer.current = setTimeout(run, props.wait ?? WAIT_MS)
  }

  const items = (results ?? []).map((r) => ({ value: r, view: props.item(r) }))
  const fresh = results !== null && resultsFor === q.trim()
  // 題名の検索（value）は、欄の下の一覧が答えなので、候補があるときだけ出す（探している途中・0件・失敗は一覧の方で分かる）
  const shown =
    open && q.trim() !== '' && (props.value !== undefined ? fresh && items.length > 0 : loading || error !== null || fresh)

  function pick(i: number) {
    const it = items[i]
    if (!it || it.view.disabled) return
    props.onPick(it.value)
    if (props.value === undefined) change('')
    else {
      // 親が欄を選んだ題名で埋める。その語の候補は探し直さない
      stopTimer()
      seq.current++
      setResults(null)
      setLoading(false)
    }
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (items.length === 0) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setAt((cur) => (cur + step + items.length) % items.length)
    } else if (e.key === 'Enter') {
      if (shown && at >= 0) {
        e.preventDefault()
        pick(at)
      }
    } else if (e.key === 'Escape' && shown) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className={props.className ? `autocomplete ${props.className}` : 'autocomplete'}>
      <input
        className={props.inputClassName}
        type="search"
        role="combobox"
        aria-label={props.label}
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={shown && at >= 0 ? `${id}-${at}` : undefined}
        placeholder={props.placeholder}
        value={q}
        disabled={props.busy}
        onChange={(e) => change(e.target.value)}
        onFocus={() => setOpen(true)}
        // 候補を押す前に閉じないよう、少し待ってから閉じる
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {props.busy && (
        <p className="autocomplete__status">
          <Spinner />
          {t('確かめています', 'Checking')}
        </p>
      )}
      {shown && (
        <ul className="autocomplete__list" id={`${id}-list`} role="listbox" aria-label={props.label}>
          {loading ? (
            <li className="autocomplete__status" role="presentation">
              <Spinner />
              {t('探しています', 'Searching')}
            </li>
          ) : error !== null ? (
            <li className="autocomplete__status" role="presentation">
              {t(`探せませんでした（${error}）`, `Couldn’t search (${error})`)}
            </li>
          ) : items.length === 0 ? (
            <li className="autocomplete__status" role="presentation">
              {t('見つかりませんでした', 'No matches')}
            </li>
          ) : (
            items.map((it, i) => (
              <li
                key={it.view.key}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === at}
                aria-disabled={it.view.disabled || undefined}
                className="autocomplete__option"
                // フォーカスを入力欄から動かさない（blur で閉じる前に選べるように）
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span className="autocomplete__label">{it.view.label}</span>
                {it.view.sub && <span className="autocomplete__sub">{it.view.sub}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
