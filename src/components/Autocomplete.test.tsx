// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Autocomplete } from './Autocomplete'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type Hit = { id: number; name: string; ok?: boolean }

function setup(search: (q: string) => Promise<Hit[]>, onPick = vi.fn()) {
  render(
    <Autocomplete<Hit>
      label="人物を探す"
      search={search}
      item={(h) => ({ key: String(h.id), label: h.name, sub: h.ok === false ? '選べません' : undefined, disabled: h.ok === false })}
      onPick={onPick}
    />,
  )
  return { input: screen.getByRole('combobox', { name: '人物を探す' }), onPick }
}

// 打ち終えて待つ時間（350ms）を進め、答えを受け取る
async function typeAndWait(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
}

describe('Autocomplete', () => {
  it('searches once after typing stops and lists the results', async () => {
    const search = vi.fn(async () => [{ id: 1, name: '悠木碧' }])
    const { input } = setup(search)
    fireEvent.change(input, { target: { value: 'ゆ' } })
    fireEvent.change(input, { target: { value: 'ゆう' } })
    await typeAndWait(input, 'ゆうき')
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('ゆうき')
    expect(screen.getByRole('option', { name: '悠木碧' })).toBeTruthy()
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('picks with the arrow keys and Enter, then clears the field', async () => {
    const { input, onPick } = setup(async () => [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ])
    await typeAndWait(input, 'x')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: 'B' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith({ id: 2, name: 'B' })
    expect((input as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not pick a disabled result', async () => {
    const { input, onPick } = setup(async () => [{ id: 1, name: 'A', ok: false }])
    await typeAndWait(input, 'x')
    fireEvent.click(screen.getByRole('option', { name: /A/ }))
    expect(onPick).not.toHaveBeenCalled()
  })

  it('closes the list on Escape without letting the key reach the sheet', async () => {
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    try {
      const { input } = setup(async () => [{ id: 1, name: 'A' }])
      await typeAndWait(input, 'x')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByRole('listbox')).toBeNull()
      expect(onWindowKey).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', onWindowKey)
    }
  })

  it('ignores an older answer that arrives after a newer one', async () => {
    let resolveOld: (v: Hit[]) => void = () => undefined
    const search = vi.fn((q: string) => (q === 'old' ? new Promise<Hit[]>((r) => (resolveOld = r)) : Promise.resolve([{ id: 2, name: 'new' }])))
    const { input } = setup(search)
    await typeAndWait(input, 'old')
    await typeAndWait(input, 'new')
    await act(async () => resolveOld([{ id: 1, name: 'old' }]))
    expect(screen.queryByRole('option', { name: 'old' })).toBeNull()
    expect(screen.getByRole('option', { name: 'new' })).toBeTruthy()
  })

  it('says when the search failed', async () => {
    const { input } = setup(async () => {
      throw new Error('通信できません')
    })
    await typeAndWait(input, 'x')
    expect(screen.getByText(/探せませんでした/)).toBeTruthy()
  })
  it('fills a parent-held value on pick, and lists only when there are hits', async () => {
    const onPick = vi.fn()
    function Search() {
      const [value, setValue] = useState('')
      return (
        <Autocomplete<Hit>
          label="題名"
          value={value}
          onValueChange={setValue}
          accept={(q) => !/^[a-z]+$/i.test(q)}
          wait={0}
          search={(q) => [{ id: 1, name: 'ぼっち・ざ・ろっく！' }].filter((h) => h.name.includes(q))}
          item={(h) => ({ key: String(h.id), label: h.name })}
          onPick={(h) => {
            onPick(h)
            setValue(h.name)
          }}
        />
      )
    }
    render(<Search />)
    const input = screen.getByRole('combobox', { name: '題名' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ぼっち' } })
    // 手元の候補は待たずに出る
    fireEvent.click(screen.getByRole('option', { name: 'ぼっち・ざ・ろっく！' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('ぼっち・ざ・ろっく！')
    expect(screen.queryByRole('listbox')).toBeNull()
    // 0件と、候補を探さない語は、何も出さない（「見つかりませんでした」も出さない）
    fireEvent.change(input, { target: { value: 'けいおん' } })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(input, { target: { value: 'bocchi' } })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
