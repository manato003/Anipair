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
  fetchWorkDetail: vi.fn(async () => ({ ...work, titleKana: null, episodesCount: 12, officialSiteUrl: 'javascript:alert(1)', wikipediaUrl: null, twitterUsername: null, casts: [], staffs: [] })),
  updateStatus: vi.fn(async (_t: string, id: string, s: string) => void calls.push(`status ${id} ${s}`)),
  createReview: vi.fn(async (_t: string, id: string, r: string) => {
    calls.push(`create ${id} ${r}`)
    return 'NEW'
  }),
  deleteReview: vi.fn(async (_t: string, id: string) => void calls.push(`delete ${id}`)),
}))
let synopsis: { text: string; source: string | null } | null = null
let vods: { name: string; url: string }[] = []
let english: { description: string | null; genres: string[] } | null = null
vi.mock('../../lib/anilist', () => ({ fetchDescription: vi.fn(async () => english) }))
vi.mock('../../lib/annictPage', () => ({ fetchWorkPage: vi.fn(async () => ({ synopsis, vods })) }))
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(() => reviewsPromise),
  rememberReview: vi.fn(async () => undefined),
}))

const { WorkDetail } = await import('./WorkDetail')
const { getMyReviews, rememberReview } = await import('../../lib/myReviews')

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
  vods = []
  english = null
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

  it("shows Annict's Japanese synopsis with its source, not AniList's English one", async () => {
    // 改行を含む文字列は、エスケープを使わずテンプレートリテラルに本物の改行で書く（ツール経由でエスケープが化けるため）
    const text = `勇者ヒンメルたちと共に、
魔王を打ち倒し。`
    synopsis = { text, source: 'https://frieren-anime.jp/story/' }
    english = { description: 'The adventure is over.', genres: ['Fantasy'] }
    render(<WorkDetail token="t" work={{ ...work, malAnimeId: '52991' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('あらすじ')).toBeTruthy())
    expect(document.querySelector('.detail__text')?.textContent).toBe(text)
    expect(screen.getByRole('link', { name: '引用元' }).getAttribute('href')).toBe('https://frieren-anime.jp/story/')
    expect(screen.queryByText('The adventure is over.')).toBeNull()
    expect(screen.getByText('ファンタジー')).toBeTruthy()
  })

  it("falls back to AniList's English synopsis, labelled, only when Annict has none", async () => {
    english = { description: 'The adventure is over.', genres: [] }
    render(<WorkDetail token="t" work={{ ...work, malAnimeId: '52991' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('The adventure is over.')).toBeTruthy())
    expect(screen.getByText('あらすじ（Annict に無いため AniList の英語版）')).toBeTruthy()
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
