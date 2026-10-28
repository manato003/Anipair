// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SortRow } from './SortRow'

afterEach(cleanup)

const options = [
  { key: 'popular', label: '人気順', note: '記録した人の多い順です。' },
  { key: 'aired', label: '放送日順', note: '放送時期の新しい順です。' },
] as const

const infoButton = () => screen.getByRole('button', { name: '並べ方の説明' })
const panel = () => screen.queryByRole('dialog', { name: '並べ方の説明' })

describe('SortRow', () => {
  it('shows no info button when no option has a note', () => {
    render(<SortRow options={[{ key: 'a', label: 'A' }]} value="a" dir="desc" onChoose={() => {}} />)
    expect(screen.queryByRole('button', { name: '並べ方の説明' })).toBeNull()
  })

  it('opens a panel that explains each shown sort, and closes it on a second press', () => {
    const onChoose = vi.fn()
    render(<SortRow options={options} value="popular" dir="desc" onChoose={onChoose} />)
    expect(infoButton().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(infoButton())
    expect(infoButton().getAttribute('aria-expanded')).toBe('true')
    const p = panel()!
    expect([...p.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['人気順', '放送日順'])
    expect(within(p).getByText('放送時期の新しい順です。')).toBeTruthy()
    // 説明を開いても、並べ方は変わらない
    expect(onChoose).not.toHaveBeenCalled()
    fireEvent.click(infoButton())
    expect(panel()).toBeNull()
  })

  it('closes on Escape (returning focus to the button) and on a press outside', () => {
    render(<SortRow options={options} value="popular" dir="desc" onChoose={() => {}} />)
    fireEvent.click(infoButton())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(infoButton())

    fireEvent.click(infoButton())
    fireEvent.pointerDown(document.body)
    expect(panel()).toBeNull()
  })
})
