// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnnictSeries, SeriesWork } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import { RelatedWorks } from './RelatedWorks'

const { fetchMedia } = vi.hoisted(() => ({ fetchMedia: vi.fn() }))
vi.mock('../../lib/shikimori', () => ({ fetchMedia }))

afterEach(() => {
  cleanup()
  fetchMedia.mockReset()
})

function sw(annictId: number, over: Partial<SeriesWork> = {}): SeriesWork {
  return { id: `W${annictId}`, annictId, title: `作品${annictId}`, seasonYear: 2020, seasonName: 'SPRING', media: 'TV', malAnimeId: null, viewerStatusState: null, summary: null, ...over }
}

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

describe('RelatedWorks', () => {
  it('shows nothing while the Annict detail is loading', () => {
    const { container } = render(<RelatedWorks annictId={1} series={null} shiki={media(1, { related: [{ kind: 'sequel', malId: 2 }] })} />)
    expect(container.firstChild).toBeNull()
    expect(fetchMedia).not.toHaveBeenCalled()
  })

  it('lists the Annict series in order, marks this work, links the others to Annict, and shows my status', () => {
    const series: AnnictSeries[] = [
      { name: 'テスト', works: [sw(1, { summary: '第1期', viewerStatusState: 'WATCHED' }), sw(2, { summary: '第2期' }), sw(3, { summary: '劇場版', media: 'MOVIE' })] },
    ]
    render(<RelatedWorks annictId={2} series={series} shiki={null} />)
    expect(screen.getByText('シリーズ「テスト」')).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.related__tag')?.textContent)).toEqual(['第1期', 'この作品', '劇場版'])
    expect(items[1].getAttribute('aria-current')).toBe('true')
    expect(screen.queryByRole('link', { name: '作品2' })).toBeNull()
    expect((screen.getByRole('link', { name: '作品3' }) as HTMLAnchorElement).href).toBe('https://annict.com/works/3')
    expect(items[0].textContent).toContain('見た')
    expect(fetchMedia).not.toHaveBeenCalled()
  })

  it('folds a long series around this work, and expands on request', () => {
    const works = Array.from({ length: 12 }, (_, i) => sw(i + 1))
    render(<RelatedWorks annictId={11} series={[{ name: '長い', works }]} shiki={null} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByText('作品11')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'すべて表示（12作品）' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
  })

  it('falls back to Shikimori relations when Annict has no series, with Japanese labels and Annict search links', async () => {
    fetchMedia.mockResolvedValue(new Map([[3, media(3, { seasonYear: 2024 })], [2, media(2, { seasonYear: 2018, format: 'MOVIE' })]]))
    const shiki = media(1, { related: [{ kind: 'sequel', malId: 3 }, { kind: 'prequel', malId: 2 }, { kind: 'adaptation', malId: 9 }] })
    render(<RelatedWorks annictId={1} series={[]} shiki={shiki} />)
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.related__tag')?.textContent)).toEqual(['前作', '続編'])
    expect(items[0].textContent).toContain('2018年 劇場版')
    expect((screen.getByRole('link', { name: '題名3' }) as HTMLAnchorElement).href).toContain('https://annict.com/search?q=')
    expect(screen.getByText(/Shikimori の関連作品を表示しています/)).toBeTruthy()
  })

  it('shows nothing when there is neither a series nor a relation', () => {
    const { container } = render(<RelatedWorks annictId={1} series={[]} shiki={media(1)} />)
    expect(container.firstChild).toBeNull()
  })
})
