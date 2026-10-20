import { useEffect, useRef } from 'react'
import { t } from '../../lib/i18n'
import { useModalFocus } from '../../lib/useModalFocus'
import { TitlePlate } from './TitlePlate'
import { byRarity, type Title } from './titles'

// 初めて実績を開いたときに1回だけ出す「覚醒」。解放された称号を、1つずつ浮かび上がらせてまとめて見せる
// （たくさん記録している人に、何十個もの演出を1つずつ浴びせないため）。
// 押すまで閉じない（読み終えるのを待つ）が、ボタンは最初から押せる
const SHOW_MAX = 12

export function Awakening({ titles, onClose }: { titles: Title[]; onClose: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Tab を演出の中で回し、閉じたら開く前の場所に戻す（開く前の場所を、ボタンに移す前に覚える）
  const rootRef = useRef<HTMLDivElement>(null)
  useModalFocus(rootRef)
  useEffect(() => {
    buttonRef.current?.focus()
  }, [])
  // レア度の高いものから選び、低い順に出す（いちばん良いものが最後に浮かび上がる）
  const shown = [...titles].sort(byRarity).reverse().slice(0, SHOW_MAX).reverse()
  const rest = titles.length - shown.length
  const hiddenCount = titles.filter((t) => t.group === 'hidden').length

  return (
    <div ref={rootRef} className="awaken" role="dialog" aria-modal="true" aria-labelledby="awaken-title">
      <span className="awaken__rays" aria-hidden />
      <div className="awaken__body">
        {titles.length > 0 ? (
          <>
            <p className="awaken__eyebrow">{t('Annictでの歩みを読み解いた', 'We read through your Annict history')}</p>
            <h2 id="awaken-title" className="awaken__title">
              {t('封印されし称号が、目覚めた', 'Sealed titles have awakened')}
            </h2>
            <p className="awaken__count">
              <span className="awaken__num">{titles.length}</span>
              {t(' の称号を手に入れました', titles.length === 1 ? ' title earned' : ' titles earned')}
              {hiddenCount > 0 && <span className="awaken__hidden">{t(`（うち隠し称号 ${hiddenCount}）`, ` (${hiddenCount} hidden)`)}</span>}
            </p>
            <ul className="awaken__list">
              {shown.map((t, i) => (
                <li key={t.id} className={`awaken__item rarity--${t.rarity}`} style={{ animationDelay: `${0.9 + i * 0.22}s` }}>
                  <TitlePlate name={t.name} rarity={t.rarity} size="sm" />
                </li>
              ))}
              {rest > 0 && (
                <li className="awaken__item awaken__item--rest" style={{ animationDelay: `${0.9 + shown.length * 0.22}s` }}>
                  {t(`ほか ${rest} の称号`, `and ${rest} more`)}
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            <p className="awaken__eyebrow">{t('Annictでの歩みを読み解いた', 'We read through your Annict history')}</p>
            <h2 id="awaken-title" className="awaken__title">
              {t('称号は、まだ眠っている', 'Your titles are still asleep')}
            </h2>
            <p className="awaken__count">{t('評価画面でクールの作品に答えていくと、最初の称号が目覚めます。', 'Answer anime from a season on the Rate screen, and your first title will awaken.')}</p>
          </>
        )}
        <button ref={buttonRef} type="button" className="btn btn--primary awaken__button" onClick={onClose}>
          {titles.length > 0 ? t('受け取る', 'Claim') : t('はじめる', 'Get started')}
        </button>
      </div>
    </div>
  )
}
