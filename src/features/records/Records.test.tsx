// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry } from '../../lib/annict'
import type { Taste } from '../match/tasteLoader'
import type { RecordRow } from './recordList'
import type { TasteState } from './useTaste'
import type { WannaScore } from './wannaRank'

const entry = (annictId: number, state: LibraryEntry['state'], stateAt: string): LibraryEntry => ({
  workId: `W${annictId}`,
  annictId,
  title: `作品${annictId}`,
  malAnimeId: String(100 + annictId),
  state,
  stateAt,
})
const row = (e: LibraryEntry): RecordRow => ({ entry: e, review: null, cover: null })

// 見たいは新しい順に 1（新）→ 2 → 3（古）。3 は Shikimori に情報が無い
const rows = [
  row(entry(1, 'WANNA_WATCH', '2026-09-03T00:00:00Z')),
  row(entry(2, 'WANNA_WATCH', '2026-09-02T00:00:00Z')),
  row(entry(3, 'WANNA_WATCH', '2026-09-01T00:00:00Z')),
  row({ ...entry(4, 'WATCHED', '2026-08-01T00:00:00Z') }),
]

vi.mock('./useRecords', () => ({
  useRecords: () => ({
    rows,
    loadError: null,
    reload: vi.fn(),
    pending: 0,
    failed: [],
    enqueue: vi.fn(),
    retryFailed: vi.fn(),
    dismissFailed: vi.fn(),
    setRating: vi.fn(),
    setState: vi.fn(),
    patchRecord: vi.fn(),
  }),
}))

const taste: Taste = {
  library: [entry(4, 'WATCHED', '2026-08-01T00:00:00Z'), entry(5, 'WATCHED', '2026-08-02T00:00:00Z')],
  ratings: new Map([[4, 'GREAT']]),
  seeds: [{ malId: 104, title: '好き', weight: 2 }],
  topSeeds: [],
  seedMedia: new Map(),
  similarSeeds: [],
  similar: new Map(),
  profile: new Map([
    ['g:Fantasy', 0.9],
    ['t:Isekai', 0.5],
    ['s:Bones', 0.7],
    ['g:Horror', -0.6],
  ]),
}
let tasteState: TasteState = { status: 'ready', taste }
const defaultScores = () =>
  new Map<number, WannaScore>([
    [102, { score: 2, reason: '好きなジャンル: 音楽' }],
    [101, { score: 1, reason: null }],
  ])
let scoreMap: Map<number, WannaScore> | null = defaultScores()
let scoreError: string | null = null
const enabledLog: boolean[] = []

vi.mock('./useTaste', () => ({
  useTaste: (_t: string, enabled: boolean) => {
    enabledLog.push(enabled)
    return { state: enabled ? tasteState : { status: 'idle' }, retry: vi.fn() }
  },
  useWannaScores: () => ({ scores: scoreMap, error: scoreError, retry: vi.fn() }),
}))
vi.mock('../browse/WorkDetail', () => ({ WorkDetail: () => null }))
// 絞り込みのシートで読む作品の情報（ネットワークに出さない）
vi.mock('./useMediaInfo', () => ({ useMediaInfo: () => ({ info: new Map(), error: null }) }))
// 見てるの話の一覧（ネットワークに出さない）
vi.mock('./useEpisodes', () => ({
  useEpisodes: () => ({ byWork: new Map(), errors: new Map(), undoable: new Set(), record: vi.fn(), undo: vi.fn(), retry: vi.fn() }),
}))
// 実績の中身は achievements のテストで見る。ここでは切り替えだけ
// 傾向のシートが裏で読む作品の情報と声優・監督（ネットワークに出さない）
const fetchMediaMock = vi.fn(async () => new Map())
const fetchCreditsMock = vi.fn(async () => new Map())
vi.mock('../../lib/shikimori', async (orig) => ({ ...(await orig<typeof import('../../lib/shikimori')>()), fetchMedia: () => fetchMediaMock() }))
vi.mock('../../lib/annict', async (orig) => ({ ...(await orig<typeof import('../../lib/annict')>()), fetchCredits: () => fetchCreditsMock() }))
vi.mock('../achievements/Achievements', () => ({ Achievements: () => <div data-testid="achievements" /> }))

const { Records } = await import('./Records')

afterEach(() => {
  cleanup()
  tasteState = { status: 'ready', taste }
  scoreMap = defaultScores()
  scoreError = null
  enabledLog.length = 0
})

