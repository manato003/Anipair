// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatchFilterControls } from './MatchFilterControls'
import { DEFAULT_FILTER } from './matchFilter'

afterEach(cleanup)

describe('MatchFilterControls', () => {
  it('shows the defaults: all formats on, any year', () => {
    render(<MatchFilterControls filter={DEFAULT_FILTER} onChange={() => undefined} />)
    for (const name of ['TV', '劇場版', 'OVA・配信']) expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('')
    expect([...screen.getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent)).toEqual(['すべて', '2000年以降', '2010年以降', '2020年以降'])
  })

  it('turns a format off and on', () => {
    const onChange = vi.fn()
    render(<MatchFilterControls filter={DEFAULT_FILTER} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '劇場版' }))
    expect(onChange).toHaveBeenLastCalledWith({ formats: ['tv', 'ova'], fromYear: null })
    cleanup()
    render(<MatchFilterControls filter={{ formats: ['tv'], fromYear: null }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'OVA・配信' }))
    expect(onChange).toHaveBeenLastCalledWith({ formats: ['tv', 'ova'], fromYear: null })
  })

  it('never lets the last format be turned off', () => {
    const onChange = vi.fn()
    render(<MatchFilterControls filter={{ formats: ['movie'], fromYear: null }} onChange={onChange} />)
    const last = screen.getByRole('checkbox', { name: '劇場版' }) as HTMLInputElement
    expect(last.disabled).toBe(true)
    fireEvent.click(last)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('changes the year, and back to all', () => {
    const onChange = vi.fn()
    render(<MatchFilterControls filter={DEFAULT_FILTER} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2010' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTER, fromYear: 2010 })
    cleanup()
    render(<MatchFilterControls filter={{ ...DEFAULT_FILTER, fromYear: 2010 }} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTER, fromYear: null })
  })
})
