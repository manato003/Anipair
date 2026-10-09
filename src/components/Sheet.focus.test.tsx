// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sheet } from './Sheet'

afterEach(async () => {
  cleanup()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

// 開くボタンと、シート（閉じるボタン・中のボタン2つ）。nested ならシートの中からもう1枚開ける
function Harness(props: { nested?: boolean }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      <button type="button">後ろの画面</button>
      {open && (
        <Sheet label="外のシート" onClose={() => setOpen(false)}>
          <button type="button">一つ目</button>
          {props.nested ? (
            <button type="button" onClick={() => setInner(true)}>
              重ねて開く
            </button>
          ) : (
            <button type="button">二つ目</button>
          )}
          {inner && (
            <Sheet label="内のシート" onClose={() => setInner(false)}>
              <button type="button">内の一つ目</button>
            </Sheet>
          )}
        </Sheet>
      )}
    </>
  )
}

const tab = (shift = false) => fireEvent.keyDown(window, { key: 'Tab', shiftKey: shift })
// 閉じるボタンはアイコンだけなので、名前は aria-label で読む
const focused = () => {
  const el = document.activeElement as HTMLElement | null
  return el?.getAttribute('aria-label') ?? el?.textContent
}

// 2026-10-07 の点検: Tab でシートの後ろの画面に移り、閉じたあとも開いた場所にフォーカスが戻らなかった
describe('Sheet focus', () => {
  it('keeps Tab inside the sheet, wrapping at both ends', () => {
    render(<Harness />)
    screen.getByRole('button', { name: '開く' }).focus()
    fireEvent.click(screen.getByRole('button', { name: '開く' }))
    expect(focused()).toBe('閉じる')
    screen.getByRole('button', { name: '二つ目' }).focus()
    tab()
    expect(focused()).toBe('閉じる')
    tab(true)
    expect(focused()).toBe('二つ目')
    // 何かの拍子にシートの外へ出ていたら、シートの中へ戻す
    screen.getByRole('button', { name: '後ろの画面' }).focus()
    tab()
    expect(focused()).toBe('閉じる')
  })

  it('gives focus back to the button that opened it when it closes', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '開く' })
    opener.focus()
    fireEvent.click(opener)
    expect(focused()).toBe('閉じる')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('only the sheet on top keeps Tab when one is opened over another', () => {
    render(<Harness nested />)
    fireEvent.click(screen.getByRole('button', { name: '開く' }))
    const opener = screen.getByRole('button', { name: '重ねて開く' })
    opener.focus()
    fireEvent.click(opener)
    screen.getByRole('button', { name: '内の一つ目' }).focus()
    tab()
    // 内のシートの最初（閉じる）へ回る。外のシートは奪わない
    expect(focused()).toBe('閉じる')
    expect(screen.getByRole('dialog', { name: '内のシート' }).contains(document.activeElement)).toBe(true)
    // 内のシートを閉じると、外のシートの「重ねて開く」に戻り、外のシートが Tab を受け持つ
    fireEvent.click(screen.getAllByRole('button', { name: '閉じる' })[1])
    expect(screen.queryByRole('dialog', { name: '内のシート' })).toBeNull()
    expect(document.activeElement).toBe(opener)
    tab()
    expect(focused()).toBe('閉じる')
    expect(screen.getByRole('dialog', { name: '外のシート' }).contains(document.activeElement)).toBe(true)
  })
})
