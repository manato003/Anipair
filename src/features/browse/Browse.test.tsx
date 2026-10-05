// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork } from '../../lib/annict'
import { nextSeason, seasonOf, type Season } from '../../lib/season'
import type { BrowsePeriod } from './browseFilter'
import type { BrowseSort } from './browseSort'

function w(annictId: number): BrowseWork {
  return {
    id: `W${annictId}`,
    annictId,
    title: `作品${annictId}`,
    media: 'TV',
    seasonYear: 2026,
    seasonName: 'SUMMER',
    malAnimeId: String(100 + annictId),
    watchersCount: 1,
    viewerStatusState: null,
  }
}

const setSeason = vi.fn()
const setSort = vi.fn()
const setPeriod = vi.fn()
let state: {
  season: Season
  searching: boolean
  period: BrowsePeriod
  sort: BrowseSort
  tasteNote: string | null
  reasons: Map<number, string>
  works: BrowseWork[] | null
}

function base() {
  return {
    season: seasonOf(new Date()),
    searching: false,
    period: { yearFrom: null, yearTo: null, seasons: [] } as BrowsePeriod,
    sort: 'popular' as BrowseSort,
    tasteNote: null,
    reasons: new Map<number, string>(),
    works: [w(1), w(2)],
  }
}
state = base()

vi.mock('./useBrowse', () => ({
  useBrowse: () => ({
    ...state,
    mode: state.searching ? 'search' : state.period.yearFrom !== null || state.period.yearTo !== null || state.period.seasons.length > 0 ? 'period' : 'cour',
    capped: false,
    setSeason,
    setSort,
    setPeriod,
    query: '',
    setQuery: vi.fn(),
    scores: new Map(),
    progress: null,
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
    error: null,
    retry: vi.fn(),
    covers: new Map(),
    ratings: new Map(),
    patchWork: vi.fn(),
  }),
}))
vi.mock('./WorkDetail', () => ({ WorkDetail: () => <div data-testid="sheet" /> }))
// 絞り込みのシートで読む作品の情報（ネットワークに出さない）
vi.mock('../records/useMediaInfo', () => ({ useMediaInfo: () => ({ info: new Map(), error: null }) }))

const { Browse } = await import('./Browse')

afterEach(() => {
  cleanup()
  setSeason.mockClear()
  setSort.mockClear()
  setPeriod.mockClear()
  state = base()
})

const sortButtons = () => [...screen.getByRole('group', { name: '並べ替え' }).querySelectorAll('button')].map((b) => b.textContent)

describe('Browse sort options', () => {
  it('offers おすすめ順 for the season list but not 新しい順', () => {
    render(<Browse token="t" />)
    expect(sortButtons()).toEqual(['人気順', '評価順', 'おすすめ順'])
    fireEvent.click(screen.getByRole('button', { name: 'おすすめ順' }))
    expect(setSort).toHaveBeenCalledWith('taste')
  })

  it('always says in one line what the current order is (so 人気順 and 評価順 can be told apart)', () => {
    const { unmount } = render(<Browse token="t" />)
    expect(screen.getByText('Annict でこの作品を記録した人の多い順です。')).toBeTruthy()
    unmount()
    state = { ...base(), sort: 'score' }
    render(<Browse token="t" />)
    expect(screen.getByText(/^評判の高い順です。Annict の満足度、無ければ Shikimori の点数/)).toBeTruthy()
    expect(screen.queryByText('Annict でこの作品を記録した人の多い順です。')).toBeNull()
  })

  it('offers 新しい順 but not おすすめ順 while searching by title', () => {
    state = { ...base(), searching: true }
    render(<Browse token="t" />)
    expect(sortButtons()).toEqual(['人気順', '評価順', '新しい順'])
  })

  it('shows the reason on the second line only in おすすめ順', () => {
    state = { ...base(), sort: 'taste', reasons: new Map([[1, '好きなジャンル: 音楽']]) }
    const { unmount } = render(<Browse token="t" />)
    expect(screen.getByText('好きなジャンル: 音楽').className).toContain('row__reason')
    expect(screen.getByText(/好みに合いそうな順/)).toBeTruthy()
    unmount()

    state = { ...base(), sort: 'popular', reasons: new Map([[1, '好きなジャンル: 音楽']]) }
    render(<Browse token="t" />)
    expect(screen.queryByText('好きなジャンル: 音楽')).toBeNull()
  })

  it('shows the note instead of the explanation when the taste could not be used', () => {
    state = { ...base(), sort: 'taste', tasteNote: '好みの手がかりがまだありません。評価画面で、好きな作品を評価すると使えます。' }
    render(<Browse token="t" />)
    expect(screen.getByText('好みの手がかりがまだありません。評価画面で、好きな作品を評価すると使えます。')).toBeTruthy()
    expect(screen.queryByText(/好みに合いそうな順/)).toBeNull()
  })
})

