// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

const sheetId = () => (window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null
const popped = () => new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }))

afterEach(async () => {
  cleanup()
  // 閉じたあとに履歴が元に戻るまで待つ
  await waitFor(() => expect(sheetId()).toBeNull())
})

// 親が開閉を持つ、実際の使い方に近い形
function Host(props: { active?: boolean; onClosed?: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      {open && (
        <Sheet
          label="テスト"
          active={props.active}
          onClose={() => {
            props.onClosed?.()
            setOpen(false)
          }}
        >
          <p>中身</p>
        </Sheet>
      )}
    </>
  )
}

describe('Sheet and the phone back button', () => {
  it('pushes one history entry while open, and the back button closes it', async () => {
    const onClosed = vi.fn()
    const push = vi.spyOn(window.history, 'pushState')
    render(<Host onClosed={onClosed} />)
    expect(push).toHaveBeenCalledTimes(1)
    push.mockRestore()
    expect(sheetId()).not.toBeNull()

    const done = popped()
    act(() => window.history.back())
    await done
    expect(onClosed).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(sheetId()).toBeNull()
  })

  it('under StrictMode it still pushes just one entry and stays open', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    render(
      <StrictMode>
        <Host />
      </StrictMode>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(push).toHaveBeenCalledTimes(1)
    push.mockRestore()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(sheetId()).not.toBeNull()
  })

  it.each([
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: '閉じる' }))],
    ['the backdrop', () => fireEvent.click(document.querySelector('.sheet-backdrop')!)],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
  ])('closing with %s gives the history entry back', async (_name, close) => {
    const onClosed = vi.fn()
    render(<Host onClosed={onClosed} />)
    expect(sheetId()).not.toBeNull()
    act(() => void close())
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(sheetId()).toBeNull())
    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('a sheet in a hidden tab keeps no history entry, and gets one when shown again', async () => {
    const { rerender } = render(<Host active={false} />)
    expect(sheetId()).toBeNull()
    rerender(<Host active />)
    expect(sheetId()).not.toBeNull()
    // 隠れたら静かに戻す（シートは開いたまま、onClose も呼ばれない）
    const onClosed = vi.fn()
    rerender(<Host active={false} onClosed={onClosed} />)
    await waitFor(() => expect(sheetId()).toBeNull())
    expect(onClosed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('back closes only the top of stacked sheets', async () => {
    const closedA = vi.fn()
    const closedB = vi.fn()
    render(
      <>
        <Sheet label="下" onClose={closedA}>
          <p>下</p>
        </Sheet>
        <Sheet label="上" onClose={closedB}>
          <p>上</p>
        </Sheet>
      </>,
    )
    const done = popped()
    act(() => window.history.back())
    await done
    expect(closedB).toHaveBeenCalledTimes(1)
    expect(closedA).not.toHaveBeenCalled()
  })
})

describe('Sheet on touch devices', () => {
  // 指で触る端末を装う（matchMedia の pointer: coarse）
  const asTouch = (coarse: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
  afterEach(() => vi.unstubAllGlobals())

  function Body() {
    return (
      <>
        <p>あらすじの文</p>
        <a href="https://example.com/">公式サイト</a>
        <button type="button">続きを読む</button>
      </>
    )
  }

  it('closes on a tap on plain content, but not on links or buttons', () => {
    asTouch(true)
    const onClose = vi.fn()
    render(
      <Sheet label="詳細" onClose={onClose}>
        <Body />
      </Sheet>,
    )
    fireEvent.click(screen.getByRole('link', { name: '公式サイト' }))
    fireEvent.click(screen.getByRole('button', { name: '続きを読む' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('あらすじの文'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hides the small close link (still there for screen readers), and shows the tap hint only until the first close', () => {
    asTouch(true)
    localStorage.clear()
    const onClose = vi.fn()
    const { unmount } = render(
      <Sheet label="詳細" onClose={onClose}>
        <Body />
      </Sheet>,
    )
    expect(screen.getByText('シートのどこかをタップすると閉じます')).toBeTruthy()
    expect(screen.getByRole('button', { name: '閉じる' }).className).toContain('visually-hidden')
    fireEvent.click(screen.getByText('あらすじの文'))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    // 2回目からは案内を出さない
    render(
      <Sheet label="詳細" onClose={onClose}>
        <Body />
      </Sheet>,
    )
    expect(screen.queryByText('シートのどこかをタップすると閉じます')).toBeNull()
    localStorage.clear()
  })

  it('with a mouse, tapping content does not close', () => {
    asTouch(false)
    const onClose = vi.fn()
    render(
      <Sheet label="詳細" onClose={onClose}>
        <Body />
      </Sheet>,
    )
    fireEvent.click(screen.getByText('あらすじの文'))
    expect(onClose).not.toHaveBeenCalled()
    // マウスでは右上の「閉じる」がそのまま見え、案内は出ない
    expect(screen.getByRole('button', { name: '閉じる' }).className).not.toContain('visually-hidden')
    expect(screen.queryByText('シートのどこかをタップすると閉じます')).toBeNull()
  })
})
