// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkReviews } from '../../lib/annict'
import { CommunityReviews } from './CommunityReviews'

const { fetchWorkReviews } = vi.hoisted(() => ({ fetchWorkReviews: vi.fn() }))
vi.mock('../../lib/annict', async (orig) => ({ ...(await orig<typeof import('../../lib/annict')>()), fetchWorkReviews }))

afterEach(() => {
  cleanup()
  fetchWorkReviews.mockReset()
})

const LONG = 'すごく良かった。'.repeat(30)

function reviews(over: Partial<WorkReviews> = {}): WorkReviews {
  return {
    satisfactionRate: 96.55,
    reviewsCount: 140,
    reviews: [
      { annictId: 1, body: LONG, createdAt: '2026-01-01T00:00:00Z', likesCount: 8, rating: 'GREAT', user: { username: 'alice', name: 'アリス' } },
      { annictId: 2, body: '短い感想', createdAt: '2026-01-02T00:00:00Z', likesCount: 0, rating: null, user: { username: 'bob', name: '' } },
    ],
    ...over,
  }
}

describe('CommunityReviews', () => {
  it('shows the satisfaction and the count to everyone, and hides the bodies of an unwatched work until asked (spoilers)', async () => {
    fetchWorkReviews.mockResolvedValue(reviews())
    render(<CommunityReviews token="t" workId="W1" annictId={11} watched={false} />)
    expect(await screen.findByText('みんなの感想')).toBeTruthy()
    expect(fetchWorkReviews).toHaveBeenCalledWith('t', 'W1')
    expect(document.querySelector('.community__summary')?.textContent).toBe('満足度 97%感想 140件')
    expect(screen.queryByText('短い感想')).toBeNull()
    expect(screen.getByText('ネタバレを含むことがあります')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '感想を読む' }))
    expect(screen.getByText('短い感想')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Annict で感想をすべて読む' }).getAttribute('href')).toBe('https://annict.com/works/11/records')
  })

  it('opens the bodies of a watched work, credits each writer with a link, and folds long ones', async () => {
    fetchWorkReviews.mockResolvedValue(reviews())
    render(<CommunityReviews token="t" workId="W1" annictId={11} watched />)
    expect(await screen.findByText('短い感想')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'アリス' }).getAttribute('href')).toBe('https://annict.com/@alice')
    // 名前の無い人は、ユーザー名で
    expect(screen.getByRole('link', { name: 'bob' })).toBeTruthy()
    expect(screen.getByText('とても良い')).toBeTruthy()
    expect(screen.getByText('いいね 8')).toBeTruthy()
    const body = screen.getByText(LONG)
    expect(body.className).toContain('community__body--folded')
    fireEvent.click(screen.getByRole('button', { name: '全文を読む' }))
    expect(body.className).not.toContain('community__body--folded')
  })

  it('says there are no reviews yet, and shows nothing when Annict cannot be read', async () => {
    fetchWorkReviews.mockResolvedValue({ satisfactionRate: null, reviewsCount: 0, reviews: [] })
    render(<CommunityReviews token="t" workId="W1" annictId={11} watched={false} />)
    expect(await screen.findByText('まだ Annict に感想がありません。')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Annict で感想をすべて読む' })).toBeNull()
    cleanup()
    fetchWorkReviews.mockRejectedValue(new Error('down'))
    const { container } = render(<CommunityReviews token="t" workId="W2" annictId={12} watched={false} />)
    await vi.waitFor(() => expect(container.querySelector('.near-probe')).toBeNull())
    expect(container.textContent).toBe('')
  })
})