describe('Browse 来期 shortcut', () => {
  it('jumps to next season from the current one', () => {
    render(<Browse token="t" />)
    fireEvent.click(screen.getByRole('button', { name: '来期' }))
    expect(setSeason).toHaveBeenCalledWith(nextSeason(seasonOf(new Date())))
  })

  it('also works from an older season', () => {
    state = { ...base(), season: { year: 2018, name: 'spring' } }
    render(<Browse token="t" />)
    fireEvent.click(screen.getByRole('button', { name: '来期' }))
    expect(setSeason).toHaveBeenCalledWith(nextSeason(seasonOf(new Date())))
  })

  it('is not shown when already on next season, or while searching by title', () => {
    state = { ...base(), season: nextSeason(seasonOf(new Date())) }
    const { unmount } = render(<Browse token="t" />)
    expect(screen.queryByRole('button', { name: '来期' })).toBeNull()
    unmount()
    state = { ...base(), searching: true }
    render(<Browse token="t" />)
    expect(screen.queryByRole('button', { name: '来期' })).toBeNull()
  })
})

describe('Browse filter', () => {
  it('filters the loaded works by my status from the sheet, shows the condition, and clears it', () => {
    state = { ...base(), works: [w(1), { ...w(2), viewerStatusState: 'WATCHED' }] }
    render(<Browse token="t" />)
    fireEvent.click(screen.getByRole('button', { name: /^絞り込み/ }))
    const sheet = screen.getByRole('dialog', { name: '絞り込み' })
    fireEvent.click(within(sheet).getByRole('button', { name: /^見たs*1$/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: '1件を表示' }))
    expect([...document.querySelectorAll('.row__title')].map((e) => e.textContent)).toEqual(['作品2'])
    fireEvent.click(screen.getByRole('button', { name: '自分の記録: 見た の条件を外す' }))
    expect([...document.querySelectorAll('.row__title')].map((e) => e.textContent)).toEqual(['作品1', '作品2'])
  })
})


describe('Browse period', () => {
  it('picks a range of years in the sheet and sends it as the period', () => {
    render(<Browse token="t" />)
    fireEvent.click(screen.getByRole('button', { name: /^絞り込み/ }))
    const sheet = screen.getByRole('dialog', { name: '絞り込み' })
    fireEvent.change(within(sheet).getByRole('combobox', { name: '放送年（から）' }), { target: { value: '2018' } })
    expect(setPeriod).toHaveBeenCalledWith({ yearFrom: 2018, yearTo: null, seasons: [] })
  })

  it('shows the period in place of the cour picker, with a way back to one cour', () => {
    state = { ...base(), period: { yearFrom: 2018, yearTo: 2020, seasons: ['SPRING'] } }
    render(<Browse token="t" />)
    expect(screen.queryByRole('button', { name: '来期' })).toBeNull()
    expect(screen.getByText('2018〜2020年 春')).toBeTruthy()
    expect(sortButtons()).toEqual(['人気順', '評価順', 'おすすめ順', '新しい順'])
    fireEvent.click(screen.getByRole('button', { name: '1つのクールで選ぶ' }))
    expect(setPeriod).toHaveBeenCalledWith({ yearFrom: null, yearTo: null, seasons: [] })
  })
})
