import { useEffect, useId, useRef, type ReactNode } from 'react'
import { registerSheet } from '../lib/sheetHistory'

// 下から出るシートの枠。背景を押すか閉じるボタン、Esc（active のときだけ）で閉じる。
// active が false のときは、隠れたタブに開いたまま残っているシートが Esc と「戻る」に反応しない
// スマホの「戻る」でも閉じる（開いているあいだ履歴を1つ積む。仕組みと決まりは lib/sheetHistory.ts）
// 広い画面では中央のパネルになる。size="large" は作品の詳細用に幅を広げる
export function Sheet(props: { label: string; active?: boolean; size?: 'large'; onClose: () => void; children: ReactNode }) {
  const active = props.active ?? true
  const closeRef = useRef<HTMLButtonElement>(null)
  const onClose = useRef(props.onClose)
  useEffect(() => {
    onClose.current = props.onClose
  })

  // 開いたときだけ閉じるボタンにフォーカスを置く
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // 「戻る」で閉じる。表示中のシートだけが履歴を持つ
  const id = useId()
  useEffect(() => {
    if (!active) return
    return registerSheet(id, () => onClose.current())
  }, [active, id])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <article className={props.size === 'large' ? 'sheet sheet--large' : 'sheet'} role="dialog" aria-modal="true" aria-label={props.label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__bar">
          <button ref={closeRef} type="button" className="link" onClick={props.onClose}>
            閉じる
          </button>
        </div>
        {props.children}
      </article>
    </div>
  )
}
