import { useEffect } from 'react'
import { Pair } from '../../components/Mascot'
import { t } from '../../lib/i18n'
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
            <b>{t('称号を手に入れた', 'Title earned')}</b>
            <span>
              {t(`「${toast.name}」`, `“${toast.name}”`)}
              {toast.more > 0 && t(`ほか${toast.more}つ`, ` +${toast.more} more`)}
            </span>
            <small>{t('記録の「実績」で見られます', 'See it under Achievements in Records')}</small>
          </span>
        </button>
      )}
    </div>
  )
}
