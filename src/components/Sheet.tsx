import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { registerSheet } from '../lib/sheetHistory'
import { loadSheetHintSeen, saveSheetHintSeen } from '../lib/storage'

// 下から出るシートの枠。背景を押すか閉じるボタン、Esc（active のときだけ）で閉じる。
// active が false のときは、隠れたタブに開いたまま残っているシートが Esc と「戻る」に反応しない
// スマホの「戻る」でも閉じる（開いているあいだ履歴を1つ積む。仕組みと決まりは lib/sheetHistory.ts）
// 広い画面では中央のパネルになる。size="large" は作品の詳細用に幅を広げる
//
// 指で触る端末では、シートの中の、ボタンやリンクなど押せるもの以外の場所をタップしても閉じる
// （文字を選んでいるときは閉じない。マウスでは、文字を選ぶ邪魔になるので閉じない）。
// その代わり、右上の小さな「閉じる」は見えなくする（読み上げとキーボードのためにボタン自体は残す）。
// 閉じ方の案内は、最初の1回だけ目立つ形で出し、一度閉じたあとは上に控えめな1行で出し続ける（いつ開いても閉じ方が分かるように）

// シートの中でタップしても閉じない、押せるもの
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]'

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function Sheet(props: { label: string; active?: boolean; size?: 'large'; onClose: () => void; children: ReactNode }) {
  const active = props.active ?? true
  const closeRef = useRef<HTMLButtonElement>(null)
  const [touch] = useState(isCoarsePointer)
  // 初めての案内か（閉じたら「見た」にする）。2回目からは控えめな案内（quiet）
  const [hint] = useState(() => isCoarsePointer() && !loadSheetHintSeen())
  const close = () => {
    if (hint) saveSheetHintSeen()
    onClose.current()
  }
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
    return registerSheet(id, () => {
      if (hint) saveSheetHintSeen()
      onClose.current()
    })
  }, [active, id, hint])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (hint) saveSheetHintSeen()
        onClose.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, hint])

  function onSheetClick(e: MouseEvent<HTMLElement>) {
    e.stopPropagation()
    if (!touch) return
    const target = e.target as Element
    if (target.closest(INTERACTIVE)) return
    if (window.getSelection?.()?.toString()) return
    close()
  }

  return (
    <div className="sheet-backdrop" onClick={close}>
      <article className={props.size === 'large' ? 'sheet sheet--large' : 'sheet'} role="dialog" aria-modal="true" aria-label={props.label} onClick={(e) => onSheetClick(e)}>
        <div className={touch ? 'sheet__bar sheet__bar--hint' : 'sheet__bar'}>
          {touch && (hint ? <p className="sheet__hint">シートのどこかをタップすると閉じます</p> : <p className="sheet__hint sheet__hint--quiet">タップで閉じます</p>)}
          <button ref={closeRef} type="button" className={touch ? 'link visually-hidden' : 'link'} onClick={close}>
            閉じる
          </button>
        </div>
        {props.children}
      </article>
    </div>
  )
}
