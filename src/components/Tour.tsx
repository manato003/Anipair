import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { registerSheet } from '../lib/sheetHistory'
import { useModalFocus } from '../lib/useModalFocus'
import type { PresentStep } from './tourSteps'

// 画面の上で示す使い方。画面を暗くし、説明するボタンだけを明るく切り抜いて、矢印つきの吹き出しで1つずつ示す。
// 一度に全部を重ねると、スマホでは吹き出しが重なって読めないので、1つずつ「次へ」で進む（どこをタップしても次へ）。
// 画面の一番外（body）に出す。画面の中の重なりの順（z-index）に左右されないように。手順の選び方は tourSteps.ts

type Rect = { top: number; left: number; width: number; height: number }

// 切り抜きの余白と、吹き出しの幅・画面の端からの間
const PAD = 6
const BUBBLE_W = 340
const EDGE = 16
const GAP = 14

export function Tour(props: { label: string; steps: readonly PresentStep[]; onClose: () => void; onText: () => void }) {
  const { steps } = props
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  // 吹き出しの高さ（画面に収まる位置を決めるのに使う。出してから測る）
  const [bubbleH, setBubbleH] = useState(0)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  // Tab を案内の中で回し、閉じたら開く前の場所に戻す（開く前の場所を、次へのボタンに移す前に覚える）
  const rootRef = useRef<HTMLDivElement>(null)
  useModalFocus(rootRef)
  const onClose = useRef(props.onClose)
  useEffect(() => {
    onClose.current = props.onClose
  })
  const last = i === steps.length - 1
  const current = steps[i]

  const next = useCallback(() => (last ? onClose.current() : setI((n) => n + 1)), [last])
  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  // 示すボタンを画面に入れてから、位置を測る。スクロールや画面の大きさが変われば測り直す
  useLayoutEffect(() => {
    const el = current.el
    // 画面の半分より高いもの（設定のカードなど）は、頭を上に合わせる（真ん中に合わせると見出しが画面の外に出る）
    const tall = el.getBoundingClientRect().height > window.innerHeight / 2
    el.scrollIntoView?.({ block: tall ? 'start' : 'center', inline: 'nearest' })
    const measure = () => {
      const r = el.getBoundingClientRect()
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [current])

  // 示す先や手順が変わったら、吹き出しの高さを測り直す（文の長さで高さが変わる）
  useLayoutEffect(() => {
    setBubbleH(bubbleRef.current?.offsetHeight ?? 0)
  }, [rect, i])

  useEffect(() => {
    nextRef.current?.focus()
  }, [i])

  // スマホの「戻る」で閉じる（シートと同じ仕組み）
  const id = useId()
  useEffect(() => registerSheet(id, () => onClose.current()), [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose.current()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    // 画面のキー操作（答えのキー）より先に受け取る
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [next, prev])

  // 吹き出しは示すボタンの下、入らなければ上、それも入らなければ（PC の大きな表紙など）右か左。
  // どこにも入らなければ（示すものが画面いっぱいのとき）画面の下端に重ねて、矢印は出さない。
  // 矢印はボタンの真ん中を指す（上下に出すときは横の位置、左右に出すときは縦の位置）
  const vw = typeof window === 'undefined' ? 390 : window.innerWidth
  const vh = typeof window === 'undefined' ? 844 : window.innerHeight
  const width = Math.min(BUBBLE_W, vw - EDGE * 2)
  let bubble: { top: number; left: number; arrow: number; place: 'below' | 'above' | 'right' | 'left' | 'over' } | null = null
  if (rect) {
    const h = bubbleH || 200
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const x = Math.min(Math.max(centerX - width / 2, EDGE), vw - width - EDGE)
    const arrowX = Math.min(Math.max(centerX - x, 18), width - 18)
    const y = Math.min(Math.max(centerY - h / 2, EDGE), vh - h - EDGE)
    const arrowY = Math.min(Math.max(centerY - y, 18), h - 18)
    const belowTop = rect.top + rect.height + GAP
    const aboveTop = rect.top - GAP - h
    const rightLeft = rect.left + rect.width + GAP
    const leftLeft = rect.left - GAP - width
    if (belowTop + h <= vh - EDGE) bubble = { top: belowTop, left: x, arrow: arrowX, place: 'below' }
    else if (aboveTop >= EDGE) bubble = { top: aboveTop, left: x, arrow: arrowX, place: 'above' }
    else if (rightLeft + width <= vw - EDGE) bubble = { top: y, left: rightLeft, arrow: arrowY, place: 'right' }
    else if (leftLeft >= EDGE) bubble = { top: y, left: leftLeft, arrow: arrowY, place: 'left' }
    else bubble = { top: vh - h - EDGE, left: x, arrow: arrowX, place: 'over' }
  }

  const stop = (e: MouseEvent) => e.stopPropagation()

  return createPortal(
    <div ref={rootRef} className="tour" role="dialog" aria-modal="true" aria-label={props.label} onClick={next}>
      {rect && <div className="tour__spot" style={rect} aria-hidden />}
      {bubble && (
        <div
          ref={bubbleRef}
          className={`tour__bubble tour__bubble--${bubble.place}`}
          style={{ top: bubble.top, left: bubble.left, width, ['--arrow' as string]: `${bubble.arrow}px` }}
          onClick={stop}
          aria-live="polite"
        >
          <div className="tour__top">
            <span className="tour__count">
              {i + 1}
              <span className="count__of">/{steps.length}</span>
              <span className="tour__tap">タップで次へ</span>
            </span>
            <button type="button" className="link" onClick={() => onClose.current()}>
              おわる
            </button>
          </div>
          <h2 className="tour__title">{current.step.title}</h2>
          <p className="tour__body">{current.step.body}</p>
          <div className="tour__actions">
            <button type="button" className="link" onClick={props.onText}>
              文章で詳しく読む
            </button>
            <span className="tour__nav">
              {i > 0 && (
                <button type="button" className="btn" onClick={prev}>
                  戻る
                </button>
              )}
              <button ref={nextRef} type="button" className="btn btn--primary" onClick={next}>
                {last ? 'わかった' : '次へ'}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
