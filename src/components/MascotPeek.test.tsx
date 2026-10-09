// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MascotPeek } from './MascotPeek'

let random: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.useFakeTimers()
  random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.effects
  delete document.documentElement.dataset.motion
  document.body.replaceChildren()
})

const peek = () => document.querySelector('.peek')
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('MascotPeek', () => {
  it('peeks out after a while of no input (10〜20 seconds), and stays until the user touches the screen', () => {
    render(<MascotPeek enabled />)
    // 乱数 0.5: 最初は 15 秒後に「のぞく」
    wait(14_000)
    expect(peek()).toBeNull()
    wait(1_500)
    expect(peek()?.classList.contains('peek--peek')).toBe(true)
    // 触れるまで居続ける
    wait(120_000)
    expect(peek()).toBeTruthy()
    // 画面のどこかに触れると、引っ込む
    fireEvent.pointerDown(document.body)
    expect(peek()?.classList.contains('peek--leave')).toBe(true)
    wait(700)
    expect(peek()).toBeNull()
    // 次は 30 秒〜1 分後（乱数 0.5 で 45 秒後）。操作の直後なので、止まるまで待ってから
    wait(52_000)
    expect(peek()).toBeTruthy()
  })

  it('cheers when the peeking one itself is touched, then goes down', () => {
    render(<MascotPeek enabled />)
    wait(15_500)
    fireEvent.pointerDown(document.querySelector('.peek__body') as Element)
    expect(peek()?.classList.contains('peek--cheer')).toBe(true)
    expect(peek()?.classList.contains('peek--leave')).toBe(false)
    wait(1_000)
    expect(peek()?.classList.contains('peek--leave')).toBe(true)
    wait(700)
    expect(peek()).toBeNull()
  })

  it('takes a slow walk across: both together (Ani leading), or one of them alone', () => {
    // 待ち時間・のぞくか歩くか（0.9 で歩く）・誰が歩くか（0.1 で2人）・向き
    random.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9).mockReturnValueOnce(0.1).mockReturnValueOnce(0.2)
    const { unmount } = render(<MascotPeek enabled />)
    wait(15_500)
    expect(peek()?.classList.contains('peek--walk')).toBe(true)
    const bodies = [...document.querySelectorAll('.peek__body')].map((b) => b.getAttribute('class'))
    expect(bodies).toEqual([expect.stringContaining('peek__body--ani'), expect.stringContaining('peek__body--pair')])
    // ゆっくり（1 秒に 40px。jsdom の画面幅 1024px なら 30 秒ほど）。そのあいだは触れても消えない
    fireEvent.pointerDown(document.body)
    wait(20_000)
    expect(peek()).toBeTruthy()
    wait(15_000)
    expect(peek()).toBeNull()
    unmount()

    random.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9).mockReturnValueOnce(0.9).mockReturnValueOnce(0.2)
    render(<MascotPeek enabled />)
    wait(15_500)
    expect([...document.querySelectorAll('.peek__body')].map((b) => b.getAttribute('class'))).toEqual([expect.stringContaining('peek__body--pair')])
  })

  it('waits while the user is operating', () => {
    render(<MascotPeek enabled />)
    wait(13_000)
    fireEvent.pointerDown(window)
    wait(3_000)
    expect(peek()).toBeNull()
    wait(7_000)
    expect(peek()).toBeTruthy()
  })

  it('does not come out with effects off, reduced motion, an open sheet, or on the screens with answer buttons', () => {
    document.documentElement.dataset.effects = 'off'
    const r1 = render(<MascotPeek enabled />)
    wait(200_000)
    expect(peek()).toBeNull()
    r1.unmount()
    delete document.documentElement.dataset.effects

    document.documentElement.dataset.motion = 'reduce'
    const r2 = render(<MascotPeek enabled />)
    wait(200_000)
    expect(peek()).toBeNull()
    r2.unmount()
    delete document.documentElement.dataset.motion

    const sheet = document.createElement('div')
    sheet.setAttribute('aria-modal', 'true')
    document.body.appendChild(sheet)
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const r3 = render(<MascotPeek enabled />)
    wait(200_000)
    expect(peek()).toBeNull()
    r3.unmount()
    sheet.remove()

    render(<MascotPeek enabled={false} />)
    wait(200_000)
    expect(peek()).toBeNull()
  })

  it('is hidden from screen readers', () => {
    render(<MascotPeek enabled />)
    wait(15_500)
    expect(peek()?.getAttribute('aria-hidden')).toBe('true')
  })
})
