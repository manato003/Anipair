// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelpButton } from './Help'

afterEach(async () => {
  cleanup()
  // シートを閉じたあとに履歴が元に戻るまで待つ（Sheet.test と同じ）
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

describe('HelpButton', () => {
  it('opens the help for this screen first, with the other screens folded below, and closes', () => {
    const onOpenChange = vi.fn()
    render(<HelpButton topic="match" onOpenChange={onOpenChange} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '使い方' }))
    const dialog = screen.getByRole('dialog', { name: '使い方' })
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    // この画面の使い方が最初の見出し。ほかの画面は畳んで並ぶ（この画面は入れない）
    expect(within(dialog).getAllByRole('heading', { level: 3 })[0].textContent).toBe('この画面（マッチング）')
    expect(within(dialog).getByText('提案してもらう')).toBeTruthy()
    const folded = [...dialog.querySelectorAll('details summary')].map((s) => s.textContent)
    expect(folded).toEqual(['評価', '記録', 'ブラウズ', '設定'])

    fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })
})
