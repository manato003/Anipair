import { useEffect } from 'react'
import { dismissTip, useTip } from '../lib/tips'

// 一度だけの知らせ（lib/tips.ts）。前回の内容の一言（StaleNote）と同じ札で画面の上に浮かべ、少し読める間をおいて消す
const SHOW_MS = 6000
// スマホでは、出ている画面の見出しの行（題名・「?」・マッチングの「条件」「提案し直す」）の下に置く。上の端に置くと見出しの行を隠す
const NARROW = '(max-width: 959px)'
const HEAD = '.app__screen:not([hidden]) :is(.rate__head, .rhead)'
const GAP = 8

// 出たときに一度だけ置き場所を決める（出ているあいだに見出しが動いても追わない。6秒で消えるため）
function placeBelowHead(el: HTMLElement | null): void {
  if (!el || !window.matchMedia?.(NARROW).matches) return
  const head = document.querySelector(HEAD)
  if (!head) return
  const bottom = head.getBoundingClientRect().bottom
  // 見出しが流れて画面の外にあるときは、上の端のままでよい
  if (bottom > 0) el.style.top = `${Math.round(bottom + GAP)}px`
}

export function TipToast() {
  const tip = useTip()
  useEffect(() => {
    if (!tip) return
    const timer = window.setTimeout(() => dismissTip(tip.key), SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [tip])
  return (
    <div role="status" aria-live="polite">
      {tip && (
        <p key={tip.key} ref={placeBelowHead} className="tip-toast">
          {tip.text}
        </p>
      )}
    </div>
  )
}
