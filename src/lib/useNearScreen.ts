import { useEffect, useState } from 'react'

// 要素が画面の下 margin px 以内に来たか（一度来たら true のまま）。詳細の下の方にある欄を、近づいてから読むのに使う。
// 返す ref を、位置を測る要素に付ける。IntersectionObserver の無い環境は、すぐ true
export function useNearScreen<T extends Element>(margin = 300): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null)
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (!el || near) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: `0px 0px ${margin}px 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [el, near, margin])
  return [setEl, near]
}
