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
import { useSheetLayer } from './sheetLayer'

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
// ボタンは枠も塗りも無い文字だけにして、地に溶け込ませる。パネルは地の色を透かした半透明の板（ボタンの下に開く）。
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
    const width = Math.min(340, window.innerWidth - EDGE * 2)
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - width / 2), window.innerWidth - width - EDGE)
    setPos({ top: r.bottom + GAP, left, width })
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

  // 外側を押す・ページを流す・画面の大きさが変わると閉じる
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) close(false)
    }
    const onMove = () => close(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
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
        aria-label="前のクール"
      >
        ‹
      </button>
      <button
        ref={buttonRef}
        type="button"
        className="stepper__current"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`クールを選ぶ（いまは ${shown.year}年 ${seasonNameLabel(shown.name)}）`}
        onClick={toggle}
      >
        <span className="stepper__year">{shown.year}年</span>
        <span className="stepper__season">{seasonNameLabel(shown.name)}</span>
        <span className="stepper__caret" aria-hidden />
      </button>
      <button
        type="button"
        className="stepper__btn"
        onClick={onNext ?? (() => pick(nextSeason(shown)))}
        disabled={compareSeasons(shown, max) >= 0}
        aria-label="次のクール"
      >
        ›
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="courpick"
            role="dialog"
            aria-label="クールを選ぶ"
            style={pos ?? undefined}
            onKeyDown={onPanelKey}
            data-no-swipe
          >
            <p className="courpick__label">年</p>
            <div className="courpick__years" role="group" aria-label="年">
              {years.map((y) => (
                <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
            <p className="courpick__label">季節</p>
            <div className="courpick__seasons" role="group" aria-label="季節">
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
