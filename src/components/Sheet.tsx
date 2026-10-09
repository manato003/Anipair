import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icons'
import { useSheetLayer } from './sheetLayer'
import { lockPageScroll } from '../lib/pageScroll'
import { registerSheet } from '../lib/sheetHistory'
import { loadSheetHintSeen, saveSheetHintSeen } from '../lib/storage'
import { reducedMotion } from '../lib/theme'
import { useModalFocus } from '../lib/useModalFocus'

// 下から出るシートの枠。背景を押すか閉じるボタン、Esc（active のときだけ）で閉じる。
// active が false のときは、隠れたタブに開いたまま残っているシートが Esc と「戻る」に反応しない
// スマホの「戻る」でも閉じる（開いているあいだ履歴を1つ積む。仕組みと決まりは lib/sheetHistory.ts）
// 広い画面では中央のパネルになる。size="large" は幅と高さを広げる。
// size="page" は作品の詳細などの「中身を開く1枚」: 画面いっぱいに地の色で開き、中身は読みやすい幅の列に置く
//
// 閉じるボタンは右上の丸い ✕（スマホで片手操作を左手にしていれば左上。styles の [data-hand='left']）。
// 指で触る端末では、上端に「つまみ」の線を出し、下へ払っても閉じる（中身をいちばん上まで戻しているときだけ。指に付いてきて、離した位置で閉じるか戻るかを決める）。
// 1枚（page）は、中ほどから右へ払っても閉じる（端から始めた払いはブラウザの「戻る」に任せる。横に流せる中身の上では受けない）。
// 下から出るシートは、ボタンやリンクなど押せるもの以外の場所をタップしても閉じる（文字を選んでいるときは閉じない。マウスでは、文字を選ぶ邪魔になるので閉じない）。
// 1枚は画面いっぱいで「外」が無いので、タップでは閉じない（読みながら触って閉じてしまわないように）。
// 閉じるときは、抜けていく動き（下から出るシートは下へ、1枚は下か右へ）を見せてから閉じる。動きを減らす設定では、すぐ閉じる。
// 「タップで閉じます」のような文字の案内は、その文字を押すものと誤解されるので出さない。初めての1回だけ、つまみの下に地の文字で閉じ方を添える

// シートの中でタップしても閉じない、押せるもの
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]'

// 払いで閉じる距離（下へ・右へ）と、短く速く払ったときの距離。端から始めた払いは受けない
const DOWN_PX = 90
const RIGHT_PX = 80
const FLICK_PX = 40
const FLICK_MS = 250
const EDGE_PX = 24
// 閉じる動きの長さ
const LEAVE_MS = 220

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

// 横に流せる中身（関連作品の列など）の上で始めた払いか。そこでは右へ払っても閉じない
function inHorizontalScroller(target: EventTarget | null, root: HTMLElement): boolean {
  for (let n = target instanceof Element ? target : null; n && n !== root; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 1) {
      const x = getComputedStyle(n).overflowX
      if (x === 'auto' || x === 'scroll') return true
    }
  }
  return false
}

