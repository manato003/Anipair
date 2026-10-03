// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrefetchTaste } from './usePrefetchTaste'

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})
afterEach(() => {
  vi.useRealTimers()
  // jsdom の既定（visible）に戻す
  delete (document as { visibilityState?: unknown }).visibilityState
})

describe('usePrefetchTaste', () => {
  it('prefetches once, a few seconds after the screen is shown', () => {
    const prefetch = vi.fn(async () => undefined)
    renderHook(() => usePrefetchTaste('t', true, { delayMs: 5000, prefetch }))
    vi.advanceTimersByTime(4999)
    expect(prefetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(prefetch).toHaveBeenCalledTimes(1)
    expect(prefetch).toHaveBeenCalledWith('t')
    vi.advanceTimersByTime(60_000)
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a token or while the screen is hidden, and counts again from the start when it comes back', () => {
    const prefetch = vi.fn(async () => undefined)
    const { rerender } = renderHook(({ token, shown }) => usePrefetchTaste(token, shown, { delayMs: 5000, prefetch }), {
      initialProps: { token: null as string | null, shown: true },
    })
    vi.advanceTimersByTime(10_000)
    expect(prefetch).not.toHaveBeenCalled()

    rerender({ token: 't', shown: true })
    vi.advanceTimersByTime(3000)
    rerender({ token: 't', shown: false })
    vi.advanceTimersByTime(10_000)
    expect(prefetch).not.toHaveBeenCalled()

    rerender({ token: 't', shown: true })
    vi.advanceTimersByTime(4999)
    expect(prefetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('waits for the browser tab to become visible', () => {
    const prefetch = vi.fn(async () => undefined)
    setVisibility('hidden')
    renderHook(() => usePrefetchTaste('t', true, { delayMs: 1000, prefetch }))
    vi.advanceTimersByTime(5000)
    expect(prefetch).not.toHaveBeenCalled()
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(prefetch).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('never surfaces a failure', async () => {
    const prefetch = vi.fn(async () => {
      throw new Error('boom')
    })
    // 捨てそこなうと、未処理の拒否として vitest がこのテストを失敗にする
    renderHook(() => usePrefetchTaste('t', true, { delayMs: 10, prefetch }))
    vi.advanceTimersByTime(10)
    await vi.advanceTimersByTimeAsync(10)
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('a new token gets its own prefetch', () => {
    const prefetch = vi.fn<(token: string) => Promise<void>>(async () => undefined)
    const { rerender } = renderHook(({ token }) => usePrefetchTaste(token, true, { delayMs: 10, prefetch }), { initialProps: { token: 'a' } })
    vi.advanceTimersByTime(10)
    rerender({ token: 'b' })
    vi.advanceTimersByTime(10)
    expect(prefetch.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
  })
})
