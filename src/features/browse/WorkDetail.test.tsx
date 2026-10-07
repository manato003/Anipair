// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork, MyReview, ReviewAxes } from '../../lib/annict'

const calls: string[] = []
// 本物と同じく、読み込みは1つの Promise を使い回す。テストごとに作り直す
let releaseReviews: (m: Map<number, MyReview>) => void = () => undefined
let reviewsPromise: Promise<Map<number, MyReview>> = Promise.resolve(new Map())

// Annict 側の感想（書き込みの直前の読み直し fetchReview に答える）。作った・消したを追いかける
const annictCreated = new Map<string, MyReview>()
const annictDeleted = new Set<string>()
afterEach(() => {
  annictCreated.clear()
  annictDeleted.clear()
})

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchWorkDetail: vi.fn(async () => ({ ...work, titleKana: null, episodesCount: 12, officialSiteUrl: 'javascript:alert(1)', wikipediaUrl: null, twitterUsername: null, copyright, casts: [], staffs: [] })),
  updateStatus: vi.fn(async (_t: string, id: string, s: string) => void calls.push(`status ${id} ${s}`)),
  createReviewWith: vi.fn(async (_t: string, id: string, axes: ReviewAxes, body: string) => {
    const r = axes.ratingOverallState
    calls.push(`create ${id} ${r}`)
    annictCreated.set('NEW', { id: 'NEW', body, createdAt: '', ...axes })
    return 'NEW'
  }),
  fetchReview: vi.fn(async (_t: string, id: string) => (annictDeleted.has(id) ? null : (annictCreated.get(id) ?? [...(await reviewsPromise).values()].find((x) => x.id === id) ?? null))),
  deleteReview: vi.fn(async (_t: string, id: string) => {
    annictDeleted.add(id)
    void calls.push(`delete ${id}`)
  }),
}))
let copyright: string | null = null
// Shikimori はジャンルとテーマ（と Shikimori へのリンク）だけに使う
let shikiMedia: { genres: string[]; themes: string[] } | null = null
vi.mock('../../lib/shikimori', async (orig) => ({
  ...(await orig<typeof import('../../lib/shikimori')>()),
  fetchMedia: vi.fn(async (ids: number[]) => new Map(shikiMedia ? ids.map((id) => [id, { idMal: id, ...shikiMedia }]) : [])),
}))
// あらすじは Wikipedia から（既定は無し。あらすじのテストだけ入れる）
let wikiSynopsis: { text: string; blocks: { heading: boolean; text: string }[]; title: string; url: string; licenseUrl: string } | null = null
vi.mock('../../lib/wikipedia', () => ({ fetchWikiSynopsis: vi.fn(async () => wikiSynopsis) }))
// 話の一覧（ネットワークに出さない）。読むように頼まれた作品を控える
const episodeAsks: string[][] = []
vi.mock('../records/useEpisodes', () => ({
  useEpisodes: (_t: string, ids: readonly string[]) => {
    if (ids.length > 0) episodeAsks.push([...ids])
    return {
      byWork: new Map([['W1', { workId: 'W1', noEpisodes: false, episodes: [{ id: 'E1', annictId: 1, number: 1, numberText: '#1', title: '始まり', viewerDidTrack: false, viewerRecordsCount: 0 }] }]]),
      errors: new Map(),
      undoable: new Set(),
      record: vi.fn(),
      undo: vi.fn(),
      retry: vi.fn(),
    }
  },
}))
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(() => reviewsPromise),
  rememberReview: vi.fn(async () => undefined),
}))

const { WorkDetail } = await import('./WorkDetail')
const { fetchWorkDetail } = await import('../../lib/annict')
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
  shikiMedia = null
  wikiSynopsis = null
  copyright = null
  vi.mocked(getMyReviews).mockClear()
  vi.mocked(rememberReview).mockClear()
  reviewsPromise = new Promise((resolve) => (releaseReviews = resolve))
})
afterEach(cleanup)

