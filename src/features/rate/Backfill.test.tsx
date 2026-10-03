// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { previousSeason, seasonOf, type Season } from '../../lib/season'

const answer = vi.fn()
const watchAnswer = vi.fn()
const refreshIfIdle = vi.fn()
const goToPrevious = vi.fn()
const goToNext = vi.fn()
const jumpTo = vi.fn()
let season: Season = seasonOf(new Date())
const card = {
  work: { id: 'W1', annictId: 1, title: '作品', media: 'TV', malAnimeId: null, watchersCount: 10, viewerStatusState: null, ogImageUrl: null },
  cover: null,
}

const watchCard = {
  entry: { workId: 'W9', annictId: 9, title: '見てる作品', malAnimeId: null, state: 'WATCHING', stateAt: '2026-06-01T00:00:00Z' },
  cover: null,
}

vi.mock('./useBackfill', () => ({
  useBackfill: () => ({
    season,
    cards: [card],
    index: 0,
    current: card,
    next: null,
    seasonDone: false,
    finished: false,
    loadError: null,
    pending: 0,
    failed: [],
    canUndo: false,
    answer,
    undo: vi.fn(),
    reload: vi.fn(),
    retryFailed: vi.fn(),
    dismissFailed: vi.fn(),
    goToPrevious,
    goToNext,
    jumpTo,
    syncNote: null,
  }),
}))
vi.mock('./useWatching', () => ({
  useWatching: () => ({
    cards: [watchCard],
    index: 0,
    current: watchCard,
    next: null,
    done: false,
    loadError: null,
    pending: 0,
    failed: [],
    canUndo: false,
    answer: watchAnswer,
    undo: vi.fn(),
    reload: vi.fn(),
    refreshIfIdle,
    retryFailed: vi.fn(),
    dismissFailed: vi.fn(),
  }),
}))
// シートの中身はここでは見ない。開いていることと、読むだけで開くことだけ確かめる
vi.mock('../browse/WorkDetail', () => ({
  WorkDetail: (p: { readOnly?: boolean }) => <div data-testid="sheet" data-readonly={String(p.readOnly)} />,
}))

const { Backfill } = await import('./Backfill')

// 使い方の案内は「見た」ことにしておく（案内のテストだけ、消してから始める）
const seen = () => localStorage.setItem('animax.onboarding.v1', JSON.stringify({ v: 1, at: '2026-10-03T00:00:00.000Z' }))
beforeEach(seen)

afterEach(() => {
  cleanup()
  localStorage.clear()
  answer.mockClear()
  watchAnswer.mockClear()
  refreshIfIdle.mockClear()
  goToPrevious.mockClear()
  goToNext.mockClear()
  jumpTo.mockClear()
  season = seasonOf(new Date())
})

const press = (key: string) => act(() => void fireEvent.keyDown(window, { key }))

