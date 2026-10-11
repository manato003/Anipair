// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeedbackSheet } from './FeedbackSheet'

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

function fill(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /内容/ }), { target: { value: text } })
}

describe('FeedbackSheet', () => {
  it('sends the kind, the text and the optional reply address to the site function, then thanks', async () => {
    const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 201 }))
    vi.stubGlobal('fetch', fetchFn)
    render(<FeedbackSheet onClose={() => undefined} />)
    const send = screen.getByRole('button', { name: '送る' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '要望' }))
    fill('ダークモードの色を選べるとうれしいです')
    fireEvent.change(screen.getByRole('textbox', { name: /返信先/ }), { target: { value: '@me' } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    await screen.findByText('送りました。ありがとうございます。')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/feedback')
    expect(JSON.parse(init.body as string)).toEqual({ kind: 'idea', body: 'ダークモードの色を選べるとうれしいです', contact: '@me', device: null, website: '' })
  })

  it('keeps the text and says what to do when sending fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"not_configured"}', { status: 503 })))
    render(<FeedbackSheet onClose={() => undefined} />)
    fill('記録の一覧で表紙が出ません')
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect((await screen.findByRole('alert')).textContent).toContain('X（@anipairAPP）')
    expect((screen.getByRole('textbox', { name: /内容/ }) as HTMLTextAreaElement).value).toBe('記録の一覧で表紙が出ません')
  })

  it('adds the app version and device when the box is left checked', async () => {
    const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 201 }))
    vi.stubGlobal('fetch', fetchFn)
    render(<FeedbackSheet onClose={() => undefined} />)
    fill('話ごとの記録が保存できません')
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    await screen.findByText('送りました。ありがとうございます。')
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { device: string; kind: string }
    expect(body.kind).toBe('bug')
    expect(body.device.startsWith('Anipair ')).toBe(true)
  })
})
