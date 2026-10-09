// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTitlesState, recordTimeFeats } from './achievementStore'
import { announceEarned, resetTitleToast } from './titleToast'
import { TitleToastView } from './TitleToastView'
import { featTitle } from './titles'

const state = (v: object) => localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: [], ...v }))
const A = { id: 'watched-10', name: '十人十色を知る者', rarity: 'bronze' as const }
const B = { id: 'watched-50', name: '半百の語り部', rarity: 'bronze' as const }

beforeEach(() => {
  localStorage.clear()
  resetTitleToast()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('announceEarned', () => {
  it('stays quiet before the first awakening (the awakening shows them all at once), and does not mark them', () => {
    state({ awakened: false, earned: [] })
    render(<TitleToastView />)
    act(() => announceEarned([A]))
    expect(screen.queryByText(/称号を手に入れた/)).toBeNull()
    expect(loadTitlesState().earned).toEqual([])
  })

  it('on a device without the earned list, only remembers them (no toast for titles held from before)', () => {
    state({ awakened: true })
    render(<TitleToastView />)
    act(() => announceEarned([A, B]))
    expect(screen.queryByText(/称号を手に入れた/)).toBeNull()
    expect(loadTitlesState().earned).toEqual(['watched-10', 'watched-50'])
  })

  it('shows only the new ones, names the first, counts the rest, and remembers them', () => {
    state({ awakened: true, earned: ['watched-10'] })
    render(<TitleToastView />)
    act(() => announceEarned([A]))
    expect(screen.queryByText(/称号を手に入れた/)).toBeNull()
    act(() => announceEarned([A, B, featTitle('lateNight')]))
    expect(screen.getByText('称号を手に入れた')).toBeTruthy()
    expect(screen.getByText(/「半百の語り部」ほか1つ/)).toBeTruthy()
    expect(loadTitlesState().earned).toEqual(['watched-10', 'watched-50', 'hidden-midnight'])
  })

  it('goes away after about 3 seconds, or when pressed', () => {
    vi.useFakeTimers()
    state({ awakened: true, earned: [] })
    render(<TitleToastView />)
    act(() => announceEarned([A]))
    expect(screen.getByText(/十人十色を知る者/)).toBeTruthy()
    act(() => vi.advanceTimersByTime(3300))
    expect(screen.queryByText(/十人十色を知る者/)).toBeNull()
    act(() => announceEarned([B]))
    fireEvent.click(screen.getByRole('button', { name: /半百の語り部/ }))
    expect(screen.queryByText(/半百の語り部/)).toBeNull()
  })
})

describe('feats', () => {
  it('reports only the feats recorded for the first time, which name their titles', () => {
    expect(recordTimeFeats(new Date('2026-03-01T02:10:00'))).toEqual(['lateNight'])
    expect(recordTimeFeats(new Date('2026-03-02T02:10:00'))).toEqual([])
    expect(featTitle('lateNight').name).toBe('丑三つ時の観測者')
    expect(featTitle('oneNightCastle').name).toBe('一夜城')
  })
})
