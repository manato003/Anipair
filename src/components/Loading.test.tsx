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
  it('shows the label at once, then the seconds after 3s and a word after 15s (so it does not look frozen)', () => {
    render(<Loading label="作品を読み込み中" />)
    expect(screen.getByRole('status').textContent).toBe('作品を読み込み中')
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByRole('status').textContent).toBe('作品を読み込み中（3秒）')
    act(() => vi.advanceTimersByTime(12000))
    expect(screen.getByText('通信に時間がかかっています。このまま待つと続きます。')).toBeTruthy()
  })

  it('waits for the delay before showing anything (no flicker on quick loads)', () => {
    render(<Loading label="詳しい情報を読み込み中" delay={800} />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(800))
    expect(screen.getByRole('status')).toBeTruthy()
  })
})
