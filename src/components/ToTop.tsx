import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import { scrollToTop } from '../lib/pageScroll'
import { UpIcon } from './Icons'

// 長い一覧（記録・ブラウズ）を流したときに出る「いちばん上へ」。画面の1.5倍より下まで流したら出す。
// 上の検索や並べ替えへ戻るのに、流した分をまた流し戻さなくてよいように。いまの分類をもう一度押しても上へ戻る
export function ToTop(props: { enabled: boolean }) {
  const [far, setFar] = useState(false)
  useEffect(() => {
    if (!props.enabled) return
    const check = () => setFar(window.scrollY > window.innerHeight * 1.5)
    check()
    window.addEventListener('scroll', check, { passive: true })
    return () => {
      window.removeEventListener('scroll', check)
      setFar(false)
    }
  }, [props.enabled])
  if (!props.enabled || !far) return null
  return (
    <button type="button" className="totop" aria-label={t('いちばん上へ', 'Back to top')} title={t('いちばん上へ', 'Back to top')} onClick={scrollToTop}>
      <UpIcon />
    </button>
  )
}
