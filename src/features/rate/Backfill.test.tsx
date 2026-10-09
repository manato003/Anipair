// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { previousSeason, seasonOf, type Season } from '../../lib/season'

const answer = vi.fn()
const watchAnswer = vi.fn()
const bUndo = vi.fn()
const wUndo = vi.fn()
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

// クールの山の様子。既定は「30作のうち3作は記録済み、残りの先頭を出している」。答え切ったときのテストだけ変える
let bIndex = 0
let seasonDone = false
let progress = { answered: 3, total: 30 }
vi.mock('./useBackfill', () => ({
  useBackfill: () => ({
    season,
    cards: [card],
    index: bIndex,
    progress,
    current: seasonDone ? null : card,
    next: null,
    seasonDone,
    finished: false,
    loadError: null,
    pending: 0,
    failed: [],
    canUndo: false,
    answer,
    undo: bUndo,
    reload: vi.fn(),
    retryFailed: vi.fn(),
    dismissFailed: vi.fn(),
    goToPrevious,
    goToNext,
    jumpTo,
    syncNote: null,
  }),
}))
// 見てる作品の山。既定は空（クールの作品だけ）。見てる作品の段のテストだけ入れる
let watchCards: (typeof watchCard)[] = []
vi.mock('./useWatching', () => ({
  useWatching: () => ({
    cards: watchCards,
    index: 0,
    current: watchCards[0] ?? null,
    next: null,
    done: false,
    loadError: null,
    pending: 0,
    failed: [],
    canUndo: false,
    answer: watchAnswer,
    undo: wUndo,
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
  bUndo.mockClear()
  wUndo.mockClear()
  watchCards = []
  refreshIfIdle.mockClear()
  goToPrevious.mockClear()
  goToNext.mockClear()
  jumpTo.mockClear()
  season = seasonOf(new Date())
  bIndex = 0
  seasonDone = false
  progress = { answered: 3, total: 30 }
  vi.useRealTimers()
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
    press('s')
    expect(screen.queryByTestId('sheet')).toBeNull()
    press('3')
    expect(answer).toHaveBeenCalledTimes(2)
  })

  it('the detail key opens the sheet, but not while the tab is hidden', () => {
    const { rerender } = render(<Backfill token="t" github={null} active={false} />)
    press('s')
    expect(screen.queryByTestId('sheet')).toBeNull()
    rerender(<Backfill token="t" github={null} active />)
    press('s')
    expect(screen.getByTestId('sheet')).toBeTruthy()
  })

  it('lets an unrecorded work of any season become 見てる', () => {
    render(<Backfill token="t" github={null} active />)
    fireEvent.click(screen.getByRole('button', { name: /^見てる\s*E$/ }))
    expect(answer).toHaveBeenCalledWith({ kind: 'watching' })
    press('e')
    expect(answer).toHaveBeenCalledTimes(2)
    cleanup()
    answer.mockClear()

    // 昔のクールでも押せる（配信で昔の作品をいま見ていることもある）
    season = { year: 2005, name: 'autumn' }
    render(<Backfill token="t" github={null} active />)
    expect((screen.getByRole('button', { name: /^見てる\s*E$/ }) as HTMLButtonElement).disabled).toBe(false)
    press('e')
    expect(answer).toHaveBeenCalledWith({ kind: 'watching' })
  })

  it('has the same answers for every card: 覚えてない in the rating row, then 見てない・見てる・視聴中断・見たい', () => {
    render(<Backfill token="t" github={null} active />)
    expect(screen.queryByRole('button', { name: /さかのぼり|見てる（/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^覚えてない/ }))
    expect(answer).toHaveBeenLastCalledWith({ kind: 'watched' })
    press('q')
    expect(answer).toHaveBeenLastCalledWith({ kind: 'watched' })
    press('r')
    expect(answer).toHaveBeenLastCalledWith({ kind: 'stop' })
    press('f')
    expect(answer).toHaveBeenLastCalledWith({ kind: 'skip' })
    press('w')
    expect(answer).toHaveBeenLastCalledWith({ kind: 'wanna' })
    expect(screen.queryByRole('button', { name: /見たけど覚えていない|見終わった|一時中断|視聴中止/ })).toBeNull()
    // 取り消しは、答えた山の取り消しを呼ぶ
    press('z')
    expect(bUndo).toHaveBeenCalledTimes(1)
    expect(wUndo).not.toHaveBeenCalled()
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

  it('jumps to a season picked in the panel', () => {
    season = { year: 2020, name: 'spring' }
    render(<Backfill token="t" github={null} active />)
    fireEvent.click(screen.getByRole('button', { name: /^クールを選ぶ/ }))
    const panel = screen.getByRole('dialog', { name: 'クールを選ぶ' })
    fireEvent.click(within(panel).getByRole('button', { name: '2012' }))
    fireEvent.click(within(panel).getByRole('button', { name: '秋' }))
    expect(jumpTo).toHaveBeenLastCalledWith({ year: 2012, name: 'autumn' })
    expect(goToPrevious).not.toHaveBeenCalled()
  })

  it('shows the works I am watching first; the same keys answer them, E means "still watching", and 見てない・見たい are off', () => {
    watchCards = [watchCard]
    render(<Backfill token="t" github={null} active />)
    expect(screen.getByRole('heading', { level: 2, name: '見てる作品' })).toBeTruthy()
    expect(screen.getByText('見てる', { selector: '.count__label' })).toBeTruthy()
    expect(refreshIfIdle).toHaveBeenCalled()
    expect((screen.getByRole('button', { name: /^見てない/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^見たい/ }) as HTMLButtonElement).disabled).toBe(true)
    press('3')
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'rate', rating: 'GOOD' })
    press('e')
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'still' })
    press('q')
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'watched' })
    // さかのぼり用のキーは効かない
    press('w')
    press('f')
    expect(watchAnswer).toHaveBeenCalledTimes(3)
    expect(answer).not.toHaveBeenCalled()
    // 「途中でやめた」は「視聴中断」の1つだけ（一時中断のボタンは無い）
    expect(screen.queryByRole('button', { name: /一時中断|視聴中止/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^視聴中断/ }))
    expect(watchAnswer).toHaveBeenLastCalledWith({ kind: 'stop' })
    press('z')
    expect(wUndo).toHaveBeenCalledTimes(1)
    expect(bUndo).not.toHaveBeenCalled()
    // 詳細のシートは読むだけで開く
    press('s')
    expect(screen.getByTestId('sheet').getAttribute('data-readonly')).toBe('true')
  })
})

