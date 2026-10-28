import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  SEASON_NAMES,
  clampSeason,
  compareSeasons,
  nextSeason,
  previousSeason,
  sameSeason,
  seasonNameLabel,
  yearsDescending,
  type Season,
  type SeasonName,
} from '../lib/season'
import { getLang, t } from '../lib/i18n'
import { BackIcon, NextIcon } from './Icons'
import { layerZoom, useSheetLayer } from './sheetLayer'

interface Props {
  value: Season
  // 選べる範囲（両端を含む）
  min: Season
  max: Season
  // パネルで選んだとき。範囲に収めてから渡す
  onChange: (season: Season) => void
  // ‹ › の1期送り。画面ごとの動き（空のクールを飛ばすなど）に合わせられるよう、渡さなければ onChange に1期ぶん進めた値を渡す
  onPrevious?: () => void
  onNext?: () => void
}

// パネルを置く余白（画面の端・ボタンとのあいだ）
const EDGE = 16
const GAP = 8

// ‹ 2026年 秋 ▾ › 。隣のクールへは ‹ › で、遠いクールへは真ん中のボタンで開くパネルで動く。
// ‹ › と真ん中のボタンは、どれも枠も塗りも無いボタンにして、1つのまとまりに見せる。パネルは不透明な板（ボタンの下に開く）。
// パネルでは年を選んでから季節を押すと、そのクールへ移って閉じる。外側を押す・Esc・ページを流すと、移らずに閉じる。
// パネルは画面ごとの層（シートと同じ）に描く。見出しや帯の重なりの中で描くと、下に潜る
export function SeasonPicker({ value, min, max, onChange, onPrevious, onNext }: Props) {
  const shown = clampSeason(value, min, max)
  const years = yearsDescending(min, max)
  const [open, setOpen] = useState(false)
  // パネルで見ている年（季節を押すまでは移らない）
  const [year, setYear] = useState(shown.year)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const layer = useSheetLayer()

  const pick = (next: Season) => {
    const target = clampSeason(next, min, max)
    if (!sameSeason(target, shown)) onChange(target)
  }
  const outOfRange = (s: Season) => compareSeasons(s, min) < 0 || compareSeasons(s, max) > 0

  // 開くときに、ボタンの真下に置く。広い画面ではボタンの中央に、狭い画面では画面の端から端までに収める
  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const z = layerZoom(layer)
    const vw = window.innerWidth / z
    const width = Math.min(340, vw - EDGE * 2)
    const left = Math.min(Math.max(EDGE, (r.left + r.width / 2) / z - width / 2), vw - width - EDGE)
    setPos({ top: r.bottom / z + GAP, left, width })
    setYear(shown.year)
    setOpen(true)
  }
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  // 開いたら、いま選んでいる年にフォーカスを置く
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLButtonElement>('.courpick__years [aria-pressed="true"]')?.focus()
  }, [open])

  // 外側を押す・ページを流す・画面の大きさが変わると閉じる。
  // scroll は捕捉で拾うので、パネルの中（年の一覧）を流したときは閉じない
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) close(false)
    }
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && panelRef.current?.contains(e.target))) close(false)
    }
    const onResize = () => close(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // Esc で閉じる。← → はパネルの中では分類の切り替えに渡さない
  const onPanelKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close(true)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation()
  }

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={onPrevious ?? (() => pick(previousSeason(shown)))}
        disabled={compareSeasons(shown, min) <= 0}
        aria-label={t('前のクール', 'Previous season')}
      >
        <BackIcon />
      </button>
      <button
        ref={buttonRef}
        type="button"
        className="stepper__current"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t(`クールを選ぶ（いまは ${shown.year}年 ${seasonNameLabel(shown.name)}）`, `Choose a season (currently ${seasonNameLabel(shown.name)} ${shown.year})`)}
        onClick={toggle}
      >
        {/* 英語は季節が先（Fall 2026） */}
        {getLang() === 'en' ? (
          <>
            <span className="stepper__season">{seasonNameLabel(shown.name)}</span> <span className="stepper__year">{shown.year}</span>
          </>
        ) : (
          <>
            <span className="stepper__year">{`${shown.year}年`}</span>{/* i18n-ok: 日本語の画面だけの枝 */}
            <span className="stepper__season">{seasonNameLabel(shown.name)}</span>
          </>
        )}
        <span className="stepper__caret" aria-hidden />
      </button>
      <button
        type="button"
        className="stepper__btn"
        onClick={onNext ?? (() => pick(nextSeason(shown)))}
        disabled={compareSeasons(shown, max) >= 0}
        aria-label={t('次のクール', 'Next season')}
      >
        <NextIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="courpick"
            role="dialog"
            aria-label={t('クールを選ぶ', 'Choose a season')}
            style={pos ?? undefined}
            onKeyDown={onPanelKey}
            data-no-swipe
          >
            <p className="courpick__label">{t('年', 'Year')}</p>
            <div className="courpick__years" role="group" aria-label={t('年', 'Year')}>
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
            <p className="courpick__label">{t('季節', 'Season')}</p>
            <div className="courpick__seasons" role="group" aria-label={t('季節', 'Season')}>
              {SEASON_NAMES.map((name: SeasonName) => {
                const s = { year, name }
                return (
                  <button
                    key={name}
                    type="button"
                    aria-current={sameSeason(s, shown) ? 'true' : undefined}
                    disabled={outOfRange(s)}
                    onClick={() => {
                      pick(s)
                      close(true)
                    }}
                  >
                    {seasonNameLabel(name)}
                  </button>
                )
              })}
            </div>
          </div>,
          layer,
        )}
    </div>
  )
}
