// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, RatingState } from '../../lib/annict'
import type { GithubConnection } from '../../lib/github'
import type { RecordRow } from '../records/recordList'
import { createTable } from './tierList'
import { loadLocalTiers, saveTable } from './tierStore'
import { TierView } from './TierView'

// 開いたときの同期を、テストの中で終わらせる
let finishSync: (() => void) | null = null
let failSync: ((e: Error) => void) | null = null
vi.mock('./tierStore', async (importActual) => {
  const actual = await importActual<typeof import('./tierStore')>()
  return {
    ...actual,
    syncTiers: vi.fn(
      () =>
        new Promise((resolve, reject) => {
          finishSync = () => resolve(actual.loadLocalTiers())
          failSync = reject
        }),
    ),
  }
})
vi.mock('../../lib/covers', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/covers')>()),
  fetchCovers: vi.fn(async () => new Map()),
}))

function row(id: number, rating: RatingState): RecordRow {
  const entry: LibraryEntry = { workId: `W${id}`, annictId: id, title: `作品${id}`, malAnimeId: String(id + 1000), state: 'WATCHED', stateAt: '2026-09-01T00:00:00Z', seasonYear: 2026, seasonName: 'AUTUMN' }
  const review = { id: `R${id}`, body: '', createdAt: '', ratingOverallState: rating, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
  return { entry, review, cover: null }
}

const OLD = '2026-10-01T00:00:00.000Z'
const github: GithubConnection = { token: 'g', repo: 'me/notes' }
const enqueue = (_label: string, task: () => Promise<void>) => void task().catch(() => {})

// 端末の控えには作品1だけを置いた表がある。そのあと作品2を評価した（表に無い）
beforeEach(() => {
  localStorage.clear()
  finishSync = null
  failSync = null
  saveTable(createTable([row(1, 'GREAT')], { id: 't1', title: '表', scope: { kind: 'all' }, includeDropped: false, count: 4 }, new Date(OLD)))
})
afterEach(() => cleanup())

const rows = [row(1, 'GREAT'), row(2, 'GOOD')]
const storedItems = () => loadLocalTiers().tables[0].tiers.flatMap((x) => x.items)

describe('TierView の開いたときの自動の配置', () => {
  it('GitHub とつないでいるときは、開いたときの同期が済むまで自動で置いた結果を保存しない（古い控えが新しい方として勝たない）', async () => {
    render(<TierView token="t" rows={rows} github={github} enqueue={enqueue} active onOpen={() => {}} />)
    await waitFor(() => expect(finishSync).not.toBeNull())
    expect(loadLocalTiers().tables[0].updatedAt).toBe(OLD)
    expect(storedItems()).toEqual([1])
    await act(async () => finishSync!())
    await waitFor(() => expect(storedItems()).toEqual([1, 2]))
    expect(loadLocalTiers().tables[0].updatedAt).not.toBe(OLD)
  })

  it('同期に失敗しても、そのあとは保存する', async () => {
    render(<TierView token="t" rows={rows} github={github} enqueue={enqueue} active onOpen={() => {}} />)
    await waitFor(() => expect(failSync).not.toBeNull())
    expect(storedItems()).toEqual([1])
    await act(async () => failSync!(new Error('network')))
    await waitFor(() => expect(storedItems()).toEqual([1, 2]))
  })

  it('GitHub とつないでいなければ、開いてすぐ保存する', async () => {
    render(<TierView token="t" rows={rows} github={null} enqueue={enqueue} active onOpen={() => {}} />)
    await waitFor(() => expect(storedItems()).toEqual([1, 2]))
  })
})

describe('TierView の表の設定', () => {
  it('題名を打ったまま Esc で閉じても、打った題名を保存する', async () => {
    render(<TierView token="t" rows={rows} github={null} enqueue={enqueue} active onOpen={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '表の設定' }))
    const title = screen.getByLabelText('題名') as HTMLInputElement
    title.focus()
    fireEvent.change(title, { target: { value: '新しい題名' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('題名')).toBeNull())
    expect(loadLocalTiers().tables[0].title).toBe('新しい題名')
  })
})
