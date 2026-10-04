import { useEffect, useRef } from 'react'
import { TitlePlate } from './TitlePlate'
import { byRarity, type Title } from './titles'

// 初めて実績を開いたときに1回だけ出す「覚醒」。解放された称号を、1つずつ浮かび上がらせてまとめて見せる
// （たくさん記録している人に、何十個もの演出を1つずつ浴びせないため）。
// 押すまで閉じない（読み終えるのを待つ）が、ボタンは最初から押せる
const SHOW_MAX = 12

export function Awakening({ titles, onClose }: { titles: Title[]; onClose: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    buttonRef.current?.focus()
  }, [])
  // レア度の高いものから選び、低い順に出す（いちばん良いものが最後に浮かび上がる）
  const shown = [...titles].sort(byRarity).reverse().slice(0, SHOW_MAX).reverse()
  const rest = titles.length - shown.length
  const hiddenCount = titles.filter((t) => t.group === 'hidden').length

  return (
    <div className="awaken" role="dialog" aria-modal="true" aria-labelledby="awaken-title">
      <span className="awaken__rays" aria-hidden />
      <div className="awaken__body">
        {titles.length > 0 ? (
          <>
            <p className="awaken__eyebrow">Annict での歩みを読み解いた</p>
            <h2 id="awaken-title" className="awaken__title">
              封印されし称号が、目覚めた
            </h2>
            <p className="awaken__count">
              <span className="awaken__num">{titles.length}</span> の称号を手に入れました
              {hiddenCount > 0 && <span className="awaken__hidden">（うち隠し称号 {hiddenCount}）</span>}
            </p>
            <ul className="awaken__list">
              {shown.map((t, i) => (
                <li key={t.id} className={`awaken__item rarity--${t.rarity}`} style={{ animationDelay: `${0.9 + i * 0.22}s` }}>
                  <TitlePlate name={t.name} rarity={t.rarity} size="sm" />
                </li>
              ))}
              {rest > 0 && (
                <li className="awaken__item awaken__item--rest" style={{ animationDelay: `${0.9 + shown.length * 0.22}s` }}>
                  ほか {rest} の称号
                </li>
              )}
            </ul>
          </>
        ) : (
          <>
            <p className="awaken__eyebrow">Annict での歩みを読み解いた</p>
            <h2 id="awaken-title" className="awaken__title">
              称号は、まだ眠っている
            </h2>
            <p className="awaken__count">評価画面でクールの作品に答えていくと、最初の称号が目覚めます。</p>
          </>
        )}
        <button ref={buttonRef} type="button" className="btn btn--primary awaken__button" onClick={onClose}>
          {titles.length > 0 ? '受け取る' : 'はじめる'}
        </button>
      </div>
    </div>
  )
}
