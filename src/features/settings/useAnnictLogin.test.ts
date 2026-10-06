// @vitest-environment jsdom
import { StrictMode, createElement, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveOauthState } from '../../lib/storage'
import { useAnnictLogin } from './useAnnictLogin'

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

function tokenReply(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

function goTo(url: string) {
  window.history.replaceState(null, '', url)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  goTo('/')
})

describe('useAnnictLogin', () => {
  it('does nothing on a normal address', () => {
    goTo('/')
    const onToken = vi.fn()
    const { result } = renderHook(() => useAnnictLogin(onToken))
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('on a return from Annict: hands the token over (App saves it with the account switch), and cleans the address', async () => {
    saveOauthState('st')
    goTo('/?code=abc&state=st')
    tokenReply(200, { access_token: 'TOKEN' })
    const onToken = vi.fn()
    const { result } = renderHook(() => useAnnictLogin(onToken))
    // 最初の描画から「ログインしています」
    expect(result.current.busy).toBe(true)
    await waitFor(() => expect(onToken).toHaveBeenCalledWith('TOKEN'))
    // 保存は App が、持ち主の名前を確かめて記録を入れ替えるのと一度にする
    expect(localStorage.getItem('animax.annictToken')).toBeNull()
    expect(window.location.search).toBe('')
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('removes the code from the address even when the login fails', async () => {
    saveOauthState('st')
    goTo('/?code=abc&state=wrong')
    const onToken = vi.fn()
    const { result } = renderHook(() => useAnnictLogin(onToken))
    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(window.location.search).toBe('')
    expect(result.current.error).toContain('ログインの確認に失敗しました')
    expect(onToken).not.toHaveBeenCalled()
    expect(localStorage.getItem('animax.annictToken')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the cancellation on access_denied', async () => {
    saveOauthState('st')
    goTo('/?error=access_denied&state=st')
    const { result } = renderHook(() => useAnnictLogin(vi.fn()))
    await waitFor(() => expect(result.current.error).toContain('キャンセル'))
  })

  it('shows the error when the function fails, and saves nothing', async () => {
    saveOauthState('st')
    goTo('/?code=abc&state=st')
    tokenReply(400, { error: 'invalid_grant' })
    const onToken = vi.fn()
    const { result } = renderHook(() => useAnnictLogin(onToken))
    await waitFor(() => expect(result.current.error).toContain('有効期限'))
    expect(onToken).not.toHaveBeenCalled()
    expect(localStorage.getItem('animax.annictToken')).toBeNull()
  })

  it('uses the code only once under StrictMode (which runs effects twice)', async () => {
    saveOauthState('st')
    goTo('/?code=abc&state=st')
    tokenReply(200, { access_token: 'TOKEN' })
    const onToken = vi.fn()
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children)
    renderHook(() => useAnnictLogin(onToken), { wrapper })
    await waitFor(() => expect(onToken).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clearError dismisses the message', async () => {
    saveOauthState('st')
    goTo('/?code=abc&state=wrong')
    const { result } = renderHook(() => useAnnictLogin(vi.fn()))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})
