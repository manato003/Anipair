// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Season } from '../lib/season'
import { SeasonPicker } from './SeasonPicker'

afterEach(cleanup)

const min: Season = { year: 2010, name: 'winter' }
const max: Season = { year: 2026, name: 'summer' }

function setup(value: Season, extra: { onPrevious?: () => void; onNext?: () => void } = {}) {
  const onChange = vi.fn()
  render(<SeasonPicker value={value} min={min} max={max} onChange={onChange} {...extra} />)
  return onChange
}

// パネルを開いて、年と季節を押す
const openPicker = () => fireEvent.click(screen.getByRole('button', { name: /^クールを選ぶ/ }))
const panel = () => screen.getByRole('dialog', { name: 'クールを選ぶ' })
const yearButtons = () => within(panel()).getAllByRole('group', { name: '年' })[0].querySelectorAll('button')
const pickYear = (y: number) => fireEvent.click(within(panel()).getByRole('button', { name: String(y) }))
const seasonButton = (label: string) => within(panel()).getByRole('button', { name: label }) as HTMLButtonElement

describe('SeasonPicker', () => {
  it('shows the value on one button, and opens a panel with the years newest first and the seasons in the app order', () => {
    setup({ year: 2020, name: 'spring' })
    const button = screen.getByRole('button', { name: 'クールを選ぶ（いまは 2020年 春）' })
    expect(button.textContent).toBe('2020年春')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    openPicker()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const years = [...yearButtons()].map((b) => b.textContent)
    expect(years[0]).toBe('2026')
    expect(years.at(-1)).toBe('2010')
    expect(within(panel()).getByRole('button', { name: '2020' }).getAttribute('aria-pressed')).toBe('true')
    expect([...within(panel()).getByRole('group', { name: '季節' }).querySelectorAll('button')].map((b) => b.textContent)).toEqual(['冬', '春', '夏', '秋'])
    expect(seasonButton('春').getAttribute('aria-current')).toBe('true')
  })

  it('moves only when a season is pressed: the year alone does not move, then the panel closes', () => {
    const onChange = setup({ year: 2020, name: 'spring' })
    openPicker()
    pickYear(2012)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(seasonButton('秋'))
    expect(onChange).toHaveBeenCalledWith({ year: 2012, name: 'autumn' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not call back when the current cour is pressed again', () => {
    const onChange = setup({ year: 2020, name: 'spring' })
    openPicker()
    fireEvent.click(seasonButton('春'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables the seasons after the max in the max year, but not in other years', () => {
    setup({ year: 2026, name: 'spring' })
    openPicker()
    expect(seasonButton('秋').disabled).toBe(true)
    expect(seasonButton('夏').disabled).toBe(false)
    pickYear(2025)
    expect(seasonButton('秋').disabled).toBe(false)
  })

  it('closes without moving on Esc and on a press outside, and keeps ← → inside the panel', () => {
    const onChange = setup({ year: 2020, name: 'spring' })
    openPicker()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    fireEvent.keyDown(within(panel()).getByRole('button', { name: '2020' }), { key: 'ArrowRight' })
    expect(onWindowKey).not.toHaveBeenCalled()
    window.removeEventListener('keydown', onWindowKey)
    fireEvent.keyDown(panel(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    openPicker()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('steps by one season with the arrows, unless the screen handles them itself', () => {
    const onChange = setup({ year: 2020, name: 'winter' })
    fireEvent.click(screen.getByRole('button', { name: '前のクール' }))
    expect(onChange).toHaveBeenLastCalledWith({ year: 2019, name: 'autumn' })
    fireEvent.click(screen.getByRole('button', { name: '次のクール' }))
    expect(onChange).toHaveBeenLastCalledWith({ year: 2020, name: 'spring' })
    cleanup()

    const onPrevious = vi.fn()
    const onNext = vi.fn()
    const onChange2 = setup({ year: 2020, name: 'winter' }, { onPrevious, onNext })
    fireEvent.click(screen.getByRole('button', { name: '前のクール' }))
    fireEvent.click(screen.getByRole('button', { name: '次のクール' }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onChange2).not.toHaveBeenCalled()
  })

  it('disables the arrows at the ends of the range', () => {
    setup(max)
    expect((screen.getByRole('button', { name: '次のクール' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '前のクール' }) as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    setup(min)
    expect((screen.getByRole('button', { name: '前のクール' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '次のクール' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
