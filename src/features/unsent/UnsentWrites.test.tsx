// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalEntry, WriteIntent } from '../../lib/writeJournal'

const sent: string[] = []
let failNext = false
vi.mock('./reconcile', () => ({
  reconcileIntent: vi.fn(async (_t: string, intent: WriteIntent) => {
    if (failNext) {
      failNext = false
      throw new Error('Annict のサーバーが混み合っているか、止まっているようです（HTTP 502）')
    }
    sent.push(`${intent.kind}:${'workId' in intent ? intent.workId : ''}`)
  }),
}))

const { UnsentWrites } = await import('./UnsentWrites')
const { journalPut } = await import('../../lib/writeJournal')

const KEY = 'animax.writeJournal.v1'
const journalKeys = () => (JSON.parse(localStorage.getItem(KEY) ?? '{"entries":[]}').entries as JournalEntry[]).map((e) => e.key)

// 前回開いたときに残った控え。W1 は状態と評価を1回の操作で頼んだ（1件と数える）
function leftFromLastVisit() {
  const at = new Date(2026, 9, 6, 14, 20).getTime()
  const entries: JournalEntry[] = [
    { key: 'status:W1', label: '「作品1」の評価', intent: { kind: 'status', workId: 'W1', state: 'WATCHED' }, at, seq: 1, session: 'last' },
    { key: 'rating:W1', label: '「作品1」の評価', intent: { kind: 'rating', workId: 'W1', annictId: 1, rating: 'GOOD' }, at, seq: 1, session: 'last' },
    { key: 'status:W2', label: '「作品2」の状態', intent: { kind: 'status', workId: 'W2', state: 'WANNA_WATCH' }, at: at + 1000, seq: 2, session: 'last' },
  ]
  localStorage.setItem(KEY, JSON.stringify({ v: 1, entries }))
}

beforeEach(() => {
  sent.length = 0
  failNext = false
  localStorage.clear()
})
afterEach(cleanup)

describe('UnsentWrites', () => {
  it('says nothing when nothing was left', () => {
    const { container } = render(<UnsentWrites token="t" />)
    expect(container.textContent).toBe('')
  })

  it('tells how many actions were left and when, and sends them in order when asked', async () => {
    leftFromLastVisit()
    render(<UnsentWrites token="t" />)
    expect(screen.getByText(/前回（10\/6 14:20〜）送れなかった記録が2件あります/)).toBeTruthy()
    expect(screen.getByText('「作品2」の状態')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    await waitFor(() => expect(sent).toEqual(['status:W1', 'rating:W1', 'status:W2']))
    await waitFor(() => expect(screen.queryByRole('button', { name: '送る' })).toBeNull())
    expect(journalKeys()).toEqual([])
  })

  it('does not send a wish that was asked again since opening (the newer one wins)', async () => {
    leftFromLastVisit()
    render(<UnsentWrites token="t" />)
    act(() => void journalPut('今回の操作', [{ kind: 'status', workId: 'W2', state: 'WATCHED' }]))
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    await waitFor(() => expect(sent).toEqual(['status:W1', 'rating:W1']))
  })

  it('forgets them when told not to send', () => {
    leftFromLastVisit()
    render(<UnsentWrites token="t" />)
    fireEvent.click(screen.getByRole('button', { name: '送らない' }))
    expect(journalKeys()).toEqual([])
    expect(screen.queryByRole('button', { name: '送る' })).toBeNull()
  })

  it('keeps what failed, with a way to try again', async () => {
    leftFromLastVisit()
    failNext = true
    render(<UnsentWrites token="t" />)
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(await screen.findByText(/1件を送れませんでした/)).toBeTruthy()
    expect(journalKeys()).toEqual(['status:W1', 'rating:W1'])
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }))
    await waitFor(() => expect(sent).toEqual(['status:W2', 'status:W1', 'rating:W1']))
  })
})
