// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveStatus } from './SaveStatus'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const noop = () => undefined
const toast = () => document.querySelector('.save-toast') as HTMLElement

describe('SaveStatus', () => {
  it('shows nothing for a quick save, and the floating pill only when saving lasts', () => {
    const { rerender } = render(<SaveStatus pending={1} failed={[]} onRetry={noop} />)
    expect(toast().textContent).toBe('')
    expect(toast().hasAttribute('data-visible')).toBe(false)
    // すぐ終わった保存では何も出ない（ちらつかない）
    act(() => vi.advanceTimersByTime(300))
    rerender(<SaveStatus pending={0} failed={[]} onRetry={noop} />)
    act(() => vi.advanceTimersByTime(1000))
    expect(toast().textContent).toBe('')
    // 続いた保存では札を出す
    rerender(<SaveStatus pending={2} failed={[]} onRetry={noop} />)
    act(() => vi.advanceTimersByTime(600))
    expect(toast().textContent).toBe('保存中（残り2件）')
    expect(toast().hasAttribute('data-visible')).toBe(true)
    rerender(<SaveStatus pending={0} failed={[]} onRetry={noop} />)
    expect(toast().textContent).toBe('')
  })

  it('keeps a failure in place with a retry', () => {
    render(<SaveStatus pending={0} failed={[{ label: '評価', message: '通信できませんでした', task: async () => undefined }]} onRetry={noop} />)
    expect(screen.getByRole('alert').textContent).toContain('1件を保存できませんでした。通信できませんでした')
    expect(screen.getByRole('button', { name: 'もう一度送る' })).toBeTruthy()
  })
})
