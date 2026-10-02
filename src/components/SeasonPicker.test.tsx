// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

const year = () => screen.getByRole('combobox', { name: '年' }) as HTMLSelectElement
const season = () => screen.getByRole('combobox', { name: '季節' }) as HTMLSelectElement
const optionTexts = (el: HTMLElement) => [...el.querySelectorAll('option')].map((o) => o.textContent)

describe('SeasonPicker', () => {
  it('shows the value, with years newest first and seasons in the app order', () => {
    setup({ year: 2020, name: 'spring' })
    expect(year().value).toBe('2020')
    expect(season().value).toBe('spring')
    expect(optionTexts(year())[0]).toBe('2026年')
    expect(optionTexts(year()).at(-1)).toBe('2010年')
    expect(optionTexts(season())).toEqual(['冬', '春', '夏', '秋'])
  })

  it('calls back with the picked year, keeping the season', () => {
    const onChange = setup({ year: 2020, name: 'spring' })
    fireEvent.change(year(), { target: { value: '2012' } })
    expect(onChange).toHaveBeenCalledWith({ year: 2012, name: 'spring' })
  })

  it('calls back with the picked season, keeping the year', () => {
    const onChange = setup({ year: 2020, name: 'spring' })
    fireEvent.change(season(), { target: { value: 'autumn' } })
    expect(onChange).toHaveBeenCalledWith({ year: 2020, name: 'autumn' })
  })

  it('clamps to the max when the picked year makes the season come too late', () => {
    const onChange = setup({ year: 2025, name: 'autumn' })
    fireEvent.change(year(), { target: { value: '2026' } })
    expect(onChange).toHaveBeenCalledWith(max)
  })

  it('disables the seasons after the max in the max year, but not in other years', () => {
    setup({ year: 2026, name: 'spring' })
    const disabled = [...season().querySelectorAll('option')].filter((o) => o.disabled).map((o) => o.textContent)
    expect(disabled).toEqual(['秋'])
    cleanup()
    setup({ year: 2025, name: 'spring' })
    expect([...season().querySelectorAll('option')].some((o) => o.disabled)).toBe(false)
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
