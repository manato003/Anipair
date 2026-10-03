// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerSheet } from './sheetHistory'

// jsdom の history.back() は非同期で、あとから popstate が届く
const popped = () => new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }))
async function pressBack(): Promise<void> {
  const done = popped()
  window.history.back()
  await done
}
const sheetId = () => (window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null
// 付けたものを外し、遅らせた片付けと履歴の巻き戻しが終わるのを待つ
async function settle(): Promise<void> {
  await vi.waitFor(() => expect(sheetId()).toBeNull())
}

const cleanups: (() => void)[] = []
function open(id: string, close: () => void = () => undefined) {
  const off = registerSheet(id, close)
  cleanups.push(off)
  return off
}

afterEach(async () => {
  for (const off of cleanups.splice(0)) off()
  await settle()
})

describe('registerSheet', () => {
  it('pushes one history entry for an open sheet, at the same address', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const url = location.href
    open('a')
    expect(push).toHaveBeenCalledTimes(1)
    push.mockRestore()
    expect(sheetId()).toBe('a')
    expect(location.href).toBe(url)
  })

  it('closes the sheet when the user presses back, and only calls it once', async () => {
    const close = vi.fn()
    open('a', close)
    await pressBack()
    expect(close).toHaveBeenCalledTimes(1)
    expect(sheetId()).toBeNull()
  })

  it('closes only the top sheet for one back press, then the next one for the next', async () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    open('a', closeA)
    open('b', closeB)
    expect(sheetId()).toBe('b')
    await pressBack()
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
    expect(sheetId()).toBe('a')
    await pressBack()
    expect(closeA).toHaveBeenCalledTimes(1)
    expect(sheetId()).toBeNull()
  })

  it('goes back to where it was when the sheet is closed another way, without treating that as a back press', async () => {
    const close = vi.fn()
    const off = open('a', close)
    expect(sheetId()).toBe('a')
    off()
    await settle()
    // 積んだ項目から抜けた。シートの close は呼ばれない（もう閉じているので）
    expect(close).not.toHaveBeenCalled()
    // 続けて「戻る」を押しても、別のシートの close などは動かない（余計な履歴が残っていない）
    const other = vi.fn()
    open('b', other)
    await pressBack()
    expect(other).toHaveBeenCalledTimes(1)
    expect(sheetId()).toBeNull()
  })

  it('does not leave a stray entry or close at once when the effect is detached and re-attached (StrictMode)', async () => {
    const close = vi.fn()
    const push = vi.spyOn(window.history, 'pushState')
    const off1 = registerSheet('a', close)
    off1()
    const off2 = registerSheet('a', close)
    cleanups.push(off2)
    await Promise.resolve()
    await Promise.resolve()
    expect(push).toHaveBeenCalledTimes(1)
    push.mockRestore()
    expect(sheetId()).toBe('a')
    expect(close).not.toHaveBeenCalled()
    // まだ開いているので、「戻る」で閉じる
    await pressBack()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closing the lower sheet first leaves the top one open, and back still closes the top one', async () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    const offA = open('a', closeA)
    open('b', closeB)
    offA()
    await Promise.resolve()
    await Promise.resolve()
    // a の項目は b の下に取り残される。「戻る」では b が閉じ、取り残された項目は飛ばされて元の位置まで戻る
    await pressBack()
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
    await settle()
  })

  it('the next back press after a programmatic close is not swallowed', async () => {
    const off = open('a')
    off()
    await settle()
    const close = vi.fn()
    open('b', close)
    await pressBack()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
