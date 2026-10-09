// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LegalLinks } from './LegalLinks'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const page = (title: string, body: string) =>
  `<!doctype html><html><body><main><div class="top"><a class="back" href="/">アプリを開く</a></div><h1>${title}</h1>${body}</main></body></html>`

describe('LegalLinks', () => {
  it('opens the terms inside the app (not in a new tab), without the static page header, and switches to the policy from a link in it', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(
        url === '/terms.html'
          ? page('利用規約', '<p class="note"><a href="/privacy.html">プライバシーポリシー</a> <a href="https://annict.com/terms">Annict の利用規約</a></p>')
          : page('プライバシーポリシー', '<p>本文</p>'),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<LegalLinks />)
    const link = screen.getByRole('link', { name: '利用規約' })
    // 新しいタブで開く設定は無い（アプリの中で開く）。URL は残す（Ctrl などで別のタブにも開ける）
    expect(link.getAttribute('target')).toBeNull()
    expect(link.getAttribute('href')).toBe('/terms.html')
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { level: 1, name: '利用規約' })).toBeTruthy()
    expect(screen.queryByText('アプリを開く')).toBeNull()
    // 外のサイトへのリンクだけ新しいタブ
    expect(screen.getByRole('link', { name: 'Annict の利用規約' }).getAttribute('target')).toBe('_blank')
    fireEvent.click(screen.getAllByRole('link', { name: 'プライバシーポリシー' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeTruthy())
    expect(fetchMock).toHaveBeenLastCalledWith('/privacy.html')
  })

  it('leaves Ctrl+click to the browser (a new tab)', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<LegalLinks />)
    fireEvent.click(screen.getByRole('link', { name: '利用規約' }), { ctrlKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
