// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Episode, WorkEpisodes } from '../../lib/annict'

const fetchEpisodes = vi.fn()
const createRecord = vi.fn()
const deleteRecord = vi.fn()
vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchEpisodes: (...a: unknown[]) => fetchEpisodes(...a),
  createRecord: (...a: unknown[]) => createRecord(...a),
  deleteRecord: (...a: unknown[]) => deleteRecord(...a),
}))

const { useEpisodes } = await import('./useEpisodes')

const ep = (n: number, tracked = false): Episode => ({ id: `E${n}`, annictId: n, number: n, numberText: `#${n}`, title: null, viewerDidTrack: tracked, viewerRecordsCount: tracked ? 1 : 0 })
const work = (id = 'W1'): WorkEpisodes => ({ workId: id, noEpisodes: false, episodes: [ep(1, true), ep(2), ep(3)] })

// 書き込みの列の代わり: 頼まれた仕事を順に持っておき、テストが流す
function queue() {
  const tasks: { label: string; run: () => Promise<void> }[] = []
  const enqueue = (label: string, run: () => Promise<void>) => tasks.push({ label, run })
  return { tasks, enqueue }
}

afterEach(() => vi.clearAllMocks())

describe('useEpisodes', () => {
  it('reads only the works that were opened, adding new ones without reading the old again', async () => {
    fetchEpisodes.mockImplementation(async (_t: string, ids: string[]) => new Map(ids.map((id) => [id, work(id)])))
    const q = queue()
    const { result, rerender } = renderHook(({ ids }) => useEpisodes('t', ids, q.enqueue), { initialProps: { ids: [] as string[] } })
    expect(fetchEpisodes).not.toHaveBeenCalled()
    rerender({ ids: ['W1'] })
    await waitFor(() => expect(result.current.byWork.get('W1')?.episodes).toHaveLength(3))
    rerender({ ids: ['W1', 'W2'] })
    await waitFor(() => expect(result.current.byWork.has('W2')).toBe(true))
    expect(fetchEpisodes.mock.calls.map((c) => c[1])).toEqual([['W1'], ['W2']])
    // 閉じても控えは残る
    rerender({ ids: [] })
    expect(result.current.byWork.has('W1')).toBe(true)
  })

  it('records an episode with its rating at once on screen, sends it in the queue, and can undo it right after', async () => {
    fetchEpisodes.mockResolvedValue(new Map([['W1', work()]]))
    createRecord.mockResolvedValue('R2')
    const q = queue()
    const { result } = renderHook(() => useEpisodes('t', ['W1'], q.enqueue))
    await waitFor(() => expect(result.current.byWork.has('W1')).toBe(true))

    act(() => result.current.record('作品', 'W1', ep(2), 'GOOD'))
    expect(result.current.byWork.get('W1')?.episodes[1].viewerDidTrack).toBe(true)
    expect(result.current.undoable.has('E2')).toBe(true)
    expect(q.tasks[0].label).toBe('「作品」#2の記録')
    await q.tasks[0].run()
    expect(createRecord).toHaveBeenCalledWith('t', 'E2', 'GOOD')

    act(() => result.current.undo('作品', 'W1', ep(2)))
    expect(result.current.byWork.get('W1')?.episodes[1].viewerDidTrack).toBe(false)
    expect(result.current.undoable.has('E2')).toBe(false)
    await q.tasks[1].run()
    expect(deleteRecord).toHaveBeenCalledWith('t', 'R2')
  })

  it('undoing before the record was sent waits for it, and deletes nothing when sending failed', async () => {
    fetchEpisodes.mockResolvedValue(new Map([['W1', work()]]))
    createRecord.mockRejectedValue(new Error('offline'))
    const q = queue()
    const { result } = renderHook(() => useEpisodes('t', ['W1'], q.enqueue))
    await waitFor(() => expect(result.current.byWork.has('W1')).toBe(true))
    act(() => result.current.record('作品', 'W1', ep(3), 'BAD'))
    act(() => result.current.undo('作品', 'W1', ep(3)))
    await expect(q.tasks[0].run()).rejects.toThrow('offline')
    await q.tasks[1].run()
    expect(deleteRecord).not.toHaveBeenCalled()
  })

  it('does not offer undo for records it did not make', async () => {
    fetchEpisodes.mockResolvedValue(new Map([['W1', work()]]))
    const q = queue()
    const { result } = renderHook(() => useEpisodes('t', ['W1'], q.enqueue))
    await waitFor(() => expect(result.current.byWork.has('W1')).toBe(true))
    act(() => result.current.undo('作品', 'W1', ep(1)))
    expect(q.tasks).toHaveLength(0)
    expect(result.current.byWork.get('W1')?.episodes[0].viewerDidTrack).toBe(true)
  })

  it('reports a read error per work, and reads again on retry', async () => {
    fetchEpisodes.mockRejectedValueOnce(new Error('Annict に接続できませんでした')).mockResolvedValueOnce(new Map([['W1', work()]]))
    const q = queue()
    const { result } = renderHook(() => useEpisodes('t', ['W1'], q.enqueue))
    await waitFor(() => expect(result.current.errors.get('W1')).toBe('Annict に接続できませんでした'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.byWork.has('W1')).toBe(true))
  })
})
