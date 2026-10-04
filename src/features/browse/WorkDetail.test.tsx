// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork, MyReview } from '../../lib/annict'

const calls: string[] = []
// 本物と同じく、読み込みは1つの Promise を使い回す。テストごとに作り直す
let releaseReviews: (m: Map<number, MyReview>) => void = () => undefined
let reviewsPromise: Promise<Map<number, MyReview>> = Promise.resolve(new Map())

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchWorkDetail: vi.fn(async () => ({ ...work, titleKana: null, episodesCount: 12, officialSiteUrl: 'javascript:alert(1)', wikipediaUrl: null, twitterUsername: null, copyright, casts: [], staffs: [] })),
  updateStatus: vi.fn(async (_t: string, id: string, s: string) => void calls.push(`status ${id} ${s}`)),
  createReview: vi.fn(async (_t: string, id: string, r: string) => {
    calls.push(`create ${id} ${r}`)
    return 'NEW'
  }),
  deleteReview: vi.fn(async (_t: string, id: string) => void calls.push(`delete ${id}`)),
}))
let synopsis: { text: string; source: string | null } | null = null
let vods: { name: string; url: string }[] = []
let copyright: string | null = null
// Shikimori はジャンルとテーマ（と Shikimori へのリンク）だけに使う。あらすじは取らない
let shikiMedia: { genres: string[]; themes: string[] } | null = null
vi.mock('../../lib/shikimori', async (orig) => ({
  ...(await orig<typeof import('../../lib/shikimori')>()),
  fetchMedia: vi.fn(async (ids: number[]) => new Map(shikiMedia ? ids.map((id) => [id, { idMal: id, ...shikiMedia }]) : [])),
}))
vi.mock('../../lib/annictPage', () => ({ fetchWorkPage: vi.fn(async () => ({ synopsis, vods })) }))
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(() => reviewsPromise),
  rememberReview: vi.fn(async () => undefined),
}))

const { WorkDetail } = await import('./WorkDetail')
const { getMyReviews, rememberReview } = await import('../../lib/myReviews')
const { fetchWorkPage } = await import('../../lib/annictPage')

const work: BrowseWork = {
  id: 'W1',
  annictId: 1,
  title: '作品',
  media: 'TV',
  seasonYear: 2023,
  seasonName: 'AUTUMN',
  malAnimeId: null,
  watchersCount: 100,
  viewerStatusState: 'WATCHED',
}

const existing: MyReview = {
  id: 'R1',
  body: '',
  createdAt: '',
  ratingOverallState: 'GOOD',
  ratingStoryState: null,
  ratingAnimationState: null,
  ratingMusicState: null,
  ratingCharacterState: null,
}

// 送信の列の代わり。順番に実行して、終わりを待てるようにする
function queue() {
  let chain = Promise.resolve()
  return {
    enqueue: (_l: string, task: () => Promise<void>) => {
      chain = chain.then(task)
    },
    done: () => chain,
  }
}

beforeEach(() => {
  calls.length = 0
  synopsis = null
  shikiMedia = null
  vods = []
  copyright = null
  vi.mocked(getMyReviews).mockClear()
  vi.mocked(rememberReview).mockClear()
  reviewsPromise = new Promise((resolve) => (releaseReviews = resolve))
})
afterEach(cleanup)

