// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenBoundary } from './ErrorBoundary'

afterEach(cleanup)

let broken = true
function Fragile() {
  if (broken) throw new Error('壊れた')
  return <p>中身</p>
}

describe('ScreenBoundary', () => {
  it('keeps a crash inside one screen, says the others still work, and rebuilds only that screen on retry', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      broken = true
      render(
        <>
          <ScreenBoundary>
            <Fragile />
          </ScreenBoundary>
          <ScreenBoundary>
            <p>ほかの画面</p>
          </ScreenBoundary>
        </>,
      )
      expect(screen.getByRole('alert').textContent).toContain('この画面を表示できませんでした')
      expect(screen.getByRole('alert').textContent).toContain('壊れた')
      expect(screen.getByText('ほかの画面')).toBeTruthy()

      broken = false
      fireEvent.click(screen.getByRole('button', { name: 'この画面を開き直す' }))
      expect(screen.getByText('中身')).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      quiet.mockRestore()
    }
  })

  it('asks for a reload when the screen file is gone after a new release', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Stale(): never {
      throw new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/Records-x.js')
    }
    try {
      render(
        <ScreenBoundary>
          <Stale />
        </ScreenBoundary>,
      )
      expect(screen.getByRole('alert').textContent).toContain('アプリが新しくなりました')
      expect(screen.getByRole('alert').textContent).not.toContain('Failed to fetch')
      expect(screen.getByRole('button', { name: '再読み込み' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'この画面を開き直す' })).toBeNull()
    } finally {
      quiet.mockRestore()
    }
  })
})
