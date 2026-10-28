// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTuckOnScroll } from './useTuckOnScroll'

// 上の帯（下端 68px）・帯の前の箱・帯を置き、帯の前の箱の下端を流した量に合わせて動かす
let beforeBottom = 200
function rect(bottom: number) {
  return { top: bottom - 40, bottom, left: 0, right: 0, width: 0, height: 40, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
}

function setup() {
  document.body.innerHTML = '<nav class="tabs"></nav><div><div class="before"></div><div class="bar"></div></div>'
  document.querySelector('nav.tabs')!.getBoundingClientRect = () => rect(68)
  document.querySelector('.before')!.getBoundingClientRect = () => rect(beforeBottom)
  return { current: document.querySelector<HTMLElement>('.bar') }
}

function scrollTo(y: number) {
  beforeBottom = 200 - y
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    window.dispatchEvent(new Event('scroll'))
  })
}

beforeEach(() => {
  beforeBottom = 200
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('useTuckOnScroll', () => {
  it('帯が貼りついてから下へ流すと引っ込め、上へ流すと戻す', () => {
    const target = setup()
    const { result } = renderHook(() => useTuckOnScroll(target, true))
    scrollTo(100) // 帯の前の箱はまだ上の帯より下（帯は元の位置のまま）
    expect(result.current).toBe(false)
    scrollTo(400)
    expect(result.current).toBe(true)
    scrollTo(390)
    expect(result.current).toBe(false)
  })

  it('細かい揺れでは切り替えない', () => {
    const target = setup()
    const { result } = renderHook(() => useTuckOnScroll(target, true))
    scrollTo(400)
    scrollTo(397)
    expect(result.current).toBe(true)
  })

  it('使わないとき（スマホ・隠れた画面）は引っ込めない', () => {
    const target = setup()
    const { result, rerender } = renderHook(({ on }) => useTuckOnScroll(target, on), { initialProps: { on: true } })
    scrollTo(400)
    expect(result.current).toBe(true)
    rerender({ on: false })
    expect(result.current).toBe(false)
    scrollTo(800)
    expect(result.current).toBe(false)
  })
})