// 棚・見てるのカード・編集の行の題名（並び順）
const titles = () => [...document.querySelectorAll('.shelf__title, .watchcard__title, .row__title')].map((e) => e.textContent)
const openWanna = () => fireEvent.click(screen.getByRole('tab', { name: /見たい/ }))

describe('Records: the list it opens on', () => {
  it('opens on 見てる (the usual errand: recording this cour’s episodes), first in the row of tabs, with まとめ last', () => {
    rows.push(row(entry(9, 'WATCHING', '2026-10-01T00:00:00Z')))
    try {
      render(<Records token="t" active />)
      const tabs = within(screen.getByRole('tablist', { name: '記録の項目' })).getAllByRole('tab').map((t) => t.textContent)
      expect(tabs).toEqual(['見てる', '見た', '見たい', '視聴中断', 'まとめ'])
      expect(screen.getByRole('tab', { name: '見てる' }).getAttribute('aria-selected')).toBe('true')
      expect(titles()).toEqual(['作品9'])
    } finally {
      rows.pop()
    }
  })

  it('opens on 見た when nothing is being watched', () => {
    render(<Records token="t" active />)
    expect(screen.getByRole('tab', { name: '見た' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: /^見た/ }).textContent).toBe('見た1')
  })
})

describe('Records: 見たいの優先とメモ', () => {
  it('puts a work marked 優先 at the top, and keeps a memo written in the sheet (from 編集)', () => {
    localStorage.removeItem('animax.wannaNotes.v1')
    render(<Records token="t" active />)
    openWanna()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
    const third = document.querySelectorAll('.shelf__item')[2] as HTMLElement
    fireEvent.click(within(third).getByRole('button', { name: '作品3を優先して見る' }))
    expect(titles()).toEqual(['作品3', '作品1', '作品2'])
    // メモは編集の行で書く
    fireEvent.click(screen.getByRole('button', { name: '編集' }))
    const first = document.querySelectorAll('.row')[1] as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: 'メモ' }))
    const sheet = screen.getByRole('dialog', { name: '見たいのメモ' })
    fireEvent.change(within(sheet).getByRole('textbox'), { target: { value: '友達のおすすめ' } })
    fireEvent.click(within(sheet).getByRole('button', { name: '保存' }))
    expect(screen.getByRole('button', { name: '友達のおすすめ' })).toBeTruthy()
    // 棚に戻ると、メモは題名の下に出る
    fireEvent.click(screen.getByRole('button', { name: '完了' }))
    expect(document.querySelector('.shelf__memo')?.textContent).toBe('友達のおすすめ')
    expect(JSON.parse(localStorage.getItem('animax.wannaNotes.v1')!).notes['1'].memo).toBe('友達のおすすめ')
    // ほかのテストに残さない
    localStorage.removeItem('animax.wannaNotes.v1')
  })
})

describe('Records: 見たい sort', () => {
  it('starts in newest-recorded order and asks for no taste until おすすめ順 is chosen', () => {
    render(<Records token="t" active />)
    openWanna()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
    expect(enabledLog.every((e) => !e)).toBe(true)
    expect(screen.getByRole('button', { name: /^記録順/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Annict に記録した日の新しい順です。')).toBeTruthy()
  })

  it('pressing the chosen order again turns it around, and says so', () => {
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: /^記録順/ }))
    expect(titles()).toEqual(['作品3', '作品2', '作品1'])
    expect(screen.getByText('Annict に記録した日の古い順です。')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^記録順/ }).textContent).toContain('↑')
    // ほかの並べ替えを選ぶと、降順から始まる
    fireEvent.click(screen.getByRole('button', { name: /^放送日順/ }))
    expect(screen.getByRole('button', { name: /^放送日順/ }).textContent).toContain('↓')
  })

  it('おすすめ順 orders by score, keeps every work, puts unscored ones last, and shows the first reason', () => {
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: /^おすすめ順/ }))
    expect(titles()).toEqual(['作品2', '作品1', '作品3'])
    expect(screen.getByText('好きなジャンル: 音楽')).toBeTruthy()
    // 記録順に戻せる
    fireEvent.click(screen.getByRole('button', { name: /^記録順/ }))
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
  })

  it('shows 好みを分析しています while loading, with the list still in newest-first order', () => {
    tasteState = { status: 'loading' }
    scoreMap = null
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: /^おすすめ順/ }))
    expect(screen.getByText('好みを分析しています')).toBeTruthy()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
  })

  it('shows the error with もう一度, and keeps the list usable in newest-first order', () => {
    tasteState = { status: 'error', message: 'offline' }
    scoreMap = null
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: /^おすすめ順/ }))
    expect(screen.getByText(/好みを調べられませんでした（offline）/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'もう一度' })).toBeTruthy()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
  })

  it('does not offer the toggle outside the 見たい list', () => {
    render(<Records token="t" active />)
    expect(screen.queryByRole('button', { name: /^おすすめ順/ })).toBeNull()
  })
})

