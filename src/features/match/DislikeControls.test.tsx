// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Dislikes } from './dislikes'

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  searchPeopleByName: vi.fn(async () => [{ annictId: 9, name: '悠木碧', castsCount: 300, staffsCount: 0 }]),
  searchOrganizationsByName: vi.fn(async () => [
    { annictId: 337, name: 'スタジオジブリ', nameEn: null, staffsCount: 30 },
    { annictId: 99999, name: 'どこかの会社', nameEn: null, staffsCount: 2 },
  ]),
}))
vi.mock('../../lib/shikimori', () => ({ findPerson: vi.fn() }))

const { DislikeControls } = await import('./DislikeControls')
const { findPerson } = await import('../../lib/shikimori')

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.mocked(findPerson).mockReset()
})

const at = '2026-10-29T01:00:00.000Z'

async function typeAndWait(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400)
  })
}

describe('DislikeControls', () => {
  it('shows each topic with its collateral and toggles it', () => {
    const onSet = vi.fn()
    const d: Dislikes = new Map([['topic:romance', { at, active: true }]])
    render(<DislikeControls token="t" dislikes={d} onSet={onSet} />)
    const romance = screen.getByRole('button', { name: /恋愛/ })
    expect(romance.getAttribute('aria-pressed')).toBe('true')
    expect(romance.textContent).toContain('19.3%')
    fireEvent.click(romance)
    expect(onSet).toHaveBeenLastCalledWith('topic:romance', false)
    fireEvent.click(screen.getByRole('button', { name: /お色気/ }))
    expect(onSet).toHaveBeenLastCalledWith('topic:ecchi', true)
  })

  it('finds a genre by its Japanese name in hiragana and adds it, showing what is already covered', () => {
    const onSet = vi.fn()
    const d: Dislikes = new Map([['topic:romance', { at, active: true }]])
    render(<DislikeControls token="t" dislikes={d} onSet={onSet} />)
    const box = screen.getByRole('combobox', { name: 'ほかのジャンルを探して足す' })
    fireEvent.change(box, { target: { value: 'ぐるめ' } })
    fireEvent.click(screen.getByRole('option', { name: /グルメ/ }))
    expect(onSet).toHaveBeenLastCalledWith('genre:gourmet', true)
    fireEvent.change(box, { target: { value: '多角' } })
    const polygon = screen.getByRole('option', { name: /多角関係/ })
    expect(polygon.getAttribute('aria-disabled')).toBe('true')
    expect(polygon.textContent).toContain('「恋愛」で除いています')
  })

  it('shows added genres as chips that turn them off', () => {
    const onSet = vi.fn()
    render(<DislikeControls token="t" dislikes={new Map([['genre:vampire', { at, active: true }]])} onSet={onSet} />)
    fireEvent.click(screen.getByRole('button', { name: /吸血鬼/ }))
    expect(onSet).toHaveBeenLastCalledWith('genre:vampire', false)
  })

  it('offers well-known studios as chips with their Japanese names', () => {
    const onSet = vi.fn()
    render(<DislikeControls token="t" dislikes={new Map()} onSet={onSet} />)
    fireEvent.click(screen.getByRole('button', { name: '京都アニメーション' }))
    expect(onSet).toHaveBeenLastCalledWith('studio:2', true, '京都アニメーション')
  })

  it('adds a searched studio, and refuses one that cannot be matched', async () => {
    const onSet = vi.fn()
    render(<DislikeControls token="t" dislikes={new Map()} onSet={onSet} />)
    await typeAndWait(screen.getByRole('combobox', { name: '制作会社を名前で探す' }), 'スタジオ')
    expect(screen.getByRole('option', { name: /どこかの会社/ }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(screen.getByRole('option', { name: /スタジオジブリ/ }))
    expect(onSet).toHaveBeenLastCalledWith('studio:21', true, 'スタジオジブリ')
  })

  it('links a searched person to Shikimori before adding them', async () => {
    const onSet = vi.fn()
    vi.mocked(findPerson).mockResolvedValue({ id: 777, name: 'Aoi Yuuki', japanese: '悠木 碧' })
    render(<DislikeControls token="t" dislikes={new Map()} onSet={onSet} />)
    await typeAndWait(screen.getByRole('combobox', { name: '人物を名前で探す' }), 'ゆうき')
    await act(async () => fireEvent.click(screen.getByRole('option', { name: /悠木碧/ })))
    expect(findPerson).toHaveBeenCalledWith('悠木碧')
    expect(onSet).toHaveBeenLastCalledWith('person:777', true, '悠木碧')
  })

  it('says so when the person has no works to match', async () => {
    const onSet = vi.fn()
    vi.mocked(findPerson).mockResolvedValue(null)
    render(<DislikeControls token="t" dislikes={new Map()} onSet={onSet} />)
    await typeAndWait(screen.getByRole('combobox', { name: '人物を名前で探す' }), 'ゆうき')
    await act(async () => fireEvent.click(screen.getByRole('option', { name: /悠木碧/ })))
    expect(onSet).not.toHaveBeenCalled()
    expect(screen.getByText(/参加作品が見つからず/)).toBeTruthy()
  })

  it('lists avoided people and removes one when pressed', () => {
    const onSet = vi.fn()
    const d: Dislikes = new Map([['person:777', { at, active: true, name: '悠木碧' }]])
    render(<DislikeControls token="t" dislikes={d} onSet={onSet} />)
    fireEvent.click(screen.getByRole('button', { name: '悠木碧' }))
    expect(onSet).toHaveBeenLastCalledWith('person:777', false)
  })
})
