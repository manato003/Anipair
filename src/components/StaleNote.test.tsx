// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaleNote } from './StaleNote'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const at = new Date(2026, 9, 6, 12, 30).toISOString()

describe('StaleNote', () => {
  it('says nothing while the reread is quick, and speaks up after 5 seconds', () => {
    render(<StaleNote at={at} error={null} />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status').textContent).toContain('前回（10/6 12:30）の内容を表示しながら読み直しています')
  })

  it('tells at once when the reread failed, with a retry', () => {
    const retry = vi.fn()
    render(<StaleNote at={at} error="Annict に接続できませんでした" onRetry={retry} />)
    expect(screen.getByRole('alert').textContent).toContain('Annict から読み直せませんでした（Annict に接続できませんでした）。前回（10/6 12:30）の内容を表示しています。')
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }))
    expect(retry).toHaveBeenCalled()
  })

  it('shows nothing when the screen is not showing stored data', () => {
    render(<StaleNote at={null} error={null} />)
    act(() => vi.advanceTimersByTime(6000))
    expect(document.body.textContent).toBe('')
  })
})
