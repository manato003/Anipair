// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { hasPendingWrites, useWriteQueue } from './useWriteQueue'

describe('useWriteQueue', () => {
  it('runs writes from different screens one after another, in the order they were asked', async () => {
    const a = renderHook(() => useWriteQueue())
    const b = renderHook(() => useWriteQueue())
    const log: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))

    act(() => {
      a.result.current.enqueue('A', async () => {
        log.push('A start')
        await gate
        log.push('A end')
      })
      b.result.current.enqueue('B', async () => void log.push('B'))
    })
    await waitFor(() => expect(log).toEqual(['A start']))
    // 別の画面の送信も、前の送信が終わるまで始まらない
    expect(hasPendingWrites()).toBe(true)
    expect(a.result.current.pending).toBe(1)
    expect(b.result.current.pending).toBe(1)

    release()
    await waitFor(() => expect(b.result.current.pending).toBe(0))
    expect(log).toEqual(['A start', 'A end', 'B'])
    expect(hasPendingWrites()).toBe(false)
  })

  it('keeps failures on the screen that asked, and the next write still runs', async () => {
    const a = renderHook(() => useWriteQueue())
    const b = renderHook(() => useWriteQueue())
    const log: string[] = []
    act(() => {
      a.result.current.enqueue('A', async () => {
        throw new Error('だめ')
      })
      b.result.current.enqueue('B', async () => void log.push('B'))
    })
    await waitFor(() => expect(b.result.current.pending).toBe(0))
    expect(a.result.current.failed.map((f) => f.message)).toEqual(['だめ'])
    expect(b.result.current.failed).toEqual([])
    expect(log).toEqual(['B'])
  })

  it('retrying failed writes sends each one once, even under StrictMode (updaters run twice)', async () => {
    const hook = renderHook(() => useWriteQueue(), { wrapper: StrictMode })
    let attempts = 0
    act(() => {
      hook.result.current.enqueue('A', async () => {
        attempts++
        if (attempts === 1) throw new Error('一度目はだめ')
      })
    })
    await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
    expect(attempts).toBe(1)

    act(() => hook.result.current.retryFailed())
    await waitFor(() => expect(hook.result.current.pending).toBe(0))
    // 送り直しは1回だけ（状態の更新関数の中で送ると、StrictMode では2回送ってしまう）
    expect(attempts).toBe(2)
    expect(hook.result.current.failed).toEqual([])
  })

  it('retrying twice in a row does not resend the same failure again', async () => {
    const hook = renderHook(() => useWriteQueue())
    let attempts = 0
    act(() => {
      hook.result.current.enqueue('A', async () => {
        attempts++
        throw new Error('だめ')
      })
    })
    await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
    act(() => {
      hook.result.current.retryFailed()
      hook.result.current.retryFailed()
    })
    await waitFor(() => expect(hook.result.current.pending).toBe(0))
    expect(attempts).toBe(2)
    expect(hook.result.current.failed).toHaveLength(1)
  })

  it('dismissing clears the failures', async () => {
    const hook = renderHook(() => useWriteQueue())
    act(() => hook.result.current.enqueue('A', async () => Promise.reject(new Error('だめ'))))
    await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
    act(() => hook.result.current.dismissFailed())
    expect(hook.result.current.failed).toEqual([])
    act(() => hook.result.current.retryFailed())
    expect(hook.result.current.pending).toBe(0)
  })

  it('keeps the wish on the device until the write succeeds, keeps it on failure, and drops it when dismissed', async () => {
    localStorage.clear()
    const hook = renderHook(() => useWriteQueue())
    const journal = () => JSON.parse(localStorage.getItem('animax.writeJournal.v1') ?? '{"entries":[]}').entries.map((e: { key: string }) => e.key)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    act(() => hook.result.current.enqueue('ok', () => gate, [{ kind: 'status', workId: 'W1', state: 'WATCHED' }]))
    // 送り終えるまでは控えにある（ここで閉じても、次に開いたときに送り直せる）
    expect(journal()).toEqual(['status:W1'])
    release()
    await waitFor(() => expect(hook.result.current.pending).toBe(0))
    expect(journal()).toEqual([])
    act(() =>
      hook.result.current.enqueue(
        'ng',
        async () => {
          throw new Error('HTTP 502')
        },
        [{ kind: 'status', workId: 'W2', state: 'WATCHED' }],
      ),
    )
    await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
    expect(journal()).toEqual(['status:W2'])
    act(() => hook.result.current.dismissFailed())
    expect(journal()).toEqual([])
  })
})
