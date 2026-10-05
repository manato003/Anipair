// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '../../lib/shikimori'

function media(id: number, year: number | null, extra: Partial<Media> = {}): Media {
  return {
    idMal: id,
    title: { native: `作品${id}`, romaji: null, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: year,
    genres: [],
    themes: [],
    demographics: [],
    studios: [],
    cover: null,
    score: null,
    prequels: [],
    related: [],
    ...extra,
  }
}

const findPerson = vi.fn()
const fetchPersonWorks = vi.fn()
const fetchStudioWorks = vi.fn()
const fetchMedia = vi.fn()
vi.mock('../../lib/shikimori', () => ({
  findPerson: (...a: unknown[]) => findPerson(...a),
  fetchPersonWorks: (...a: unknown[]) => fetchPersonWorks(...a),
  fetchStudioWorks: (...a: unknown[]) => fetchStudioWorks(...a),
  fetchMedia: (...a: unknown[]) => fetchMedia(...a),
}))
vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  peekLibrary: () => [{ workId: 'W', annictId: 1, title: '作品2', malAnimeId: '2', state: 'WATCHED', stateAt: null }],
}))
// 一覧から開く詳細は、開いたことだけを確かめる
vi.mock('./RelatedDetail', () => ({ RelatedDetail: (p: { target: { media: Media } }) => <div data-testid="opened">{p.target.media.idMal}</div> }))

const { CreditWorks } = await import('./CreditWorks')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CreditWorks', () => {
  it('finds the person, lists voice roles and staff work together with role tags, newest first, marks my records, and opens a work', async () => {
    findPerson.mockResolvedValue({ id: 14441, name: 'Sumire Uesaka', japanese: '上坂 すみれ' })
    fetchPersonWorks.mockResolvedValue({
      cast: [1, 2, 3, 4],
      staff: [
        { id: 2, roles: ['主題歌'] },
        { id: 5, roles: ['主題歌'] },
      ],
    })
    fetchMedia.mockResolvedValue(
      new Map([
        [1, media(1, 2010, { popularity: 900 })],
        [2, media(2, 2020, { popularity: 100 })],
        [3, media(3, null, { popularity: 50 })],
        [4, media(4, 2024, { format: 'CM' })],
        [5, media(5, 2015, { popularity: 300 })],
      ]),
    )
    render(<CreditWorks readOnly token="t" target={{ credit: { kind: 'person', annictId: 855, name: '上坂すみれ' }, studio: null }} active onClose={() => {}} />)
    expect(findPerson).toHaveBeenCalledWith('上坂すみれ')
    await waitFor(() => expect(screen.getByText('参加した作品（4作品）')).toBeTruthy())
    const titles = () => [...document.querySelectorAll('.creditworks__title')].map((e) => e.textContent)
    // 1つの一覧。新着順（年の分からない作品は最後）、宣伝（CM）は出さない。分け方のタブは無い
    expect(screen.queryByRole('tab')).toBeNull()
    expect(titles()).toEqual(['作品2', '作品5', '作品1', '作品3'])
    // 役割の札: 出演と主題歌の両方なら並べる
    const second = screen.getByRole('button', { name: /作品2/ })
    expect(within(second).getByText('出演・主題歌')).toBeTruthy()
    expect(within(second).getByText('見た')).toBeTruthy()
    expect(within(screen.getByRole('button', { name: /作品5/ })).getByText('主題歌')).toBeTruthy()
    // 人気順
    fireEvent.click(screen.getByRole('button', { name: '人気順' }))
    expect(titles()).toEqual(['作品1', '作品5', '作品2', '作品3'])
    expect(screen.getByText('Shikimori でリストに入れている人の多い順です。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /作品5/ }))
    expect(screen.getByTestId('opened').textContent).toBe('5')
  })

  it('offers only the named Annict link when the person cannot be matched', async () => {
    findPerson.mockResolvedValue(null)
    render(<CreditWorks readOnly token="t" target={{ credit: { kind: 'person', annictId: 855, name: '誰か' }, studio: null }} active onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('参加作品を見つけられませんでした。')).toBeTruthy())
    expect((screen.getByRole('link', { name: 'Annict で見る' }) as HTMLAnchorElement).href).toBe('https://annict.com/people/855')
    expect(fetchPersonWorks).not.toHaveBeenCalled()
  })

  it('lists the works of a studio it could tie to Shikimori, and falls back to Annict when it could not', async () => {
    fetchStudioWorks.mockResolvedValue([media(7, 2001), media(8, 2023)])
    const { unmount } = render(
      <CreditWorks readOnly token="t" target={{ credit: { kind: 'org', annictId: 50, name: '京都アニメーション' }, studio: { id: 2, name: 'Kyoto Animation' } }} active onClose={() => {}} />,
    )
    await waitFor(() => expect(screen.getByText('作品8')).toBeTruthy())
    expect(fetchStudioWorks).toHaveBeenCalledWith(2)
    expect(screen.getByText('制作した作品（2作品）')).toBeTruthy()
    unmount()

    render(<CreditWorks readOnly token="t" target={{ credit: { kind: 'org', annictId: 50, name: '製作委員会' }, studio: null }} active onClose={() => {}} />)
    await waitFor(() => expect((screen.getByRole('link', { name: 'Annict で見る' }) as HTMLAnchorElement).href).toBe('https://annict.com/organizations/50'))
  })

  it('shows the error when Shikimori cannot be read', async () => {
    findPerson.mockRejectedValue(new Error('Shikimori に接続できませんでした'))
    render(<CreditWorks readOnly token="t" target={{ credit: { kind: 'person', annictId: 1, name: 'x' }, studio: null }} active onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Shikimori に接続できませんでした')).toBeTruthy())
  })
})