export function Sheet(props: { label: string; active?: boolean; size?: 'large' | 'page'; onClose: () => void; children: ReactNode }) {
  const active = props.active ?? true
  const page = props.size === 'page'
  const closeRef = useRef<HTMLButtonElement>(null)
  const [touch] = useState(isCoarsePointer)
  // 初めての案内か（閉じたら「見た」にする）
  const [hint] = useState(() => isCoarsePointer() && !loadSheetHintSeen())
  const onClose = useRef(props.onClose)
  useEffect(() => {
    onClose.current = props.onClose
  })

  // Tab をシートの中で回し、閉じたら開く前の場所にフォーカスを戻す（開く前の場所を、下で閉じるボタンに移す前に覚える）
  const sheetRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  useModalFocus(sheetRef, active)

  // 閉じる。動きのあいだに重ねて閉じる操作が来ても、1回だけ閉じる
  const leaving = useRef(false)
  const leave = (how: 'down' | 'right' = 'down') => {
    if (leaving.current) return
    leaving.current = true
    if (hint) saveSheetHintSeen()
    const el = sheetRef.current
    if (!el || typeof el.animate !== 'function' || reducedMotion()) {
      onClose.current()
      return
    }
    const to = how === 'right' ? 'translateX(40%)' : page ? 'translateY(40%)' : 'translateY(100%)'
    el.style.transition = 'none'
    const anim = el.animate([{ transform: el.style.transform || 'none' }, { transform: to, opacity: page ? 0 : 1 }], {
      duration: LEAVE_MS,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'forwards',
    })
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: 'ease-in', fill: 'forwards' })
    const done = () => onClose.current()
    anim.onfinish = done
    anim.oncancel = done
  }
  const close = () => leave()
  const leaveRef = useRef(leave)
  useEffect(() => {
    leaveRef.current = leave
  })

  // 開いたときだけ閉じるボタンにフォーカスを置く
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // 「戻る」で閉じる。表示中のシートだけが履歴を持つ
  const id = useId()
  useEffect(() => {
    if (!active) return
    return registerSheet(id, () => leaveRef.current())
  }, [active, id])

  // 払って閉じる（指で触る端末だけ）。下へ（中身がいちばん上のとき）、1枚は中ほどから右へも
  useEffect(() => {
    const el = sheetRef.current
    if (!el || !touch || !active) return
    let start: { x: number; y: number; t: number; sideways: boolean } | null = null
    let axis: 'down' | 'right' | null = null
    let dist = 0
    const reset = () => {
      el.style.transition = 'transform 0.2s cubic-bezier(0.3, 0.7, 0.2, 1)'
      el.style.transform = ''
    }
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      // 文字を入れている欄の上では払いを受けない（文字の選択・カーソルの移動のため）
      const editing = e.target instanceof Element && !!e.target.closest('input, textarea, select, [contenteditable="true"]')
      start =
        e.touches.length === 1 && !editing
          ? { x: t.clientX, y: t.clientY, t: Date.now(), sideways: page && t.clientX > EDGE_PX && !inHorizontalScroller(e.target, el) }
          : null
      axis = null
      dist = 0
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const dy = e.touches[0].clientY - start.y
      const dx = e.touches[0].clientX - start.x
      if (!axis) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
        // 下向きで中身がいちばん上のとき、または（1枚で）はっきり右向きのときだけ。それ以外は中身の流し・横の流しに任せる
        if (dy > 0 && Math.abs(dy) > Math.abs(dx) && el.scrollTop <= 0) axis = 'down'
        else if (start.sideways && dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5) axis = 'right'
        else {
          start = null
          return
        }
      }
      if (e.cancelable) e.preventDefault()
      dist = Math.max(0, axis === 'down' ? dy : dx)
      el.style.transition = 'none'
      el.style.transform = axis === 'down' ? `translateY(${dist}px)` : `translateX(${dist}px)`
    }
    const onEnd = () => {
      if (axis && start) {
        const fast = dist > FLICK_PX && Date.now() - start.t < FLICK_MS
        if (dist > (axis === 'down' ? DOWN_PX : RIGHT_PX) || fast) leaveRef.current(axis)
        else reset()
      }
      start = null
      axis = null
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [touch, active, page])

  // 表示しているあいだは、後ろのページを流さない
  useEffect(() => (active ? lockPageScroll() : undefined), [active])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leaveRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  function onSheetClick(e: MouseEvent<HTMLElement>) {
    e.stopPropagation()
    if (!touch || page) return
    const target = e.target as Element
    if (target.closest(INTERACTIVE)) return
    if (window.getSelection?.()?.toString()) return
    close()
  }

  const layer = useSheetLayer()
  const bar = (
    <div className="sheet__bar">
      {touch && <span className="sheet__grab" aria-hidden />}
      <button ref={closeRef} type="button" className="sheet__close" aria-label="閉じる" onClick={close}>
        <CloseIcon />
      </button>
      {touch && hint && <p className="sheet__hint">{page ? '下か右へ払っても閉じます' : '下へ払うか、空いている所をタップしても閉じます'}</p>}
    </div>
  )
  const cls = page ? 'sheet sheet--page' : props.size === 'large' ? 'sheet sheet--large' : 'sheet'
  return createPortal(
    // data-no-swipe: シートの中で横に払っても、後ろの画面の分類を替えない
    <div ref={backdropRef} className={page ? 'sheet-backdrop sheet-backdrop--page' : 'sheet-backdrop'} onClick={close} data-no-swipe>
      <div ref={sheetRef} className={cls} role="dialog" aria-modal="true" aria-label={props.label} onClick={(e) => onSheetClick(e)}>
        {page ? (
          // 1枚は、閉じるボタンも中身と同じ読みやすい幅の列に置く（広い画面で、ボタンが画面の端に離れない）
          <div className="sheet__col">
            {bar}
            {props.children}
          </div>
        ) : (
          <>
            {bar}
            {props.children}
          </>
        )}
      </div>
    </div>,
    layer,
  )
}
