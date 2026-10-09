// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useArrowNav } from './useArrowNav'
import type { SwipeDir } from './useSwipeNav'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Page(props: { onNav: (d: SwipeDir) => void; enabled?: boolean; dialog?: 'shown' | 'hidden' }) {
  useArrowNav(props.onNav, props.enabled ?? true)
  return (
    <div>
      <button type="button">ボタン</button>
      <input aria-label="検索" />
      <select aria-label="年">
        <option>2026</option>
      </select>
      {props.dialog && (
        <div role="dialog" aria-modal="true" hidden={props.dialog === 'hidden'}>
          シート
        </div>
      )}
    </div>
  )
}

// jsdom は配置を計算しないので、見えているかは getClientRects で決める（hidden の要素は 0 件）
function layout() {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const hidden = this.closest('[hidden]')
    return (hidden ? [] : [{}]) as unknown as DOMRectList
  })
}

describe('useArrowNav', () => {
  it('switches the category with ← and →', () => {
    layout()
    const onNav = vi.fn()
    const { getByRole } = render(<Page onNav={onNav} />)
    fireEvent.keyDown(getByRole('button'), { key: 'ArrowRight' })
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(onNav.mock.calls).toEqual([['next'], ['prev']])
  })

  it('leaves the keys to text fields and pull-downs, and to key combinations', () => {
    layout()
    const onNav = vi.fn()
    const { getByLabelText } = render(<Page onNav={onNav} />)
    fireEvent.keyDown(getByLabelText('検索'), { key: 'ArrowRight' })
    fireEvent.keyDown(getByLabelText('年'), { key: 'ArrowLeft' })
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true })
    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true })
    expect(onNav).not.toHaveBeenCalled()
  })

  it('does nothing while a dialog is shown, but ignores one left open on a hidden screen', () => {
    layout()
    const onNav = vi.fn()
    const { rerender } = render(<Page onNav={onNav} dialog="shown" />)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(onNav).not.toHaveBeenCalled()
    rerender(<Page onNav={onNav} dialog="hidden" />)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(onNav).toHaveBeenCalledWith('next')
  })

  it('does nothing when turned off (before signing in)', () => {
    layout()
    const onNav = vi.fn()
    render(<Page onNav={onNav} enabled={false} />)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(onNav).not.toHaveBeenCalled()
  })
})