describe('WorkDetail: recording episodes', () => {
  it('shows the episode recorder in an editable sheet of a work being watched or watched', () => {
    episodeAsks.length = 0
    render(<WorkDetail token="t" work={{ ...work, viewerStatusState: 'WATCHING' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect(screen.getByRole('heading', { name: '話ごとの記録' })).toBeTruthy()
    expect(within(screen.getByRole('list', { name: '話の一覧' })).getByText('始まり')).toBeTruthy()
    expect(episodeAsks).toContainEqual(['W1'])
  })

  it('does not show it (or read the episodes) for other states, or in a read-only sheet', () => {
    episodeAsks.length = 0
    const { unmount } = render(<WorkDetail token="t" work={{ ...work, viewerStatusState: 'WANNA_WATCH' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect(screen.queryByRole('heading', { name: '話ごとの記録' })).toBeNull()
    unmount()
    // 評価の画面・マッチングの読むだけのシートでは出さない（答え方を2つにしない）
    render(<WorkDetail readOnly token="t" work={{ ...work, viewerStatusState: 'WATCHING' }} cover={null} onClose={() => undefined} />)
    expect(screen.queryByRole('heading', { name: '話ごとの記録' })).toBeNull()
    expect(episodeAsks).toEqual([])
  })
})

describe('WorkDetail', () => {
  it('rating before my reviews have loaded replaces the existing review instead of adding a second one', async () => {
    const q = queue()
    const onChange = vi.fn()
    render(<WorkDetail token="t" work={work} cover={null} enqueue={q.enqueue} onChange={onChange} onClose={() => undefined} />)
    fireEvent.click(within(screen.getByRole('group', { name: '評価' })).getByRole('button', { name: 'とても良い' }))
    expect(onChange).toHaveBeenCalledWith({ rating: 'GREAT' })
    releaseReviews(new Map([[1, existing]]))
    await q.done()
    expect(calls).toEqual(['create W1 GREAT', 'delete R1'])
    // 読み込みが後から終わっても、押した評価の表示は戻らない
    expect(within(screen.getByRole('group', { name: '評価' })).getByRole('button', { name: 'とても良い' }).getAttribute('aria-pressed')).toBe('true')
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

  // 2026-10-06 の点検: 参加作品・Shikimori の関連作品から開くと、見た作品が「まだ記録していません」と出ていた
  it('takes my status from the loaded detail when the sheet was opened from a work that did not know it', async () => {
    const q = queue()
    const seed = { id: 'W1', annictId: 1, title: '作品', malAnimeId: null }
    render(<WorkDetail token="t" work={seed} cover={null} enqueue={q.enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect(screen.getByText('まだ記録していません。')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('heading', { name: '話ごとの記録' })).toBeTruthy())
    // 「見た」をもう一度押すと、記録から外す（記録していないと思い込んで「見た」を送り直さない）
    fireEvent.click(screen.getByRole('button', { name: '見た' }))
    await q.done()
    expect(calls).toEqual(['status W1 NO_STATE'])
  })

  it('treats NO_STATE as not recorded', () => {
    render(
      <WorkDetail token="t" work={{ ...work, viewerStatusState: 'NO_STATE' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />,
    )
    expect(screen.getByText('まだ記録していません。')).toBeTruthy()
    expect(document.querySelectorAll('.state-chips [aria-selected="true"]')).toHaveLength(0)
  })

  it('links to each streaming service search with the title (also in a read-only sheet)', async () => {
    render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('配信サービスで探す')).toBeTruthy())
    const d = screen.getByRole('link', { name: 'dアニメストア' })
    expect(d.getAttribute('href')).toBe(`https://animestore.docomo.ne.jp/animestore/sch_pc?searchKey=${encodeURIComponent(work.title)}`)
    expect(d.getAttribute('target')).toBe('_blank')
    for (const name of ['Netflix', 'U-NEXT', 'Prime Video', 'ABEMA', 'ニコニコ']) expect(screen.getByRole('link', { name })).toBeTruthy()
  })

  it('does not link to an official site with a non-http URL', async () => {
    render(<WorkDetail token="t" work={work} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(screen.queryByRole('link', { name: '公式サイト' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Annict' }).getAttribute('href')).toBe('https://annict.com/works/1')
  })

  it('shows the start of the Wikipedia synopsis, and the rest in place only when asked (it may spoil), with its source and license', async () => {
    wikiSynopsis = {
      text: '魔王を倒した勇者一行は、王都に凱旋した。…',
      blocks: [
        { heading: true, text: '第1部' },
        { heading: false, text: '魔王を倒した勇者一行は、王都に凱旋した。エルフのフリーレンにとって、その旅は短いものだった。' },
        { heading: false, text: 'それから50年後、ヒンメルは亡くなる。' },
      ],
      title: '葬送のフリーレン',
      url: 'https://ja.wikipedia.org/wiki/%E8%91%AC%E9%80%81%E3%81%AE%E3%83%95%E3%83%AA%E3%83%BC%E3%83%AC%E3%83%B3#%E3%81%82%E3%82%89%E3%81%99%E3%81%98',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja',
    }
    render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('あらすじ')).toBeTruthy())
    expect(screen.getByText('魔王を倒した勇者一行は、王都に凱旋した。…')).toBeTruthy()
    expect(screen.queryByText('それから50年後、ヒンメルは亡くなる。')).toBeNull()
    expect(screen.getByText('ネタバレを含むことがあります')).toBeTruthy()
    // Wikipedia へ移らずに、その場で全文を広げる
    fireEvent.click(screen.getByRole('button', { name: '続きを読む' }))
    expect(screen.getByRole('heading', { level: 4, name: '第1部' })).toBeTruthy()
    expect(screen.getByText('それから50年後、ヒンメルは亡くなる。')).toBeTruthy()
    expect(screen.queryByText('ネタバレを含むことがあります')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '続きを閉じる' }))
    expect(screen.queryByText('それから50年後、ヒンメルは亡くなる。')).toBeNull()
    // 出典とライセンス
    expect(screen.getByRole('link', { name: '葬送のフリーレン' }).getAttribute('href')).toBe(wikiSynopsis.url)
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' }).getAttribute('href')).toBe(wikiSynopsis.licenseUrl)
    expect(screen.queryByRole('link', { name: /続きは Wikipedia/ })).toBeNull()
  })

  it('shows the genres and themes from Shikimori in Japanese', async () => {
    shikiMedia = { genres: ['Fantasy'], themes: ['Award Winning'] }
    render(<WorkDetail token="t" work={{ ...work, malAnimeId: '52991' }} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={() => undefined} />)
    expect(await screen.findByText('ファンタジー・受賞作')).toBeTruthy()
  })

  it('reads nothing outside the Annict API: no synopsis and no streaming services (they are only on Annict\u2019s web pages)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(screen.queryByText('あらすじ')).toBeNull()
    expect(screen.queryByText('配信')).toBeNull()
    expect(fetchSpy.mock.calls.some(([url]) => String(url).startsWith('https://annict.com/'))).toBe(false)
    fetchSpy.mockRestore()
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

  it('keeps everything but the cover and title hidden until the detail and the genres have both arrived', async () => {
    let releaseShiki: (m: Map<number, unknown>) => void = () => undefined
    const { fetchMedia } = await import('../../lib/shikimori')
    vi.mocked(fetchMedia).mockImplementationOnce(() => new Promise((resolve) => (releaseShiki = resolve as (m: Map<number, unknown>) => void)))
    render(<WorkDetail readOnly token="t" work={{ ...work, malAnimeId: '52991' }} cover={null} onClose={() => undefined} />)
    // 詳細は届いたが、ジャンルがまだ
    await waitFor(() => expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy())
    expect(document.querySelector('.detail--ready')).toBeNull()
    expect(document.querySelector('.detail__loading')).not.toBeNull()
    releaseShiki(new Map())
    await waitFor(() => expect(document.querySelector('.detail--ready')).not.toBeNull())
    expect(document.querySelector('.detail__loading')).toBeNull()
  })

  it('after giving up waiting, says what is still loading until it arrives (what is shown is not everything)', async () => {
    vi.useFakeTimers()
    try {
      let releaseDetail: () => void = () => undefined
      const gate = new Promise<void>((r) => (releaseDetail = r))
      const real = vi.mocked(fetchWorkDetail).getMockImplementation()!
      vi.mocked(fetchWorkDetail).mockImplementationOnce(async (...args) => {
        await gate
        return real(...args)
      })
      render(<WorkDetail readOnly token="t" work={work} cover={null} onClose={() => undefined} />)
      // 中身を待つ上限が過ぎたあと、書体の待ち（次のタイマー）も進める
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })
      // 待つのをやめて、届いた分（手元の項目）だけで出している。まだ届いていない部分を名前で知らせる
      expect(document.querySelector('.detail--ready')).not.toBeNull()
      expect(screen.getByText('あらすじ・制作会社・スタッフ・声優を読み込み中')).toBeTruthy()
      releaseDetail()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(screen.getByText('2023年秋 TV 12話')).toBeTruthy()
      expect(screen.queryByText(/を読み込み中/)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
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

  it('opens a related work over this sheet in the app (not on Annict); Escape closes only the top sheet', async () => {
    const seriesWork = (annictId: number, title: string) => ({ id: `W${annictId}`, annictId, title, seasonYear: 2024, seasonName: 'SPRING', media: 'TV', malAnimeId: null, viewerStatusState: null, summary: null })
    vi.mocked(fetchWorkDetail).mockImplementationOnce(async () => ({
      ...work,
      titleKana: null,
      episodesCount: 12,
      officialSiteUrl: null,
      wikipediaUrl: null,
      twitterUsername: null,
      copyright: null,
      casts: [],
      staffs: [],
      series: [{ name: 'S', works: [seriesWork(1, '作品'), seriesWork(2, '続編')] }],
    }))
    const onClose = vi.fn()
    render(<WorkDetail token="t" work={work} cover={null} enqueue={queue().enqueue} onChange={() => undefined} onClose={onClose} />)
    fireEvent.click(await screen.findByRole('button', { name: '続編' }))
    expect(screen.getByRole('dialog', { name: '続編' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '作品' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '続編' })).toBeNull()
    expect(screen.getByRole('dialog', { name: '作品' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('in a read-only sheet, lets a related work be recorded through the screen’s queue and tells the screen', async () => {
    const seriesWork = (annictId: number, title: string) => ({ id: `W${annictId}`, annictId, title, seasonYear: 2024, seasonName: 'SPRING', media: 'TV', malAnimeId: String(annictId + 100), viewerStatusState: null, summary: null })
    vi.mocked(fetchWorkDetail).mockImplementationOnce(async () => ({
      ...work,
      titleKana: null,
      episodesCount: 12,
      officialSiteUrl: null,
      wikipediaUrl: null,
      twitterUsername: null,
      copyright: null,
      casts: [],
      staffs: [],
      series: [{ name: 'S', works: [seriesWork(1, '作品'), seriesWork(2, '続編')] }],
    }))
    const q = queue()
    const enqueue = vi.fn(q.enqueue)
    const onRelatedChange = vi.fn()
    render(<WorkDetail readOnly token="t" work={work} cover={null} relatedEnqueue={enqueue} onRelatedChange={onRelatedChange} onClose={() => undefined} />)
    // 読むだけのシートに説明の文は出さない（消し忘れのメモに見えた。2026-10-04 利用者）
    expect(screen.queryByText(/画面の下のボタン/)).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: '続編' }))
    const sheet = screen.getByRole('dialog', { name: '続編' })
    // 関連作品のシートでは状態を付けられる（説明の1行は出さない）
    fireEvent.click(within(sheet).getByRole('button', { name: '見たい' }))
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(onRelatedChange).toHaveBeenCalledWith({ annictId: 2, malAnimeId: '102' }, { state: 'WANNA_WATCH' })
    await q.done()
    expect(calls).toContain('status W2 WANNA_WATCH')
    // 閉じると、元のシートの関連作品の印に映っている
    fireEvent.keyDown(window, { key: 'Escape' })
    const parent = screen.getByRole('dialog', { name: '作品' })
    expect(within(parent).getByRole('button', { name: '続編' }).closest('li')?.textContent).toContain('見たい')
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
    await waitFor(() => expect(within(screen.getByRole('group', { name: '評価' })).getByRole('button', { name: '良い' }).getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(within(screen.getByRole('group', { name: '評価' })).getByRole('button', { name: 'とても良い' }))
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
