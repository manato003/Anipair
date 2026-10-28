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

function recorder(d: WorkEpisodes | undefined, opts: { watching?: boolean; airing?: boolean; undoable?: string[]; error?: string | null } = {}) {
  const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn(), onCommentExisting: vi.fn(), onRerate: vi.fn() }
  const view = render(
    <EpisodeRecorder
      data={d}
      error={opts.error ?? null}
      watching={opts.watching ?? true}
      airing={opts.airing}
      undoable={new Set(opts.undoable ?? [])}
      commented={new Set()}
      {...h}
    />,
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
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(h.onComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), '良い引きだった')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText(/#1を「良い」で記録・感想つき/)).toBeTruthy()
    expect(localStorage.getItem('animax.episodeDrafts.v1')).toBeNull()
  })

  it('keeps writing about the same episode while the next ones are recorded, and restores a draft', () => {
    localStorage.setItem('animax.episodeDrafts.v1', JSON.stringify({ E1: '書きかけ' }))
    const { h } = recorder(data([ep(1), ep(2), ep(3)]), { undoable: ['E1', 'E2'] })
    fireEvent.click(within(ratings()).getByRole('button', { name: '普通' }))
    // 送っていない下書きがあることが、ボタンの名前で分かる
    fireEvent.click(screen.getByRole('button', { name: '感想の下書きを開く' }))
    expect((screen.getByRole('textbox', { name: '#1の感想' }) as HTMLTextAreaElement).value).toBe('書きかけ')
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    expect(screen.getByRole('textbox', { name: '#1の感想' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(h.onComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), '書きかけ')
  })

  // 評価と感想は別々に送る（「書いたら上の評価を押す」は分かりにくいため）
  it('shows "感想を書く" before rating too: sending it records the episode with the review only, and a later rating goes on that record', () => {
    const { h, view } = recorder(data([ep(1), ep(2)]))
    // 評価の前から見える（記録のあとにだけ出していたら、見つけられなかった）
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    const text = screen.getByRole('textbox', { name: /#1の感想/ })
    expect(screen.queryByText(/上の評価を押してください/)).toBeNull()
    fireEvent.change(text, { target: { value: '神回' } })
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(h.onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), null, '神回')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(localStorage.getItem('animax.episodeDrafts.v1')).toBeNull()
    // 同じ話のまま、評価のボタンが残る
    expect(current()).toBe('#1')
    expect(screen.getByText(/#1を感想だけで記録/)).toBeTruthy()
    // 記録した側が undoable を返したあとに評価を押すと、記録を増やさず、その記録に評価を付ける
    view.rerender(
      <EpisodeRecorder data={data([ep(1, true), ep(2)])} error={null} watching undoable={new Set(['E1'])} commented={new Set(['E1'])} {...h} />,
    )
    fireEvent.click(within(ratings()).getByRole('button', { name: 'とても良い' }))
    expect(h.onRecord).toHaveBeenCalledTimes(1)
    expect(h.onRerate).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'GREAT')
    expect(current()).toBe('#2')
    expect(screen.getByText(/#1を「とても良い」で記録・感想つき/)).toBeTruthy()
  })

  it('a rating does not send a review being written; the box stays open and sends to the new record', () => {
    const { h, view } = recorder(data([ep(1), ep(2)]))
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    fireEvent.change(screen.getByRole('textbox', { name: /#1の感想/ }), { target: { value: 'あとで送る' } })
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    expect(h.onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'GOOD')
    expect((screen.getByRole('textbox', { name: /#1の感想/ }) as HTMLTextAreaElement).value).toBe('あとで送る')
    view.rerender(<EpisodeRecorder data={data([ep(1, true), ep(2)])} error={null} watching undoable={new Set(['E1'])} commented={new Set()} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(h.onComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'あとで送る')
    expect(h.onRecord).toHaveBeenCalledTimes(1)
  })

  it('choosing again an episode rated on this screen changes its rating instead of adding a record', () => {
    const { h } = recorder(data([ep(1), ep(2)]), { undoable: ['E1'] })
    fireEvent.click(within(ratings()).getByRole('button', { name: '普通' }))
    fireEvent.click(screen.getByRole('button', { name: '前の話' }))
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    expect(h.onRecord).toHaveBeenCalledTimes(1)
    expect(h.onRerate).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'GOOD')
    expect(screen.getByText('#1を「良い」で記録')).toBeTruthy()
  })

  it('when the record could not be kept for undo, "感想を書く" goes on to the next episode (write, then rate)', () => {
    recorder(data([ep(1), ep(2)]))
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    expect(screen.getByRole('textbox', { name: /#2の感想/ })).toBeTruthy()
  })

  // 感想の欄を開いたまま別の話に移ると、欄は前の話のままで、評価を押しても感想が付かなかった
  it('follows the episode chosen with the arrows or the list, keeping each draft, so the box and the rating buttons agree', () => {
    const { h } = recorder(data([ep(1), ep(2), ep(3)]))
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    fireEvent.change(screen.getByRole('textbox', { name: /#1の感想/ }), { target: { value: '1話の感想' } })
    fireEvent.click(screen.getByRole('button', { name: '次の話' }))
    expect(current()).toBe('#2')
    const text = screen.getByRole('textbox', { name: /#2の感想/ }) as HTMLTextAreaElement
    expect(text.value).toBe('')
    fireEvent.change(text, { target: { value: '2話の感想' } })
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(h.onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'E2' }), null, '2話の感想')
    // 1話の書きかけは残っていて、戻れば開ける
    fireEvent.click(within(screen.getByRole('list', { name: '話の一覧' })).getByRole('button', { name: /#1/ }))
    fireEvent.click(screen.getByRole('button', { name: '感想の下書きを開く' }))
    expect((screen.getByRole('textbox', { name: /#1の感想/ }) as HTMLTextAreaElement).value).toBe('1話の感想')
  })

  // 前に記録した話で書いた感想が、Annict に届いていなかった（評価を押すまで送られない形だった）
  it('attaches a comment to an episode recorded before, and keeps the draft until it is sent', () => {
    const { h } = recorder(data([ep(1, true), ep(2, true), ep(3, true)]), { watching: false })
    expect(current()).toBe('#1')
    fireEvent.click(screen.getByRole('button', { name: '感想を書く' }))
    expect(screen.getByText('前に付けたこの話の記録に、感想を付けます')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /#1の感想/ }), { target: { value: ' あとから ' } })
    fireEvent.click(screen.getByRole('button', { name: '送る' }))
    expect(h.onRecord).not.toHaveBeenCalled()
    expect(h.onCommentExisting).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'あとから', expect.any(Function))
    // 届くまでは下書きを残す
    expect(JSON.parse(localStorage.getItem('animax.episodeDrafts.v1')!)).toEqual({ E1: ' あとから ' })
    h.onCommentExisting.mock.calls[0][2]()
    expect(localStorage.getItem('animax.episodeDrafts.v1')).toBeNull()
  })
})

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

  // 2026-10-12 の総点検: 続けて記録すると、直前の1話しか取り消せなかった
  it('undo goes back one recorded episode at a time, newest first', () => {
    const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn(), onCommentExisting: vi.fn(), onRerate: vi.fn() }
    const props = { data: data([ep(1), ep(2), ep(3), ep(4)]), error: null, watching: true, commented: new Set<string>(), ...h }
    const view = render(<EpisodeRecorder undoable={new Set<string>()} {...props} />)
    fireEvent.click(within(ratings()).getByRole('button', { name: '普通' }))
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    fireEvent.click(within(ratings()).getByRole('button', { name: 'とても良い' }))
    expect(current()).toBe('#4')
    view.rerender(<EpisodeRecorder undoable={new Set(['E1', 'E2', 'E3'])} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }))
    expect(h.onUndo).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'E3' }))
    view.rerender(<EpisodeRecorder undoable={new Set(['E1', 'E2'])} {...props} />)
    expect(screen.getByText('#2を「良い」で記録')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }))
    expect(h.onUndo).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'E2' }))
    view.rerender(<EpisodeRecorder undoable={new Set(['E1'])} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }))
    expect(h.onUndo).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'E1' }))
    expect(current()).toBe('#1')
    expect(screen.queryByRole('button', { name: '取り消す' })).toBeNull()
  })

  // 記録済みの話で評価を押すと、付け替えではなく記録が増える。
  // 誤って押さないよう、記録済みの話では評価のボタンを出さず、前回の評価と「もう一度記録する」「Annictで直す」を出す
  it('on an episode recorded before, shows the last rating instead of the buttons, and records again only when asked', () => {
    const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn(), onCommentExisting: vi.fn(), onRerate: vi.fn() }
    const lookup = vi.fn()
    const props = { data: data([ep(1, true), ep(2)]), error: null, watching: true, undoable: new Set<string>(), commented: new Set<string>(), workAnnictId: 77, onLookupPast: lookup, ...h }
    const view = render(<EpisodeRecorder {...props} />)
    // 次に見る話（まだ記録していない）はふつうの評価
    expect(current()).toBe('#2')
    expect(ratings()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '前の話' }))
    expect(current()).toBe('#1')
    // 評価のボタンは出ず、前回の評価を探す
    expect(ratings()).toBeNull()
    expect(lookup).toHaveBeenCalledWith('E1')
    expect(screen.getByText('前回の評価を探しています…')).toBeTruthy()
    view.rerender(<EpisodeRecorder {...props} past={new Map([['E1', { rating: 'GOOD', createdAt: '2025-09-03T03:00:00Z' }]])} />)
    expect(screen.getByText('前回：良い（2025/9/3）')).toBeTruthy()
    expect((screen.getByRole('link', { name: 'Annictで直す' }) as HTMLAnchorElement).href).toBe('https://annict.com/works/77/episodes/1')
    // もう一度記録する → 点線の評価のボタン。やめると戻る
    fireEvent.click(screen.getByRole('button', { name: 'もう一度記録する（2回目）' }))
    expect(ratings().classList.contains('mini-ratings--again')).toBe(true)
    expect(ratings().getAttribute('aria-label')).toBe('#1をもう一度記録する評価')
    expect(screen.getByText('2回目の記録を付けます')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(ratings()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'もう一度記録する（2回目）' }))
    fireEvent.click(within(ratings()).getByRole('button', { name: 'とても良い' }))
    expect(h.onRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'E1' }), 'GREAT')
  })

  it('says the last rating can be seen on Annict when it is too old to find', () => {
    const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn(), onCommentExisting: vi.fn(), onRerate: vi.fn() }
    render(<EpisodeRecorder data={data([ep(1, true), ep(2, true)])} error={null} watching={false} undoable={new Set()} commented={new Set()} past={new Map([['E1', null]])} {...h} />)
    expect(screen.getByText('前回の評価はAnnictで見られます')).toBeTruthy()
  })

  it('choosing an episode recorded on this screen offers to undo that one, not the latest', () => {
    const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn(), onCommentExisting: vi.fn(), onRerate: vi.fn() }
    const props = { error: null, watching: true, commented: new Set<string>(), ...h }
    const view = render(<EpisodeRecorder data={data([ep(1), ep(2), ep(3)])} undoable={new Set<string>()} {...props} />)
    fireEvent.click(within(ratings()).getByRole('button', { name: '普通' }))
    fireEvent.click(within(ratings()).getByRole('button', { name: '良い' }))
    view.rerender(<EpisodeRecorder data={data([ep(1, true), ep(2, true), ep(3)])} undoable={new Set(['E1', 'E2'])} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '前の話' }))
    fireEvent.click(screen.getByRole('button', { name: '前の話' }))
    expect(current()).toBe('#1')
    // この画面で記録した話は「2回目」の案内ではなく、その記録と取り消し
    expect(screen.getByText('#1を「普通」で記録')).toBeTruthy()
    expect(ratings().classList.contains('mini-ratings--again')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '取り消す' }))
    expect(h.onUndo).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'E1' }))
  })

  // 2026-10-06 の点検: 記録すると話の中身が新しいものに差し替わり、取り消すと第1話に飛んでいた
  it('undo goes back to the episode it recorded, after the list was updated by the record', () => {
    const h = { onRecord: vi.fn(), onUndo: vi.fn(), onFinish: vi.fn(), onRetry: vi.fn(), onComment: vi.fn(), onCommentExisting: vi.fn(), onRerate: vi.fn() }
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

  it('does not offer to mark an airing work watched after its latest registered episode', () => {
    const { h } = recorder(data([ep(1, true), ep(2)]), { watching: true, airing: true })
    fireEvent.click(within(ratings()).getByRole('button', { name: 'とても良い' }))
    expect(current()).toBe('放送中の最新話まで記録しました')
    expect(document.querySelector('.ep__box .mini-ratings')).toBeNull()
    expect(h.onFinish).not.toHaveBeenCalled()
    cleanup()
    // 開き直したとき（直前の記録が無いとき）は、続きの案内を出す
    recorder(data([ep(1, true), ep(2, true)]), { watching: true, airing: true })
    expect(screen.getByText('次の話がAnnictに登録されたら、ここで続けて記録できます。')).toBeTruthy()
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
