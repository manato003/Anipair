// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyReview } from '../../lib/annict'

const cached: MyReview = {
  id: 'R1',
  body: '控えの本文',
  createdAt: '2026-10-01T00:00:00Z',
  ratingOverallState: 'GOOD',
  ratingStoryState: null,
  ratingAnimationState: null,
  ratingMusicState: null,
  ratingCharacterState: null,
}
let onAnnict: MyReview | null = null
const saved: unknown[] = []

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchReview: vi.fn(async () => onAnnict),
}))
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(async () => new Map([[5, cached]])),
  rememberReview: vi.fn(async () => undefined),
}))
vi.mock('../../lib/reviewOps', async (orig) => ({
  ...(await orig<typeof import('../../lib/reviewOps')>()),
  saveReview: vi.fn(async (_t: string, workId: string, _c: unknown, next: unknown) => {
    saved.push({ workId, next })
    return null
  }),
}))

const { ReviewEditor } = await import('./ReviewEditor')

// 書き込みの列: 頼まれた仕事をすぐ実行する
const tasks: Promise<void>[] = []
const enqueue = (_label: string, task: () => Promise<void>) => void tasks.push(task())

beforeEach(() => {
  localStorage.clear()
  saved.length = 0
  tasks.length = 0
  onAnnict = { ...cached, body: 'Annict で書き直した本文', ratingMusicState: 'GREAT' }
})

afterEach(() => cleanup())

const open = async () => {
  render(<ReviewEditor token="t" workId="W5" annictId={5} title="作品5" overall="GOOD" enqueue={enqueue} />)
  fireEvent.click(screen.getByRole('button', { name: '項目別の評価と感想を書く' }))
  return (await screen.findByRole('textbox')) as HTMLTextAreaElement
}

describe('ReviewEditor', () => {
  it('is folded at first, and shows the latest review read again from Annict when opened', async () => {
    const box = await open()
    expect(box.value).toBe('Annict で書き直した本文')
    const music = screen.getByRole('group', { name: '音楽' })
    expect(music.querySelector('[aria-pressed="true"]')?.textContent).toBe('とても良い')
    expect(screen.getByText(/Annict の作品ページなどで公開されます/)).toBeTruthy()
  })

  it('saves the four axes and the body with the current overall rating', async () => {
    await open()
    fireEvent.click(screen.getByRole('group', { name: 'ストーリー' }).querySelector('button:nth-child(4)')!)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '最高だった' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await Promise.all(tasks)
    expect(saved).toEqual([
      {
        workId: 'W5',
        next: {
          axes: { ratingOverallState: 'GOOD', ratingStoryState: 'GREAT', ratingAnimationState: null, ratingMusicState: 'GREAT', ratingCharacterState: null },
          body: '最高だった',
        },
      },
    ])
    expect(screen.getByText('保存しました')).toBeTruthy()
    expect(localStorage.getItem('animax.reviewDrafts.v1')).toBe('{}')
  })

  it('keeps unsaved input as a draft, shows it next time, and can throw it away', async () => {
    const box = await open()
    fireEvent.change(box, { target: { value: '書きかけ' } })
    cleanup()
    const again = await open()
    expect(again.value).toBe('書きかけ')
    fireEvent.click(screen.getByRole('button', { name: '下書きを捨てる' }))
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Annict で書き直した本文'))
  })
})