describe('Records: 絞り込み', () => {
  it('filters by rating from the sheet, shows the condition above the list, and clears it', () => {
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: /^絞り込み/ }))
    const sheet = screen.getByRole('dialog', { name: '絞り込み' })
    fireEvent.click(within(sheet).getByRole('button', { name: '評価なし' }))
    expect(within(sheet).getByRole('button', { name: '評価なし' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(sheet).getByRole('button', { name: /件を表示$/ }))
    expect(screen.queryByRole('dialog', { name: '絞り込み' })).toBeNull()
    expect(screen.getByRole('button', { name: /^絞り込み/ }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: '評価: 評価なし の条件を外す' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '評価: 評価なし の条件を外す' }))
    expect(screen.queryByRole('button', { name: '評価: 評価なし の条件を外す' })).toBeNull()
  })
})

describe('Records: 放送クールで絞り込む', () => {
  it('chooses a cour above the list (starting from すべて), hides the year range in the sheet, steps it, and goes back to すべて', () => {
    render(<Records token="t" active />)
    openWanna()
    const near = () => screen.getByRole('group', { name: '近いクール' })
    expect(within(near()).getByRole('button', { name: 'すべて' }).getAttribute('aria-pressed')).toBe('true')
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
    fireEvent.click(within(near()).getByRole('button', { name: '今期' }))
    expect(within(near()).getByRole('button', { name: '今期' }).getAttribute('aria-pressed')).toBe('true')
    // 試しの記録には放送時期が無いので、どのクールにも当てはまらない
    expect(titles()).toEqual([])
    expect(screen.getByText(/の作品は、ここにはありません/)).toBeTruthy()
    // クールを選んでいるあいだ、シートの放送年の範囲は出さない（シートの条件の数にも入れない）
    expect(screen.getByRole('button', { name: /^絞り込み/ }).textContent).not.toMatch(/\d/)
    fireEvent.click(screen.getByRole('button', { name: /^絞り込み/ }))
    const sheet = screen.getByRole('dialog', { name: '絞り込み' })
    expect(within(sheet).queryByRole('combobox', { name: '放送年（から）' })).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: /件を表示$/ }))
    fireEvent.click(screen.getByRole('button', { name: '前のクール' }))
    expect(within(near()).getByRole('button', { name: '前期' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'すべてのクールにする' }))
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
  })
})

describe('Records: まとめ', () => {
  it('opens 傾向 from the まとめ list, reading work data in the background, and goes back to the list', async () => {
    render(<Records token="t" active />)
    fireEvent.click(screen.getByRole('tab', { name: /まとめ/ }))
    fireEvent.click(screen.getByRole('button', { name: /^傾向/ }))
    // 傾向は別のファイルから読む（読み終えるのを待つ。全部のテストを一度に流すと、ファイルの変換が混んで1秒を超えることがある）
    expect(await screen.findByText('評価の分布', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '傾向' })).toBeTruthy()
    await waitFor(() => expect(fetchMediaMock).toHaveBeenCalled())
    expect(fetchCreditsMock).toHaveBeenCalled()
    // 「画像で共有」は見出しの右に出る
    expect(screen.getByRole('button', { name: '画像で共有' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'まとめ' }))
    expect(screen.getByRole('button', { name: /^ふり返り/ })).toBeTruthy()
  })
})

describe('Records: 実績', () => {
  it('marks まとめ and 実績 until the achievements are first opened', async () => {
    render(<Records token="t" active />)
    expect(screen.getAllByLabelText('まだ見ていません').length).toBe(1)
    fireEvent.click(screen.getByRole('tab', { name: /まとめ/ }))
    expect(screen.getAllByLabelText('まだ見ていません').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: /^実績/ }))
    // 実績は別のファイルから読む（読み終えるのを待つ）
    expect(await screen.findByTestId('achievements')).toBeTruthy()
    expect(screen.queryByLabelText('まだ見ていません')).toBeNull()
    // 実績では、記録の操作（編集・絞り込み）は出さない
    expect(screen.queryByRole('button', { name: '編集' })).toBeNull()
    cleanup()

    // 覚醒を見たあとは点を付けない
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: [], awakened: true }))
    render(<Records token="t" active />)
    expect(screen.queryByLabelText('まだ見ていません')).toBeNull()
    localStorage.clear()
  })
})
