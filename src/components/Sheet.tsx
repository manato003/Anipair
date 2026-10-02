import { useEffect, useRef, type ReactNode } from 'react'

// 下から出るシートの枠。背景を押すか閉じるボタン、Esc（active のときだけ）で閉じる。
// active が false のときは、隠れたタブに開いたまま残っているシートが Esc に反応しない
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
