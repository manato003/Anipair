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
  const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn() }
  const view = render(
    <EpisodeRecorder data={d} error={opts.error ?? null} watching={opts.watching ?? true} undoable={new Set(opts.undoable ?? [])} commented={new Set()} {...h} />,
  )
  return { h, view }
}

// 4段階のボタンの段（いつも同じ要素。押すと次の話に切り替わる）
const ratings = () => document.querySelector('.ep__box .mini-ratings') as HTMLElement
const current = () => document.querySelector('.ep__current strong')?.textContent

describe('EpisodeRecorder: a comment on an episode, only for those who want to write one', () => {
  afterEach(() => localStorage.clear())

  it('rating stays one tap; "感想を書く" appears after recording and opens a box under the recorder', () => {
    const { h } = recorder(data([ep(1), ep(2)]), { undoable: ['E1'] })
    const box = ratings()
    fireEvent.click(within(box).getByRole('button', { name: '良い' }))
    // 押した時点で記録済み。感想の欄は開かない（書かない人の手間は増やさない）
    expect(h.onRecord).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    // 評価のボタンの段は動かない（感想の欄は記録欄の外）
    expect(ratings()).toBe(box)
    const text = screen.getByRole('textbox', { name: '#1の感想' })
    fireEvent.change(text, { target: { value: '  良い引きだった ' } })
    // 書いている途中は端末に残す
    expect(JSON.parse(localStorage.getItem('animax.episodeDrafts.v1')!)).toEqual({ E1: '  良い引きだった ' })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(h.onComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'GOOD', '良い引きだった')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/#1を「良い」で記録・感想つき/)).toBeTruthy()
    expect(localStorage.getItem('animax.episodeDrafts.v1')).toBeNull()
  })

  it('keeps writing about the same episode while the next ones are recorded, and restores a draft', () => {
    localStorage.setItem('animax.episodeDrafts.v1', JSON.stringify({ E1: '書きかけ' }))
    const { h } = recorder(data([ep(1), ep(2), ep(3)]), { undoable: ['E1', 'E2'] })
    fireEvent.click(within(ratings()).getByRole('button', { name: '普通' }))
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    expect((screen.getByRole('textbox', { name: '#1の感想' }) as HTMLTextAreaElement).value).toBe('書きかけ')
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    expect(screen.getByRole('textbox', { name: '#1の感想' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(h.onComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'AVERAGE', '書きかけ')
  })

  it('shows "感想を書く" before rating too: write first, then the rating records both at once', () => {
    const { h } = recorder(data([ep(1), ep(2)]))
    // 評価の前から見える（記録のあとにだけ出していたら、見つけられなかった）
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    const text = screen.getByRole('textbox', { name: /#1の感想/ })
    expect(screen.getByText(/上の評価を押してください/)).toBeTruthy()
    // まだ記録していないので「保存」は無い。評価を押すと一緒に記録する
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    fireEvent.change(text, { target: { value: '神回' } })
    fireEvent.click(within(ratings()).getByRole('button', { name: 'とても良い' }))
    expect(h.onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'GREAT', '神回')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/#1を「とても良い」で記録・感想つき/)).toBeTruthy()
    expect(localStorage.getItem('animax.episodeDrafts.v1')).toBeNull()
  })

  it('offers no comment for a record it did not make here (after recording it, the button is gone)', () => {
    recorder(data([ep(1), ep(2)]))
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    expect(screen.queryByRole('button', { name: '感想を書く' })).toBeNull()
  })
})

describe('EpisodeRecorder', () => {
  it('starts at the next episode and, after rating it, moves to the following one in the same place', () => {
    const { h, view } = recorder(data([ep(1, true), ep(2), ep(3)]))
    expect(current()).toBe('#2')
    const before = ratings()
    fireEvent.click(within(before).getByRole('button', { name: '良い' }))
    expect(h.onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'E2' }), 'GOOD', undefined)
    // 同じ位置のまま、次の話（#3）のボタンになる
    expect(current()).toBe('#3')
    expect(ratings().getAttribute('aria-label')).toBe('#3の評価')
    expect(screen.getByText('#2を「良い」で記録')).toBeTruthy()
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

  // 2026-10-06 の点検: 記録すると話の中身が新しいものに差し替わり、取り消すと第1話に飛んでいた
  it('undo goes back to the episode it recorded, after the list was updated by the record', () => {
    const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn() }
    const props = { error: null, watching: true, commented: new Set<string>(), ...h }
    const view = render(<EpisodeRecorder data={data([ep(1, true), ep(2), ep(3)])} undoable={new Set<string>()} {...props} />)
    expect(current()).toBe('#2')
    fireEvent.click(within(ratings()).getByRole('button', { name: '普通' }))
    expect(current()).toBe('#3')
    // 記録した話の中身（記録数）が差し替わる
    view.rerender(<EpisodeRecorder data={data([ep(1, true), ep(2, true), ep(3)])} undoable={new Set(['E2'])} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }))
    expect(h.onUndo).toHaveBeenCalledWith(expect.objectContaining({ id: 'E2' }))
    expect(current()).toBe('#2')
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

  it('lists the episodes under the recorder; picking one selects it in the recorder', () => {
    recorder(data([ep(1), ep(2), ep(3)]))
    const list = screen.getByRole('list', { name: '話の一覧' })
    fireEvent.click(within(list).getByRole('button', { name: /#3/ }))
    expect(current()).toBe('#3')
    expect(within(list).getByRole('button', { name: /#3/ }).getAttribute('aria-current')).toBe('true')
  })

  it('shows a long series from a little before the next episode, and widens on request', () => {
    const eps = Array.from({ length: 40 }, (_, i) => ep(i + 1, i < 20))
    recorder(data(eps))
    const list = screen.getByRole('list', { name: '話の一覧' })
    // 次は #21。その3話前から12話ぶん
    expect(within(list).getAllByRole('button').map((b) => b.textContent?.match(/#\d+/)?.[0])).toEqual(Array.from({ length: 12 }, (_, i) => `#${18 + i}`))
    fireEvent.click(screen.getByRole('button', { name: '前の話を見る' }))
    expect(within(list).getAllByRole('button')).toHaveLength(24)
  })

  it('shows loading, missing episode info, and a read error with retry', () => {
    recorder(undefined)
    expect(screen.getByText('話の一覧を読み込み中')).toBeTruthy()
    cleanup()
    recorder({ workId: 'W1', noEpisodes: true, episodes: [] })
    expect(screen.getByText('この作品には話の情報がありません。')).toBeTruthy()
    cleanup()
    const { h } = recorder(undefined, { error: 'offline' })
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }))
    expect(h.onRetry).toHaveBeenCalled()
  })
})
