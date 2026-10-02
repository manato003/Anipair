// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_KEYMAP, assignKey, setKeymap } from './keymap'
import { useShortcuts } from './useShortcuts'

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

afterEach(() => {
  act(() => setKeymap({ ...DEFAULT_KEYMAP }))
  localStorage.clear()
})

describe('useShortcuts', () => {
  it('runs the handler bound to the key, ignoring case', () => {
    const wanna = vi.fn()
    renderHook(() => useShortcuts({ wanna }))
    press('W')
    press('w')
    expect(wanna).toHaveBeenCalledTimes(2)
  })

  it('follows a change made in settings without remounting', () => {
    const wanna = vi.fn()
    renderHook(() => useShortcuts({ wanna }))
    act(() => setKeymap(assignKey(DEFAULT_KEYMAP, 'wanna', 'q')))
    press('w')
    press('q')
    expect(wanna).toHaveBeenCalledTimes(1)
  })

  it('ignores typing in inputs, modifier combinations and key repeat', () => {
    const undo = vi.fn()
    renderHook(() => useShortcuts({ undo }))
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('z', {}, input)
    press('z', { ctrlKey: true })
    press('z', { repeat: true })
    expect(undo).not.toHaveBeenCalled()
    press('z')
    expect(undo).toHaveBeenCalledTimes(1)
    input.remove()
  })

  it('does nothing while disabled, and works again once enabled', () => {
    const wanna = vi.fn()
    const hook = renderHook(({ enabled }) => useShortcuts({ wanna }, enabled), { initialProps: { enabled: false } })
    press('w')
    expect(wanna).not.toHaveBeenCalled()
    hook.rerender({ enabled: true })
    press('w')
    expect(wanna).toHaveBeenCalledTimes(1)
    hook.rerender({ enabled: false })
    press('w')
    expect(wanna).toHaveBeenCalledTimes(1)
  })

  it('does nothing for actions the screen does not handle', () => {
    const pass = vi.fn()
    renderHook(() => useShortcuts({ pass }))
    press('0')
    expect(pass).not.toHaveBeenCalled()
  })
})
