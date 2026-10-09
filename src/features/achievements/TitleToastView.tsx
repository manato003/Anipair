import { useEffect } from 'react'
import { Pair } from '../../components/Mascot'
import { dismissTitleToast, useTitleToast } from './titleToast'

// 称号を手に入れたときの知らせ。右上から降りて、約3秒で戻る（styles/achievements.css）。押すと閉じる。ペアが両手を上げて喜ぶ
const SHOW_MS = 3200

export function TitleToastView() {
  const toast = useTitleToast()
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => dismissTitleToast(toast.key), SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [toast])
  return (
    <div className="titletoast__live" role="status" aria-live="polite">
      {toast && (
        <button key={toast.key} type="button" className={`titletoast rarity--${toast.rarity}`} onClick={() => dismissTitleToast(toast.key)}>
          <Pair expr="happy" arms="up" className="titletoast__mascot" />
          <span className="titletoast__body">
            <b>称号を手に入れた</b>
            <span>
              「{toast.name}」{toast.more > 0 && `ほか${toast.more}つ`}
            </span>
            <small>記録の「実績」で見られます</small>
          </span>
        </button>
      )}
    </div>
  )
}
