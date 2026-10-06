// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/annict', () => ({ fetchViewer: vi.fn(async () => ({ username: 'u', name: 'n' })) }))

const { AnnictHealth } = await import('./AnnictHealth')
const { fetchViewer } = await import('../../lib/annict')
const { recordAnnictHealth, resetAnnictHealth } = await import('../../lib/annictHealth')

beforeEach(() => {
  resetAnnictHealth()
  vi.mocked(fetchViewer).mockClear()
})
afterEach(cleanup)

describe('AnnictHealth', () => {
  it('shows the API URL with a gray dot until something was asked, then follows what the app hears', () => {
    const { container } = render(<AnnictHealth token="t" />)
    expect(screen.getByText('api.annict.com')).toBeTruthy()
    expect(screen.getByText('まだ問い合わせていません')).toBeTruthy()
    expect(container.querySelector('.health--unknown')).not.toBeNull()
    act(() => recordAnnictHealth({ at: Date.now(), ms: 15_300, ok: true }))
    expect(screen.getByText('混み合っています')).toBeTruthy()
    expect(screen.getByText('応答 15秒・たった今')).toBeTruthy()
    expect(container.querySelector('.health--slow')).not.toBeNull()
    act(() => recordAnnictHealth({ at: Date.now(), ms: 100, ok: false, failure: 'server', status: 502 }))
    expect(container.querySelector('.health--down')).not.toBeNull()
    expect(screen.getByText('エラーを返しています（HTTP 502）')).toBeTruthy()
  })

  it('sends one light query only when asked', async () => {
    render(<AnnictHealth token="t" />)
    expect(fetchViewer).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'いま確かめる' }))
    })
    expect(fetchViewer).toHaveBeenCalledTimes(1)
    expect(fetchViewer).toHaveBeenCalledWith('t')
  })
})
