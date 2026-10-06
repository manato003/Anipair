// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// トークンの持ち主（Annict のユーザー名）。tok-2 は別の人
vi.mock('./lib/annict', async (orig) => ({
  ...(await orig<typeof import('./lib/annict')>()),
  fetchViewer: vi.fn(async (token: string) => (token === 'tok-2' ? { annictId: 2, username: 'bob', name: '' } : { annictId: 1, username: 'alice', name: '' })),
}))

// アカウントを切り替えたら、ページを読み込み直す（jsdom では読み込み直せないので、呼ばれたことだけ見る）
vi.mock('./lib/reload', () => ({ reloadPage: vi.fn() }))

const { default: App } = await import('./App')
const { reloadPage } = await import('./lib/reload')
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

  it('a late failure of an old token does not bring the banner back after logging in again', () => {
    localStorage.setItem('animax.annictToken', 'tok-2')
    render(<App />)
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
  
  // 2026-10-06 の点検: 共有の端末で、前の人の称号やパス・GitHub のつなぎが次の人に引き継がれていた
  it('switching to someone else saves the token and puts the previous records aside at once, then reloads the page', async () => {
    render(<App />)
    // 開いたときに、記録の持ち主をいまの人として覚える
    await waitFor(() => expect(localStorage.getItem('animax.owner.v1')).toBe('u1'))
    localStorage.setItem('animax.passes', '{"alice":1}')
    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    fireEvent.click(await screen.findByRole('button', { name: '別のトークンにする' }))
    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('animax.annictToken')).toBe('tok-2')
    expect(localStorage.getItem('animax.owner.v1')).toBe('u2')
    expect(localStorage.getItem('animax.passes')).toBeNull()
    expect(JSON.parse(localStorage.getItem('animax.accounts.v1')!).u1['animax.passes']).toBe('{"alice":1}')
  })

  it('reloads when another tab logs in or out', () => {
    render(<App />)
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: 'animax.annictToken' })))
    expect(reloadPage).toHaveBeenCalledTimes(1)
    // ほかの鍵の変化では読み込み直さない
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: 'animax.effects.v1' })))
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  // 2026-10-06 のセキュリティの点検（3回目）: v0.11 まではログアウトしても記録と GitHub のつなぎが残っていた。
  // その端末で次の人がログインすると、丸ごと引き継いでいた
  it('a device logged out on an older version sets the leftover records aside for the next person, without the GitHub token', async () => {
    localStorage.removeItem('animax.annictToken')
    localStorage.setItem('animax.passes', '{"old":1}')
    localStorage.setItem('animax.githubToken', 'gh-old')
    localStorage.setItem('animax.githubRepo', 'old/data')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '別のトークンにする' }))
    await waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('animax.owner.v1')).toBe('u2')
    expect(localStorage.getItem('animax.passes')).toBeNull()
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('gh-old')
    expect(JSON.parse(localStorage.getItem('animax.accounts.v1')!)['?unclaimed']['animax.passes']).toBe('{"old":1}')
  })
})
