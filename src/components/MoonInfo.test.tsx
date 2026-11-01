// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetLangForTests } from '../lib/i18n'
import { MoonInfo } from './MoonInfo'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resetLangForTests()
})

describe('MoonInfo', () => {
  it('opens on tap with the name, the age and the times, and closes on a tap outside', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-04-23T12:00Z'))
    render(<MoonInfo where="ground" />)
    const moon = screen.getByRole('button', { name: '今日の月' })
    expect(moon.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(moon)
    const card = screen.getByRole('group', { name: '今日の月' })
    expect(card.textContent).toContain('満月')
    expect(card.textContent).toContain('月齢')
    expect(card.textContent).toContain('月の出')
    expect(card.textContent).toContain('月の入り')
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('opens while the mouse is over it, but not for a finger', () => {
    render(<MoonInfo where="bar" />)
    const box = screen.getByRole('button').parentElement!
    fireEvent.pointerEnter(box, { pointerType: 'touch' })
    expect(screen.queryByRole('group')).toBeNull()
    fireEvent.pointerEnter(box, { pointerType: 'mouse' })
    expect(screen.getByRole('group')).toBeTruthy()
    fireEvent.pointerLeave(box, { pointerType: 'mouse' })
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('speaks English in the English screen', () => {
    resetLangForTests('en')
    render(<MoonInfo where="bar" />)
    fireEvent.click(screen.getByRole('button', { name: "Today's moon" }))
    expect(screen.getByRole('group').textContent).toContain('Moonrise')
  })
})
