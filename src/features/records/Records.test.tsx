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

const titles = () => [...document.querySelectorAll('.row__title')].map((e) => e.textContent)
const openWanna = () => fireEvent.click(screen.getByRole('tab', { name: /見たい/ }))

describe('Records: the list it opens on', () => {
  it('opens on 見てる (the usual errand: recording this cour’s episodes), first in the row of tabs', () => {
    rows.push(row(entry(9, 'WATCHING', '2026-10-01T00:00:00Z')))
    try {
      render(<Records token="t" active />)
      const tabs = within(screen.getByRole('tablist', { name: '状態' })).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))
      expect(tabs.slice(0, 2)).toEqual(['見てる', '見た'])
      expect(screen.getByRole('tab', { name: /^見てる/ }).getAttribute('aria-selected')).toBe('true')
      expect(titles()).toEqual(['作品9'])
    } finally {
      rows.pop()
    }
  })

  it('opens on 見た when nothing is being watched', () => {
    render(<Records token="t" active />)
    expect(screen.getByRole('tab', { name: /^見た\d/ }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('Records: 見たいの優先とメモ', () => {
  it('puts a work marked 優先 at the top, and keeps a memo written in the sheet', () => {
    localStorage.removeItem('animax.wannaNotes.v1')
    render(<Records token="t" active />)
    openWanna()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
    const third = document.querySelectorAll('.row')[2] as HTMLElement
    fireEvent.click(within(third).getByRole('button', { name: '☆ 優先' }))
    expect(titles()).toEqual(['作品3', '作品1', '作品2'])
    // メモを書く
    const first = document.querySelectorAll('.row')[1] as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: 'メモ' }))
    const sheet = screen.getByRole('dialog', { name: '見たいのメモ' })
    fireEvent.change(within(sheet).getByRole('textbox'), { target: { value: '友達のおすすめ' } })
    fireEvent.click(within(sheet).getByRole('button', { name: '保存' }))
    expect(screen.getByRole('button', { name: '友達のおすすめ' })).toBeTruthy()
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

describe('Records: 傾向', () => {
  it('opens the trends sheet with the summary and the charts, reading work data in the background, and closes', async () => {
    render(<Records token="t" active />)
    fireEvent.click(screen.getByRole('button', { name: '傾向' }))
    // 傾向は別のファイルから読む（読み終えるのを待つ）
    const sheet = await screen.findByRole('dialog', { name: '好みの傾向' })
    expect(within(sheet).getByText('あなたのアニメの傾向')).toBeTruthy()
    expect(within(sheet).getByText('見たい')).toBeTruthy()
    expect(within(sheet).getByText('評価の分布')).toBeTruthy()
    await waitFor(() => expect(fetchMediaMock).toHaveBeenCalled())
    expect(fetchCreditsMock).toHaveBeenCalled()
    fireEvent.click(within(sheet).getAllByRole('button', { name: '閉じる' })[0])
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Records and achievements switch', () => {
  it('switches between the records and the achievements, and marks the achievements until they are first opened', async () => {
    render(<Records token="t" active />)
    const tab = screen.getByRole('tab', { name: /実績/ })
    expect(screen.getByLabelText('まだ見ていません')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /記録/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(tab)
    expect(tab.getAttribute('aria-selected')).toBe('true')
    // 実績は別のファイルから読む（読み終えるのを待つ）
    expect(await screen.findByTestId('achievements')).toBeTruthy()
    expect(screen.queryByLabelText('まだ見ていません')).toBeNull()
    // 実績では、記録の操作（傾向・編集）は出さない
    expect(screen.queryByRole('button', { name: '傾向' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /記録/ }))
    expect(screen.queryByTestId('achievements')).toBeNull()
    expect(screen.getByRole('button', { name: '傾向' })).toBeTruthy()
    cleanup()

    // 覚醒を見たあとは点を付けない
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: [], awakened: true }))
    render(<Records token="t" active />)
    expect(screen.queryByLabelText('まだ見ていません')).toBeNull()
    localStorage.clear()
  })
})

