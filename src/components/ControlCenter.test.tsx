// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setNavigator } from '../lib/navigate'
import { resetNotices, useNotice, type Notice } from '../lib/notices'
import { NoticesBell } from './ControlCenter'

afterEach(() => {
  cleanup()
  resetNotices()
  setNavigator(null)
})

function Source(props: { notice: Notice | null }) {
  useNotice(props.notice)
  return null
}

describe('NoticesBell (control center)', () => {
  it('counts the notices on the bell and lists them with their action', () => {
    const retry = vi.fn()
    render(
      <>
        <Source notice={{ id: 'a', title: '2件を保存できませんでした', body: '通信が切れました', action: { label: 'もう一度', run: retry }, urgent: true }} />
        <Source notice={{ id: 'b', title: 'Annict から読み直せませんでした' }} />
        <NoticesBell />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'コントロールセンター（知らせ 2件）' }))
    expect(screen.getByText('2件を保存できませんでした')).toBeTruthy()
    expect(screen.getByText('Annict から読み直せませんでした')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('takes a notice away when its source ends or stops showing it', () => {
    const { rerender } = render(
      <>
        <Source notice={{ id: 'a', title: '保存できませんでした' }} />
        <NoticesBell />
      </>,
    )
    expect(screen.getByRole('button', { name: 'コントロールセンター（知らせ 1件）' })).toBeTruthy()
    rerender(
      <>
        <Source notice={null} />
        <NoticesBell />
      </>,
    )
    expect(screen.getByRole('button', { name: 'コントロールセンター' })).toBeTruthy()
  })

  it('runs the newest action, not the one from when the notice first appeared', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <>
        <Source notice={{ id: 'a', title: 'x', action: { label: '送る', run: first } }} />
        <NoticesBell />
      </>,
    )
    rerender(
      <>
        <Source notice={{ id: 'a', title: 'x', action: { label: '送る', run: second } }} />
        <NoticesBell />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'コントロールセンター（知らせ 1件）' }))
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('changes the display right there (quick settings), and opens the settings screen only when asked', () => {
    const go = vi.fn()
    setNavigator(go)
    render(<NoticesBell />)
    fireEvent.click(screen.getByRole('button', { name: 'コントロールセンター' }))
    expect(screen.getByRole('heading', { name: 'コントロールセンター' })).toBeTruthy()
    expect(screen.getByText(/いま知らせはありません/)).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: '明るさ' })).getByRole('button', { name: 'もっと暗い' }))
    expect(document.documentElement.dataset.darker).toBe('')
    expect(JSON.parse(localStorage.getItem('animax.theme.v1')!).brightness).toBe('darker')
    fireEvent.click(within(screen.getByRole('group', { name: '画面の動き' })).getByRole('button', { name: '減らす' }))
    expect(document.documentElement.dataset.motion).toBe('reduce')
    expect(go).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '設定を開く' }))
    expect(go).toHaveBeenCalledWith({ tab: 'settings' })
    localStorage.clear()
  })
})
