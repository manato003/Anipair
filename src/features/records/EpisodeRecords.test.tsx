// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Episode, WorkEpisodes } from '../../lib/annict'
import { EpisodeRecorder } from './EpisodeRecords'

afterEach(async () => {
  cleanup()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

const ep = (n: number, tracked = false): Episode => ({ id: `E${n}`, annictId: n, number: n, numberText: `#${n}`, title: `題${n}`, viewerDidTrack: tracked, viewerRecordsCount: tracked ? 1 : 0 })
const data = (episodes: Episode[]): WorkEpisodes => ({ workId: 'W1', noEpisodes: false, episodes })

function recorder(d: WorkEpisodes | undefined, opts: { watching?: boolean; undoable?: string[]; error?: string | null } = {}) {
  const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn() }
  const view = render(
    <EpisodeRecorder data={d} error={opts.error ?? null} watching={opts.watching ?? true} undoable={new Set(opts.undoable ?? [])} active {...h} />,
  )
  return { h, view }
}

// 4段階のボタンの段（いつも同じ要素。押すと次の話に切り替わる）
const ratings = () => document.querySelector('.ep__box .mini-ratings') as HTMLElement
const current = () => document.querySelector('.ep__current strong')?.textContent

describe('EpisodeRecorder', () => {
  it('starts at the next episode and, after rating it, moves to the following one in the same place', () => {
    const { h, view } = recorder(data([ep(1, true), ep(2), ep(3)]))
    expect(current()).toBe('#2')
    const before = ratings()
    fireEvent.click(within(before).getByRole('button', { name: '良い' }))
    expect(h.onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'E2' }), 'GOOD')
    // 同じ位置のまま、次の話（#3）のボタンになる
    expect(current()).toBe('#3')
    expect(ratings().getAttribute('aria-label')).toBe('#3の評価')
    expect(screen.getByText('#2を「良い」で記録しました')).toBeTruthy()
    view.unmount()
  })

  it('undo goes back to the episode it recorded', () => {
    const { h } = recorder(data([ep(1), ep(2)]), { undoable: ['E1'] })
    fireEvent.click(within(ratings()).getByRole('button', { name: '普通' }))
    expect(current()).toBe('#2')
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }))
    expect(h.onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }))
    expect(current()).toBe('#1')
  })

  it('arrows choose another episode; a finished watched work starts again from the first one', () => {
    recorder(data([ep(1, true), ep(2, true), ep(3, true)]), { watching: false })
    expect(current()).toBe('#1')
    expect(screen.getByText('記録済み')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '次の話' }))
    expect(current()).toBe('#2')
    fireEvent.click(screen.getByRole('button', { name: '前の話' }))
    expect(current()).toBe('#1')
    expect((screen.getByRole('button', { name: '前の話' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('after the last episode of a watching work, offers to rate the work and mark it watched', () => {
    const { h } = recorder(data([ep(1, true), ep(2)]), { watching: true })
    fireEvent.click(within(ratings()).getByRole('button', { name: 'とても良い' }))
    expect(current()).toBe('最終話まで記録しました')
    expect(ratings().getAttribute('aria-label')).toBe('作品の評価')
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    expect(h.onFinish).toHaveBeenCalledWith('GOOD')
  })

  it('picking an episode in the list selects it in the recorder', () => {
    recorder(data([ep(1), ep(2), ep(3)]))
    fireEvent.click(screen.getByRole('button', { name: /話の一覧を開く/ }))
    const sheet = screen.getByRole('dialog', { name: '話の一覧' })
    fireEvent.click(within(sheet).getByRole('button', { name: /#3/ }))
    expect(screen.queryByRole('dialog', { name: '話の一覧' })).toBeNull()
    expect(current()).toBe('#3')
  })

  it('shows loading, missing episode info, and a read error with retry', () => {
    recorder(undefined)
    expect(screen.getByText('話を読んでいます')).toBeTruthy()
    cleanup()
    recorder({ workId: 'W1', noEpisodes: true, episodes: [] })
    expect(screen.getByText('この作品には話の情報がありません。')).toBeTruthy()
    cleanup()
    const { h } = recorder(undefined, { error: 'offline' })
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }))
    expect(h.onRetry).toHaveBeenCalled()
  })
})
