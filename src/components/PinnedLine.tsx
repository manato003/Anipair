import { useEffect, useState, type RefObject } from 'react'
import { scrollToTop } from '../lib/pageScroll'

// スマホで、いま見ているもの（クールと並べ替え）の帯が画面の上へ流れて見えなくなったら、上の端に細い1行で出す（「2026年 秋 · 人気順」）。
// 押すと、帯が見える位置まで戻る。under: 上に貼りついている箱（記録の項目のタブ）があれば、その下に出す。
// PC は帯そのものが上に残るので出さない（CSS）
export function PinnedLine(props: { target: RefObject<HTMLElement | null>; under?: RefObject<HTMLElement | null>; label: string; enabled: boolean }) {
  const [state, setState] = useState<{ show: boolean; top: number }>({ show: false, top: 0 })
  const { target, under, enabled } = props
  useEffect(() => {
    if (!enabled) return
    const check = () => {
      const el = target.current
      if (!el) return
      const top = Math.max(0, under?.current?.getBoundingClientRect().bottom ?? 0)
      const show = el.getBoundingClientRect().bottom < top
      setState((cur) => (cur.show === show && cur.top === top ? cur : { show, top }))
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      setState({ show: false, top: 0 })
    }
  }, [target, under, enabled])
  if (!enabled || !state.show) return null
  const back = () => {
    const el = target.current
    if (!el) return scrollToTop()
    const smooth = document.documentElement.dataset.motion !== 'reduce'
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - state.top - 8, behavior: smooth ? 'smooth' : 'auto' })
  }
  return (
    <button type="button" className={state.top > 0 ? 'pinline' : 'pinline pinline--top'} style={{ top: state.top }} onClick={back}>
      {props.label}
      <span className="pinline__hint" aria-hidden>
        選び直す
      </span>
    </button>
  )
}
