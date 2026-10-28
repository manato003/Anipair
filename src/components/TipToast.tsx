import { useEffect } from 'react'
import { dismissTip, useTip } from '../lib/tips'

// 一度だけの知らせ（lib/tips.ts）。前回の内容の一言（StaleNote）と同じ札で画面の下に浮かべ、少し読める間をおいて消す
const SHOW_MS = 6000

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
        <p key={tip.key} className="tip-toast">
          {tip.text}
        </p>
      )}
    </div>
  )
}
