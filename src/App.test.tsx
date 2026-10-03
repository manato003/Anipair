// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emitAnnictAuthFailed } from './lib/authEvents'

// 画面の中身はここでは見ない。App が持つ帯とタブの切り替えだけ確かめる
vi.mock('./features/rate/Backfill', () => ({ Backfill: () => <div data-testid="rate" /> }))
vi.mock('./features/match/Matching', () => ({ Matching: () => <div /> }))
vi.mock('./features/records/Records', () => ({ Records: () => <div /> }))
vi.mock('./features/browse/Browse', () => ({ Browse: () => <div /> }))
vi.mock('./features/settings/Settings', () => ({
  Settings: (p: { onAnnictTokenChange: (t: string | null) => void }) => (
    <div data-testid="settings">
      <button type="button" onClick={() => p.onAnnictTokenChange('tok-2')}>
        別のトークンにする
      </button>
    </div>
  ),
}))
vi.mock('./features/settings/useAnnictLogin', () => ({ useAnnictLogin: () => ({ busy: false, error: null, clearError: () => undefined }) }))
vi.mock('./features/backup/useAutoBackup', () => ({ useAutoBackup: () => undefined }))
// 先読みは、ここでは何もしない（本物は 5 秒後に通信を始める）
vi.mock('./features/match/usePrefetchTaste', () => ({ usePrefetchTaste: vi.fn() }))
// ログインのボタンがある環境として扱い、画面遷移は偽物にする
vi.mock('./lib/annictLogin', async (orig) => ({
  ...(await orig<typeof import('./lib/annictLogin')>()),
  annictClientId: () => 'cid',
  startLogin: vi.fn(),
}))

const { default: App } = await import('./App')
const { startLogin } = await import('./lib/annictLogin')
const { usePrefetchTaste } = await import('./features/match/usePrefetchTaste')

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('animax.annictToken', 'tok-1')
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const banner = () => screen.queryByRole('alert')

describe('App login-expired banner', () => {
  it('shows nothing until Annict rejects the current token', () => {
    render(<App />)
    expect(banner()).toBeNull()
    act(() => emitAnnictAuthFailed('tok-1'))
    expect(banner()?.textContent).toContain('Annict のログインが切れました')
  })

  it('ignores a failure of a token that is no longer the current one', () => {
    render(<App />)
    act(() => emitAnnictAuthFailed('old-token'))
    expect(banner()).toBeNull()
  })

  it('goes to the Annict login from the banner, and can be dismissed', () => {
    render(<App />)
    act(() => emitAnnictAuthFailed('tok-1'))
    fireEvent.click(screen.getByRole('button', { name: 'もう一度ログイン' }))
    expect(startLogin).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(banner()).toBeNull()
  })

  it('goes away when the token changes, and a late failure of the old token does not bring it back', () => {
    render(<App />)
    act(() => emitAnnictAuthFailed('tok-1'))
    expect(banner()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    fireEvent.click(screen.getByRole('button', { name: '別のトークンにする' }))
    expect(banner()).toBeNull()
    act(() => emitAnnictAuthFailed('tok-1'))
    expect(banner()).toBeNull()
    act(() => emitAnnictAuthFailed('tok-2'))
    expect(banner()).not.toBeNull()
  })

  it('starts the taste prefetch only while the rate screen is shown', () => {
    render(<App />)
    expect(vi.mocked(usePrefetchTaste).mock.calls.at(-1)).toEqual(['tok-1', true])
    fireEvent.click(screen.getByRole('button', { name: '記録' }))
    expect(vi.mocked(usePrefetchTaste).mock.calls.at(-1)).toEqual(['tok-1', false])
  })
})