describe('WorkDetail', () => {
  it('rating before my reviews have loaded replaces the existing review instead of adding a second one', async () => {
    const q = queue()
    const onChange = vi.fn()
    render(<WorkDetail token="t" work={work} cover={null} enqueue={q.enqueue} onChange={onChange} onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'とても良い' }))
    expect(onChange).toHaveBeenCalledWith({ rating: 'GREAT' })
    releaseReviews(new Map([[1, existing]]))
    await q.done()
    expect(calls).toEqual(['create W1 GREAT', 'delete R1'])
    // 読み込みが後から終わっても、押した評価の表示は戻らない
    expect(screen.getByRole('button', { name: 'とても良い' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('pressing the selected state again removes the work from the library', async () => {
    const q = queue()
    const onChange = vi.fn()
    render(<WorkDetail token="t" work={work} cover={null} enqueue={q.enqueue} onChange={onChange} onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: '見た' }))
    await q.done()
    expect(calls).toEqual(['status W1 NO_STATE'])
    expect(onChange).toHaveBeenCalledWith({ state: null })
  })

  it('treats NO_STATE as not recorded', () => {
    render(
      <WorkDetail token="t" work={{ ...work, viewerStatusState: 'NO_STATE' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />,
    )
    expect(screen.getByText('まだ記録していません。')).toBeTruthy()
    expect(document.querySelectorAll('.state-chips [aria-selected="true"]')).toHaveLength(0)
  })

  it('does not link to an official site with a non-http URL', async () => {
    render(<WorkDetail token="t" work={work} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(screen.queryByRole('link', { name: '公式サイト' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Annict' }).getAttribute('href')).toBe('https://annict.com/works/1')
  })

  it("shows Annict's Japanese synopsis with its source, and the genres and themes from Shikimori in Japanese", async () => {
    // 改行を含む文字列は、エスケープを使わずテンプレートリテラルに本物の改行で書く（ツール経由でエスケープが化けるため）
    const text = `勇者ヒンメルたちと共に、
魔王を打ち倒し。`
    synopsis = { text, source: 'https://frieren-anime.jp/story/' }
    shikiMedia = { genres: ['Fantasy'], themes: ['Award Winning'] }
    render(<WorkDetail token="t" work={{ ...work, malAnimeId: '52991' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('あらすじ')).toBeTruthy())
    expect(document.querySelector('.detail__text')?.textContent).toBe(text)
    expect(screen.getByRole('link', { name: '引用元' }).getAttribute('href')).toBe('https://frieren-anime.jp/story/')
    expect(await screen.findByText('ファンタジー・受賞作')).toBeTruthy()
  })

  it('shows no synopsis at all when Annict has none (no English fallback)', async () => {
    shikiMedia = { genres: [], themes: [] }
    render(<WorkDetail token="t" work={{ ...work, malAnimeId: '52991' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(screen.queryByText('あらすじ')).toBeNull()
    expect(document.querySelector('.detail__text')).toBeNull()
  })

  it('shows the copyright notice from Annict under the cover, when there is one', async () => {
    copyright = '© 山田鐘人・アベツカサ／小学館／「葬送のフリーレン」製作委員会'
    render(<WorkDetail token="t" work={work} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect((await screen.findByText(copyright)).classList.contains('detail__copyright')).toBe(true)
  })

  it('puts © in front of a notice that has none', async () => {
    copyright = '山田鐘人・アベツカサ／小学館'
    render(<WorkDetail token="t" work={work} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect((await screen.findByText('© 山田鐘人・アベツカサ／小学館')).classList.contains('detail__copyright')).toBe(true)
  })

  it('keeps everything but the cover and title hidden until the detail, the work page and the genres have all arrived', async () => {
    let releasePage: (p: { synopsis: null; vods: [] }) => void = () => undefined
    vi.mocked(fetchWorkPage).mockImplementationOnce(() => new Promise((resolve) => (releasePage = resolve)))
    render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
    // 詳細は届いたが、作品ページがまだ
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(document.querySelector('.detail--ready')).toBeNull()
    expect(document.querySelector('.detail__loading')).not.toBeNull()
    releasePage({ synopsis: null, vods: [] })
    await waitFor(() => expect(document.querySelector('.detail--ready')).not.toBeNull())
    expect(document.querySelector('.detail__loading')).toBeNull()
  })

  it('links to Shikimori only when the work has a MyAnimeList id', () => {
    const { unmount } = render(<WorkDetail token="t" work={{ ...work, malAnimeId: '52991' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect(screen.getByRole('link', { name: 'Shikimori で見る' }).getAttribute('href')).toBe('https://shikimori.io/animes/52991')
    unmount()
    render(<WorkDetail token="t" work={{ ...work, malAnimeId: null }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect(screen.queryByRole('link', { name: 'Shikimori で見る' })).toBeNull()
  })

  it('shows a landscape (official-site) cover uncropped, and a poster as is', () => {
    const { unmount } = render(
      <WorkDetail token="t" work={work} cover={{ url: 'https://og.example/a.jpg', thumb: 'https://og.example/a.jpg', landscape: true }} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />,
    )
    expect(document.querySelector('.detail__cover--landscape img.cover--contain')).toBeTruthy()
    unmount()
    render(<WorkDetail token="t" work={work} cover={{ url: 'https://s.example/p.jpg', thumb: 'https://s.example/p-s.jpg', landscape: false }} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect(document.querySelector('.detail__cover--landscape')).toBeNull()
    expect(document.querySelector('.detail__cover img')?.className).toBe('')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<WorkDetail token="t" work={work} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reads the current review from the shared cache when sending, and remembers the new one', async () => {
    const q = queue()
    render(<WorkDetail token="t" work={work} cover={null} enqueue={q.enqueue} onChange={() => undefined} onClose={() => undefined} />)
    releaseReviews(new Map([[1, existing]]))
    await waitFor(() => expect(screen.getByRole('button', { name: '良い' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: 'とても良い' }))
    await q.done()
    expect(calls).toEqual(['create W1 GREAT', 'delete R1'])
    expect(rememberReview).toHaveBeenCalledWith('t', 1, expect.objectContaining({ id: 'NEW', ratingOverallState: 'GREAT' }))
  })

  it('is read-only on request: no state or rating, and my reviews are not loaded', async () => {
    render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(screen.queryByText('状態')).toBeNull()
    expect(screen.queryByText('評価')).toBeNull()
    expect(document.querySelector('.state-chips')).toBeNull()
    expect(getMyReviews).not.toHaveBeenCalled()
  })

  it('shows what the seed knows before the detail loads, and leaves out what it does not', () => {
    const seed = { id: 'W9', annictId: 9, title: '手がかりだけ', malAnimeId: null }
    render(<WorkDetail readOnly token="t" work={seed} cover={null} onClose={() => undefined} />)
    expect(screen.getByText('手がかりだけ')).toBeTruthy()
    expect(document.querySelectorAll('.detail__meta')).toHaveLength(0)
  })

  it('lists streaming services as links, in read-only sheets too, and omits the section when there are none', async () => {
    vods = [
      { name: 'Netflix', url: 'https://www.netflix.com/title/1' },
      { name: 'ABEMAビデオ', url: 'https://abema.tv/video/title/1' },
    ]
    const { unmount } = render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Netflix' }).getAttribute('href')).toBe('https://www.netflix.com/title/1'))
    expect(screen.getByText('配信')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'ABEMAビデオ' })).toBeTruthy()
    unmount()
    vods = []
    render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(screen.queryByText('配信')).toBeNull()
  })

  it('ignores Escape while inactive (a sheet left open in a hidden tab)', () => {
    const onClose = vi.fn()
    const { rerender } = render(<WorkDetail readOnly token="t" work={work} cover={null} active={false} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    rerender(<WorkDetail readOnly token="t" work={work} cover={null} active onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
