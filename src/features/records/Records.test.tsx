// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

describe('Records: 見たい sort', () => {
  it('starts in newest-first order and asks for no taste until おすすめ順 is chosen', () => {
    render(<Records token="t" active />)
    openWanna()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
    expect(enabledLog.every((e) => !e)).toBe(true)
    expect(screen.getByRole('button', { name: '新しい順' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('おすすめ順 orders by score, keeps every work, puts unscored ones last, and shows the first reason', () => {
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: 'おすすめ順' }))
    expect(titles()).toEqual(['作品2', '作品1', '作品3'])
    expect(screen.getByText('好きなジャンル: 音楽')).toBeTruthy()
    // 新しい順に戻せる
    fireEvent.click(screen.getByRole('button', { name: '新しい順' }))
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
  })

  it('shows 好みを調べています while loading, with the list still in newest-first order', () => {
    tasteState = { status: 'loading' }
    scoreMap = null
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: 'おすすめ順' }))
    expect(screen.getByText('好みを調べています')).toBeTruthy()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
  })

  it('shows the error with もう一度, and keeps the list usable in newest-first order', () => {
    tasteState = { status: 'error', message: 'offline' }
    scoreMap = null
    render(<Records token="t" active />)
    openWanna()
    fireEvent.click(screen.getByRole('button', { name: 'おすすめ順' }))
    expect(screen.getByText(/好みを調べられませんでした（offline）/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'もう一度' })).toBeTruthy()
    expect(titles()).toEqual(['作品1', '作品2', '作品3'])
  })

  it('does not offer the toggle outside the 見たい list', () => {
    render(<Records token="t" active />)
    expect(screen.queryByRole('button', { name: 'おすすめ順' })).toBeNull()
  })
})

describe('Records: 傾向', () => {
  it('opens a read-only sheet with the rating distribution and the liked and disliked features', () => {
    scoreMap = null
    render(<Records token="t" active />)
    fireEvent.click(screen.getByRole('button', { name: '傾向' }))
    const sheet = screen.getByRole('dialog', { name: '好みの傾向' })
    expect(within(sheet).getByText('評価 1 件から計算しています。')).toBeTruthy()
    expect(within(sheet).getByText('見た（評価なし）')).toBeTruthy()
    expect(within(sheet).getByText('ファンタジー')).toBeTruthy()
    expect(within(sheet).getByText('異世界')).toBeTruthy()
    expect(within(sheet).getByText('Bones')).toBeTruthy()
    expect(within(sheet).getByText('苦手なジャンル')).toBeTruthy()
    expect(within(sheet).getByText('ホラー')).toBeTruthy()
    // 好きな作品が10件に満たないときの注意
    expect(within(sheet).getByText(/好きな作品の記録がまだ1件/)).toBeTruthy()
    fireEvent.click(within(sheet).getAllByRole('button', { name: '閉じる' })[0])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves out the disliked section when nothing is disliked', () => {
    tasteState = { status: 'ready', taste: { ...taste, profile: new Map([['g:Fantasy', 0.9]]) } }
    render(<Records token="t" active />)
    fireEvent.click(screen.getByRole('button', { name: '傾向' }))
    expect(screen.queryByText('苦手なジャンル')).toBeNull()
  })

  it('shows loading, and the error with a retry', () => {
    tasteState = { status: 'error', message: 'offline' }
    render(<Records token="t" active />)
    fireEvent.click(screen.getByRole('button', { name: '傾向' }))
    expect(screen.getByText('offline')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'もう一度' })).toBeTruthy()
  })
})
