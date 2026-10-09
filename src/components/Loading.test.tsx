// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Loading } from './Loading'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Loading', () => {
  it('shows the label at once and never a count of seconds, then a word after 15s (so it does not look frozen)', () => {
    render(<Loading label="作品を読み込み中" />)
    expect(screen.getByRole('status').textContent).toBe('作品を読み込み中')
    act(() => vi.advanceTimersByTime(14000))
    expect(screen.getByRole('status').textContent).toBe('作品を読み込み中')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('通信に時間がかかっています。このまま待つと続きます。')).toBeTruthy()
  })

  it('estimates the time left from the pace so far, once a few steps are done', () => {
    const at = (done: number) => <Loading label="似た作品を検索中" remaining={{ done, total: 100 }} />
    const { rerender } = render(at(0))
    // 1件 1秒の速さで進む。3件・2秒に届くまでは見積もらない
    for (let done = 1; done <= 2; done++) {
      act(() => vi.advanceTimersByTime(1000))
      rerender(at(done))
      expect(screen.getByRole('status').textContent).toBe('似た作品を検索中')
    }
    act(() => vi.advanceTimersByTime(1000))
    rerender(at(3))
    // 残り97件 × 1秒 ≒ 1分37秒 → 分に丸める
    expect(screen.getByRole('status').textContent).toBe('似た作品を検索中・残り約2分')
    for (let done = 4; done <= 60; done++) {
      act(() => vi.advanceTimersByTime(1000))
      rerender(at(done))
    }
    expect(screen.getByRole('status').textContent).toBe('似た作品を検索中・残り約40秒')
  })

  it('starts over when the work changes (another total)', () => {
    const { rerender } = render(<Loading label="x" remaining={{ done: 0, total: 30 }} />)
    for (let done = 1; done <= 5; done++) {
      act(() => vi.advanceTimersByTime(1000))
      rerender(<Loading label="x" remaining={{ done, total: 30 }} />)
    }
    expect(screen.getByRole('status').textContent).toBe('x・残り約30秒')
    rerender(<Loading label="x" remaining={{ done: 0, total: 50 }} />)
    expect(screen.getByRole('status').textContent).toBe('x')
  })

  it('waits for the delay before showing anything (no flicker on quick loads)', () => {
    render(<Loading label="詳しい情報を読み込み中" delay={800} />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(800))
    expect(screen.getByRole('status')).toBeTruthy()
  })
})