describe('Backfill first-run guide', () => {
  it('opens once on the first visit; はじめる closes it and it does not come back', () => {
    localStorage.clear()
    const { unmount } = render(<Backfill token="t" github={null} active />)
    expect(screen.getByRole('dialog', { name: 'Anipair の使い方' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'ようこそ、Anipair へ' })).toBeTruthy()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }))
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
    press('f')
    press('s')
    expect(answer).not.toHaveBeenCalled()
    expect(screen.queryByTestId('sheet')).toBeNull()

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }))
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

describe('Backfill progress and celebrations', () => {
  it('shows how many of the popular works of the season are answered, counting what was already recorded', () => {
    render(<Backfill token="t" github={null} active />)
    expect(document.querySelector('.progress__count')?.textContent).toBe('3/30')
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(bar.getAttribute('aria-valuemax')).toBe('30')
  })

  it('celebrates every 10 answers without blocking, and not twice for the same milestone after an undo', () => {
    vi.useFakeTimers()
    render(<Backfill token="t" github={null} active />)
    for (let i = 0; i < 9; i++) press('3')
    expect(screen.queryByRole('status')).toBeNull()
    press('f')
    const toast = screen.getByRole('status')
    expect(toast.textContent).toContain('10件')
    expect(toast.textContent).toContain('次の目標 20件')
    // 演出のあいだも答えられる
    press('3')
    expect(answer).toHaveBeenCalledTimes(11)
    act(() => void vi.advanceTimersByTime(2500))
    expect(screen.queryByRole('status')).toBeNull()
    // 取り消して10件に戻り、また届いても祝わない
    press('z')
    press('z')
    press('3')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows 踏破 when the last card of a season is answered, but not for a season that was already complete when opened', () => {
    seasonDone = true
    bIndex = 1
    progress = { answered: 30, total: 30 }
    render(<Backfill token="t" github={null} active />)
    expect(screen.getByText('踏破')).toBeTruthy()
    expect(screen.getByText('人気作30本、すべてに答えました。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /へ進む$/ }))
    expect(goToPrevious).toHaveBeenCalled()
    cleanup()

    bIndex = 0
    render(<Backfill token="t" github={null} active />)
    expect(screen.queryByText('踏破')).toBeNull()
    expect(screen.getByText(/はここまで$/)).toBeTruthy()
  })
})
