// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { browseWorks, type BrowseWork } from '../../lib/annict'
import { createPickedTable } from './tierList'
import { TierPick } from './TierPick'

function w(annictId: number): BrowseWork {
  return { id: `W${annictId}`, annictId, title: `作品${annictId}`, media: 'TV', seasonYear: 2026, seasonName: 'SUMMER', malAnimeId: String(100 + annictId), watchersCount: 10, viewerStatusState: null }
}

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  browseWorks: vi.fn(),
}))
vi.mock('../../lib/covers', async (orig) => ({ ...(await orig<typeof import('../../lib/covers')>()), fetchCovers: vi.fn(async () => new Map()) }))

afterEach(async () => {
  cleanup()
  vi.mocked(browseWorks).mockReset()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

const table = createPickedTable({ id: 't1', title: '表' })

describe('TierPick の読み込みの失敗', () => {
  it('「もう一度」で読めたら失敗の文を消し、読み直しのあいだは「読み込み中」を出す', async () => {
    let finish: ((page: { works: BrowseWork[]; endCursor: string | null; hasNext: boolean }) => void) | null = null
    vi.mocked(browseWorks)
      .mockRejectedValueOnce(new Error('通信できませんでした'))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    render(<TierPick token="t" rows={[]} table={table} active onChange={() => {}} onClose={() => {}} />)
    await screen.findByText(/作品を読み込めませんでした/)
    fireEvent.click(screen.getByText('もう一度'))
    await waitFor(() => expect(screen.queryByText(/作品を読み込めませんでした/)).toBeNull())
    expect(screen.getByText('読み込み中')).toBeTruthy()
    finish!({ works: [w(1)], endCursor: null, hasNext: false })
    await screen.findByText('作品1')
    expect(screen.queryByText(/作品を読み込めませんでした/)).toBeNull()
  })
})
