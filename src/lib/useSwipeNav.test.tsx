// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSwipeIntercept, useSwipeNav, type SwipeDir } from './useSwipeNav'

afterEach(cleanup)

function Area(props: { onSwipe: (d: SwipeDir) => void; intercept?: (d: SwipeDir) => boolean; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeNav(ref, props.onSwipe, true)
  useSwipeIntercept(props.intercept ?? (() => false), !!props.intercept)
  return (
    <div ref={ref} data-testid="area">
      {props.children}
    </div>
  )
}

// jsdom には PointerEvent と Touch が無いので、座標を持たせたイベントを送る
function pointer(el: Element, type: string, x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperty(e, 'pointerType', { value: 'mouse' })
  el.dispatchEvent(e)
}
function touchEvent(el: Element, type: string, x: number, y: number): Event {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const t = [{ clientX: x, clientY: y }]
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : t })
  Object.defineProperty(e, 'changedTouches', { value: t })
  el.dispatchEvent(e)
  return e
}
// マウスのドラッグ（PC。払いとしては受けない）
function mouseDrag(el: Element, x0: number, x1: number) {
  pointer(el, 'pointerdown', x0, 300)
  pointer(el, 'pointerup', x1, 300)
}
// 指で横に払う（縦に dy だけずれる）
function swipe(el: Element, x0: number, x1: number, dy = 0) {
  fingerSwipe(el, [
    [x0, 300],
    [x0 + Math.sign(x1 - x0) * 20, 300 + dy / 10],
    [x1, 300 + dy],
  ])
}
// 指の払い: 途中の点を順に通る。各 touchmove の preventDefault の有無を返す
function fingerSwipe(el: Element, points: [number, number][]): boolean[] {
  const [x0, y0] = points[0]
  touchEvent(el, 'touchstart', x0, y0)
  const prevented = points.slice(1).map(([x, y]) => touchEvent(el, 'touchmove', x, y).defaultPrevented)
  const [xe, ye] = points.at(-1) ?? points[0]
  touchEvent(el, 'touchend', xe, ye)
  return prevented
}

describe('useSwipeNav', () => {
  it('turns a clear horizontal swipe into next (to the left) or prev (to the right)', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(<Area onSwipe={onSwipe} />)
    swipe(getByTestId('area'), 300, 150)
    swipe(getByTestId('area'), 150, 300)
    expect(onSwipe.mock.calls).toEqual([['next'], ['prev']])
  })

  it('ignores short or mostly vertical moves', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(<Area onSwipe={onSwipe} />)
    swipe(getByTestId('area'), 300, 260)
    swipe(getByTestId('area'), 300, 200, 200)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('takes a slanted finger swipe once it starts sideways, and stops the page from scrolling for that finger', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(<Area onSwipe={onSwipe} />)
    // 動き始めが横（12px 横・4px 下）なら、そのあと斜めに 60px 下がっても横の払い
    const prevented = fingerSwipe(getByTestId('area'), [[300, 300], [288, 304], [230, 340], [180, 360]])
    expect(prevented.every(Boolean)).toBe(true)
    expect(onSwipe).toHaveBeenCalledWith('next')
  })

  it('leaves a finger that starts vertically to the page scroll', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(<Area onSwipe={onSwipe} />)
    const prevented = fingerSwipe(getByTestId('area'), [[300, 300], [302, 315], [240, 380]])
    expect(prevented.some(Boolean)).toBe(false)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('leaves swipes that start at the screen edge to the browser (back and forward)', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(<Area onSwipe={onSwipe} />)
    fingerSwipe(getByTestId('area'), [[10, 300], [40, 302], [200, 305]])
    fingerSwipe(getByTestId('area'), [[window.innerWidth - 10, 300], [window.innerWidth - 40, 302], [window.innerWidth - 200, 305]])
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('ignores swipes that start in a text field or a marked area', () => {
    const onSwipe = vi.fn()
    const { getByRole, getByTestId } = render(
      <Area onSwipe={onSwipe}>
        <input aria-label="題名" />
        <div data-no-swipe data-testid="row" />
      </Area>,
    )
    swipe(getByRole('textbox'), 300, 100)
    swipe(getByTestId('row'), 300, 100)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('does not take a mouse drag (PC switches with the category bar; drags for selecting text misfired)', () => {
    const onSwipe = vi.fn()
    const { getByTestId } = render(<Area onSwipe={onSwipe} />)
    mouseDrag(getByTestId('area'), 300, 100)
    mouseDrag(getByTestId('area'), 100, 300)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('lets the shown screen take the swipe first (record tabs), and falls back when it declines', () => {
    const onSwipe = vi.fn()
    const take = vi.fn((d: SwipeDir) => d === 'next')
    const { getByTestId } = render(<Area onSwipe={onSwipe} intercept={take} />)
    swipe(getByTestId('area'), 300, 100)
    swipe(getByTestId('area'), 100, 300)
    expect(take.mock.calls).toEqual([['next'], ['prev']])
    expect(onSwipe.mock.calls).toEqual([['prev']])
  })
})
