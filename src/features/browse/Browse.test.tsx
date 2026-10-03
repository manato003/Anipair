// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork } from '../../lib/annict'
import { nextSeason, seasonOf, type Season } from '../../lib/season'
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
let state: {
  season: Season
  searching: boolean
  sort: BrowseSort
  tasteNote: string | null
  reasons: Map<number, string>
  works: BrowseWork[] | null
}

function base() {
  return {
    season: seasonOf(new Date()),
    searching: false,
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
    setSeason,
    setSort,
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

const { Browse } = await import('./Browse')

afterEach(() => {
  cleanup()
  setSeason.mockClear()
  setSort.mockClear()
  state = base()
})

const sortButtons = () => [...screen.getByRole('group', { name: '並べ替え' }).querySelectorAll('button')].map((b) => b.textContent)

describe('Browse sort options', () => {
  it('offers 好み順 for the season list but not 新しい順', () => {
    render(<Browse token="t" />)
    expect(sortButtons()).toEqual(['人気順', '評価順', '好み順'])
    fireEvent.click(screen.getByRole('button', { name: '好み順' }))
    expect(setSort).toHaveBeenCalledWith('taste')
  })

  it('offers 新しい順 but not 好み順 while searching by title', () => {
    state = { ...base(), searching: true }
    render(<Browse token="t" />)
    expect(sortButtons()).toEqual(['人気順', '評価順', '新しい順'])
  })

  it('shows the reason on the second line only in 好み順', () => {
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
