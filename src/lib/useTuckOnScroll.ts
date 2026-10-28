import { useEffect, useState, type RefObject } from 'react'

// PC で上に貼りついた帯（クールと並べ替え）を、下へ流しているあいだは上へ引っ込め、少しでも上へ流したら戻す。
// 表紙の一覧に画面の高さを回すため。上へ流せばすぐ戻るので、どのクールの一覧かもすぐ確かめられる。
// 引っ込めるのは、帯が元の位置から離れて貼りついているときだけ（帯の前の箱が上の帯の下へ流れ切ったとき）
const STEP = 6

export function useTuckOnScroll(target: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [tucked, setTucked] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let last = window.scrollY
    const check = () => {
      const y = window.scrollY
      const dy = y - last
      // 細かい揺れ（トラックパッドの慣性の終わりなど）では切り替えない
      if (Math.abs(dy) < STEP) return
      last = y
      const el = target.current
      const before = el?.previousElementSibling
      const topbar = document.querySelector('nav.tabs')
      if (!el || !before || !topbar) return
      // zoom の画面でも同じ座標で比べられるよう、どちらも画面上の位置で測る
      const stuck = before.getBoundingClientRect().bottom < topbar.getBoundingClientRect().bottom
      const next = dy > 0 && stuck
      setTucked((cur) => (cur === next ? cur : next))
    }
    window.addEventListener('scroll', check, { passive: true })
    return () => {
      window.removeEventListener('scroll', check)
      setTucked(false)
    }
  }, [target, enabled])
  return enabled && tucked
}
