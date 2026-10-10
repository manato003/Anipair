// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '../../lib/shikimori'
import { SimilarWorks } from './SimilarWorks'

const { fetchMedia, fetchSimilar, peekLibrary } = vi.hoisted(() => ({ fetchMedia: vi.fn(), fetchSimilar: vi.fn(), peekLibrary: vi.fn() }))
vi.mock('../../lib/shikimori', () => ({ fetchMedia, fetchSimilar }))
vi.mock('../../lib/annict', () => ({ peekLibrary }))

afterEach(() => {
  cleanup()
  fetchMedia.mockReset()
  fetchSimilar.mockReset()
  peekLibrary.mockReset()
})

function media(idMal: number, over: Partial<Media> = {}): Media {
  return {
    idMal,
    title: { native: `題名${idMal}`, romaji: null, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2020,
    genres: [],
    themes: [],
    demographics: [],
    studios: [],
    cover: null,
    score: null,
    prequels: [],
    related: [],
    ...over,
  }
}

function mediaMap(...list: Media[]): Map<number, Media> {
  return new Map(list.map((m) => [m.idMal, m]))
}

describe('SimilarWorks', () => {
  it('shows the similar works in Shikimori order, drops promo videos and this work, marks my records, and opens one in the app', async () => {
    fetchSimilar.mockResolvedValue([3, 2, 9, 1, 4])
    fetchMedia.mockResolvedValue(mediaMap(media(1), media(2, { seasonYear: 2018, format: 'MOVIE' }), media(3), media(4, { format: 'PV' })))
    peekLibrary.mockReturnValue([{ malAnimeId: '3', state: 'WATCHED' }])
    const onOpen = vi.fn()
    render(<SimilarWorks malId={1} onOpen={onOpen} />)

    expect(await screen.findByText('似た作品')).toBeTruthy()
    expect(fetchSimilar).toHaveBeenCalledWith(1)
    const items = screen.getAllByRole('button')
    expect(items.map((b) => b.querySelector('.similar__title')?.textContent)).toEqual(['題名3', '題名2'])
    expect(items[0].querySelector('.similar__mine')?.textContent).toBe('見た')
    expect(items[1].querySelector('.similar__meta')?.textContent).toBe('2018年 劇場版')

    fireEvent.click(items[1])
    expect(onOpen).toHaveBeenCalledWith({ kind: 'shiki', media: expect.objectContaining({ idMal: 2 }) })
  })

  it('shows nothing without a MyAnimeList ID, and nothing when there are no similar works or the lookup fails', async () => {
    const { container, rerender } = render(<SimilarWorks malId={null} onOpen={vi.fn()} />)
    expect(container.firstChild).toBeNull()
    expect(fetchSimilar).not.toHaveBeenCalled()

    fetchSimilar.mockResolvedValue([])
    fetchMedia.mockResolvedValue(new Map())
    rerender(<SimilarWorks malId={5} onOpen={vi.fn()} />)
    await waitFor(() => expect(fetchMedia).toHaveBeenCalled())
    expect(screen.queryByText('似た作品')).toBeNull()

    fetchSimilar.mockRejectedValue(new Error('down'))
    rerender(<SimilarWorks malId={6} onOpen={vi.fn()} />)
    await waitFor(() => expect(fetchSimilar).toHaveBeenCalledWith(6))
    expect(screen.queryByText('似た作品')).toBeNull()
  })

  it('waits until the shelf comes near the screen before asking Shikimori', async () => {
    let fire: (hit: boolean) => void = () => undefined
    class IO {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        fire = (hit) => cb([{ isIntersecting: hit }])
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IO)
    try {
      fetchSimilar.mockResolvedValue([2])
      fetchMedia.mockResolvedValue(mediaMap(media(2)))
      render(<SimilarWorks malId={1} onOpen={vi.fn()} />)
      expect(fetchSimilar).not.toHaveBeenCalled()
      fire(false)
      expect(fetchSimilar).not.toHaveBeenCalled()
      fire(true)
      expect(await screen.findByText('題名2')).toBeTruthy()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