describe('Backfill detail sheet', () => {
  it('opens read-only from the cover, and while it is open only the detail key works', () => {
    render(<Backfill token="t" github={null} active />)
    press('3')
    expect(answer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '詳しく見る' }))
    expect(screen.getByTestId('sheet').getAttribute('data-readonly')).toBe('true')
    press('3')
    press('w')
    expect(answer).toHaveBeenCalledTimes(1)

    // 詳細のキーで閉じ、閉じたらまた答えられる
    press('i')
    expect(screen.queryByTestId('sheet')).toBeNull()
    press('3')
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('the detail key opens the sheet, but not while the tab is hidden', () => {
    const { rerender } = render(<Backfill token="t" github={null} active={false} />)
    press('i')
    expect(screen.queryByTestId('sheet')).toBeNull()
    rerender(<Backfill token="t" github={null} active />)
    press('i')
    expect(screen.getByTestId('sheet')).toBeTruthy()
  })

  it('shows the 見てる answer only for this season and the one before, and answers with it', () => {
    render(<Backfill token="t" github={null} active />)
    fireEvent.click(screen.getByRole('button', { name: /^見てる\s*E$/ }))
    expect(answer).toHaveBeenCalledWith({ kind: 'watching' })
    press('e')
    expect(answer).toHaveBeenCalledTimes(2)
    cleanup()
    answer.mockClear()

    season = previousSeason(previousSeason(seasonOf(new Date())))
    render(<Backfill token="t" github={null} active />)
    expect(screen.queryByRole('button', { name: /^見てる\s*E$/ })).toBeNull()
    press('e')
    expect(answer).not.toHaveBeenCalled()
  })

  it('steps between seasons with the stepper, and cannot go past the current one', () => {
    season = previousSeason(seasonOf(new Date()))
    render(<Backfill token="t" github={null} active />)
    fireEvent.click(screen.getByRole('button', { name: '前のクール' }))
    fireEvent.click(screen.getByRole('button', { name: '次のクール' }))
    expect(goToPrevious).toHaveBeenCalledTimes(1)
    expect(goToNext).toHaveBeenCalledTimes(1)
    cleanup()
    season = seasonOf(new Date())
    render(<Backfill token="t" github={null} active />)
    expect((screen.getByRole('button', { name: '次のクール' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('jumps to a season picked in the dropdowns', () => {
    season = { year: 2020, name: 'spring' }
    render(<Backfill token="t" github={null} active />)
    fireEvent.change(screen.getByRole('combobox', { name: '年' }), { target: { value: '2012' } })
    expect(jumpTo).toHaveBeenLastCalledWith({ year: 2012, name: 'spring' })
    fireEvent.change(screen.getByRole('combobox', { name: '季節' }), { target: { value: 'autumn' } })
    expect(jumpTo).toHaveBeenLastCalledWith({ year: 2020, name: 'autumn' })
    expect(goToPrevious).not.toHaveBeenCalled()
  })

  it('in 見てる mode the same keys answer the watching deck, and the E key means "still watching"', () => {
    render(<Backfill token="t" github={null} active />)
    fireEvent.click(screen.getByRole('button', { name: /^見てる（1）/ }))
    expect(screen.getByRole('heading', { level: 1, name: '見てる作品' })).toBeTruthy()
    expect(refreshIfIdle).toHaveBeenCalled()
    press('3')
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'rate', rating: 'GOOD' })
    press('e')
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'still' })
    press('f')
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'watched' })
    // さかのぼり用のキーは効かない
    press('w')
    press('0')
    expect(watchAnswer).toHaveBeenCalledTimes(3)
    expect(answer).not.toHaveBeenCalled()
    // 「途中でやめた」は「視聴中断」の1つだけ（一時中断のボタンは無い）
    expect(screen.queryByRole('button', { name: /一時中断|視聴中止/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^視聴中断/ }))
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'stop' })
    // 詳細のシートは読むだけで開く
    press('i')
    expect(screen.getByTestId('sheet').getAttribute('data-readonly')).toBe('true')
  })
})

describe('Backfill first-run guide', () => {
  it('opens once on the first visit; はじめる closes it and it does not come back', () => {
    localStorage.clear()
    const { unmount } = render(<Backfill token="t" github={null} active />)
    expect(screen.getByRole('dialog', { name: 'Anipair の使い方' })).toBeTruthy()
    expect(screen.getByText('Anipair の使い方')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('animax.onboarding.v1')).toContain('"v":1')
    unmount()

    // 次に開いたときは出ない
    render(<Backfill token="t" github={null} active />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('counts as seen however it is closed', () => {
    localStorage.clear()
    render(<Backfill token="t" github={null} active />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('animax.onboarding.v1')).not.toBeNull()
  })

  it('keeps every answer shortcut, and the detail key, off while the guide is open', () => {
    localStorage.clear()
    render(<Backfill token="t" github={null} active />)
    press('3')
    press('w')
    press('0')
    press('i')
    expect(answer).not.toHaveBeenCalled()
    expect(screen.queryByTestId('sheet')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    press('3')
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('does not open over a hidden tab, but opens when the tab is first shown', () => {
    localStorage.clear()
    const { rerender } = render(<Backfill token="t" github={null} active={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<Backfill token="t" github={null} active />)
    expect(screen.getByRole('dialog', { name: 'Anipair の使い方' })).toBeTruthy()
  })
})
