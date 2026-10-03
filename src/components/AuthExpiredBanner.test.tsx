// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 実際には Annict へ移ってしまうので、画面遷移は偽物にする
vi.mock('../lib/annictLogin', async (orig) => ({
  ...(await orig<typeof import('../lib/annictLogin')>()),
  startLogin: vi.fn(),
}))

const { startLogin } = await import('../lib/annictLogin')
const { AuthExpiredBanner } = await import('./AuthExpiredBanner')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AuthExpiredBanner', () => {
  it('announces that the login expired', () => {
    render(<AuthExpiredBanner clientId="cid" onOpenSettings={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toContain('Annict のログインが切れました。もう一度ログインしてください。')
  })

  it('logs in again with Annict when a client id is available', () => {
    const onOpenSettings = vi.fn()
    render(<AuthExpiredBanner clientId="cid" onOpenSettings={onOpenSettings} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'もう一度ログイン' }))
    expect(startLogin).toHaveBeenCalledTimes(1)
    expect(vi.mocked(startLogin).mock.calls[0][0]).toMatchObject({ clientId: 'cid', origin: window.location.origin })
    expect(onOpenSettings).not.toHaveBeenCalled()
  })

  it('opens the settings tab instead when there is no client id (local development)', () => {
    const onOpenSettings = vi.fn()
    render(<AuthExpiredBanner clientId={null} onOpenSettings={onOpenSettings} onDismiss={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'もう一度ログイン' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(startLogin).not.toHaveBeenCalled()
  })

  it('can be dismissed', () => {
    const onDismiss = vi.fn()
    render(<AuthExpiredBanner clientId="cid" onOpenSettings={vi.fn()} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
