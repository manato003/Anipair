// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTip, tellOnce } from '../lib/tips'
import { TipToast } from './TipToast'

beforeEach(() => {
  localStorage.clear()
  resetTip()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('TipToast', () => {
  it('tells a tip only the first time, and hides it after a while', () => {
    vi.useFakeTimers()
    render(<TipToast />)
    act(() => tellOnce('wannaToAnnict', '見たいリストに入ります。'))
    expect(screen.getByRole('status').textContent).toBe('見たいリストに入ります。')
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByRole('status').textContent).toBe('')
    act(() => tellOnce('wannaToAnnict', '見たいリストに入ります。'))
    expect(screen.getByRole('status').textContent).toBe('')
    // ほかの知らせは別に数える
    act(() => tellOnce('tierNotRating', '評価は変わりません。'))
    expect(screen.getByRole('status').textContent).toBe('評価は変わりません。')
  })

  it('remembers on the device, so a reload does not tell it again', () => {
    tellOnce('passOnDevice', 'この端末だけ。')
    expect(JSON.parse(localStorage.getItem('animax.tipsSeen.v1') ?? '[]')).toEqual(['passOnDevice'])
    resetTip()
    render(<TipToast />)
    act(() => tellOnce('passOnDevice', 'この端末だけ。'))
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
