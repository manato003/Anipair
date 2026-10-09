import { useEffect, useRef, type RefObject } from 'react'

// 中身を左右に払って、分類（評価・マッチング・記録…）を替える。
// - 指（タッチ）は、動き始めの LOCK px で縦か横かを決める。横に決まったら、その指のあいだは縦の流しを止める
//   （ブラウザに先に決めさせると、少し斜めなだけで縦に流れ始めて払いが取り消され、真横に丁寧に払わないと効かなかった。2026-10-08 実機）
// - マウスでは払わない（PC は分類の帯で替える。文字を選ぶ・画像を動かすなどのドラッグで誤って替わっていた）
// - 画面の左右の端から EDGE 以内で始めた払いは受けない（iOS Safari・Android Chrome の「戻る・進む」に任せる）。
//   ホーム画面に追加した全画面（PWA）では、ブラウザの払いが無いので端でも受ける
// - 文字の入力欄や、横に流せる列（[data-no-swipe] か、横にはみ出して流せる要素）の上で始めた払いは受けない
export const EDGE = 24
const LOCK = 10
const MIN = 50

export type SwipeDir = 'next' | 'prev'

// いま出ている画面が、分類より先に払いを受け取る（記録のタブなど）。受け取ったら true を返す
let intercept: ((dir: SwipeDir) => boolean) | null = null

export function useSwipeIntercept(handler: (dir: SwipeDir) => boolean, active: boolean): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!active) return
    const fn = (dir: SwipeDir) => ref.current(dir)
    intercept = fn
    return () => {
      if (intercept === fn) intercept = null
    }
  }, [active])
}

function startsOnSkipped(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return true
  // 横に流せる要素の上（その中の横の流しを優先する）
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const x = getComputedStyle(el).overflowX
      if (x === 'auto' || x === 'scroll') return true
    }
  }
  return false
}

function standalone(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches
}

function atEdge(x: number): boolean {
  if (standalone()) return false
  return x < EDGE || x > window.innerWidth - EDGE
}

export function useSwipeNav(ref: RefObject<HTMLElement | null>, onSwipe: (dir: SwipeDir) => void, enabled: boolean): void {
  const cb = useRef(onSwipe)
  useEffect(() => {
    cb.current = onSwipe
  })
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const fire = (dx: number) => {
      const dir: SwipeDir = dx < 0 ? 'next' : 'prev'
      if (intercept?.(dir)) return
      cb.current(dir)
    }

    // ── 指 ──
    let touch: { x: number; y: number; lock: 'h' | 'v' | null } | null = null
    const tStart = (e: TouchEvent) => {
      touch = null
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (atEdge(t.clientX) || startsOnSkipped(e.target)) return
      touch = { x: t.clientX, y: t.clientY, lock: null }
    }
    const tMove = (e: TouchEvent) => {
      if (!touch) return
      const t = e.touches[0]
      const dx = t.clientX - touch.x
      const dy = t.clientY - touch.y
      if (!touch.lock && (Math.abs(dx) > LOCK || Math.abs(dy) > LOCK)) touch.lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      // 横に決まったら、縦に流れないようにする（この指のあいだだけ）
      if (touch.lock === 'h' && e.cancelable) e.preventDefault()
    }
    const tEnd = (e: TouchEvent) => {
      if (!touch) return
      const t = e.changedTouches[0]
      const dx = t.clientX - touch.x
      const locked = touch.lock
      touch = null
      if (locked === 'h' && Math.abs(dx) >= MIN) fire(dx)
    }
    const tCancel = () => {
      touch = null
    }

    el.addEventListener('touchstart', tStart, { passive: true })
    // 縦の流しを止められるよう、passive にしない
    el.addEventListener('touchmove', tMove, { passive: false })
    el.addEventListener('touchend', tEnd)
    el.addEventListener('touchcancel', tCancel)
    return () => {
      el.removeEventListener('touchstart', tStart)
      el.removeEventListener('touchmove', tMove)
      el.removeEventListener('touchend', tEnd)
      el.removeEventListener('touchcancel', tCancel)
    }
  }, [ref, enabled])
}
