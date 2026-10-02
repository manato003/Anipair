// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
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
})
