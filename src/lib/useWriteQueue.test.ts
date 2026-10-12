// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { WriteIntent } from './writeJournal'

// 一部だけ頼み直された失敗は、残りの行き先だけを reconcile で送る
const reconciled: string[] = []
vi.mock('../features/unsent/reconcile', () => ({
  reconcileIntent: vi.fn(async (_t: string, intent: WriteIntent) => void reconciled.push(JSON.stringify(intent))),
}))

const { hasPendingWrites, useWriteQueue } = await import('./useWriteQueue')
const { saveAnnictToken } = await import('./storage')
const { journalDone, journalPut } = await import('./writeJournal')

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

  // 2026-10-06 の点検: 失敗した送信を「もう一度」送ると、そのあとで付け直した・取り消した答えを古い答えで上書きしていた
  describe('a failed write that was asked again since', () => {
    const status = (workId: string, state: 'WATCHED' | 'NO_STATE'): WriteIntent => ({ kind: 'status', workId, state })
    const rating = (workId: string, r: 'GOOD' | 'GREAT'): WriteIntent => ({ kind: 'rating', workId, annictId: 1, rating: r })

    it('is dropped from the list when the same items are asked again, and retry does not send it', async () => {
      const hook = renderHook(() => useWriteQueue())
      const sent: string[] = []
      act(() => hook.result.current.enqueue('GOOD', async () => Promise.reject(new Error('HTTP 502')), [status('W1', 'WATCHED'), rating('W1', 'GOOD')]))
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      // 取り消した（状態と評価の両方を頼み直した）
      act(() => hook.result.current.enqueue('取り消し', async () => void sent.push('undo'), [status('W1', 'NO_STATE'), rating('W1', 'GOOD')]))
      expect(hook.result.current.failed).toEqual([])
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      act(() => hook.result.current.retryFailed())
      expect(sent).toEqual(['undo'])
    })

    it('is not kept as a failure when it was asked again while it was being sent', async () => {
      const hook = renderHook(() => useWriteQueue())
      let fail!: () => void
      const gate = new Promise<void>((_, reject) => (fail = () => reject(new Error('HTTP 502'))))
      act(() => {
        hook.result.current.enqueue('GOOD', () => gate, [rating('W1', 'GOOD')])
        hook.result.current.enqueue('GREAT', async () => undefined, [rating('W1', 'GREAT')])
      })
      fail()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(hook.result.current.failed).toEqual([])
    })

    it('a write asked again on another screen is skipped on retry; only the rest is sent, through reconcile', async () => {
      localStorage.clear()
      saveAnnictToken('t')
      reconciled.length = 0
      const a = renderHook(() => useWriteQueue())
      const b = renderHook(() => useWriteQueue())
      let attempts = 0
      act(() =>
        a.result.current.enqueue(
          '状態と評価',
          async () => {
            attempts++
            throw new Error('HTTP 502')
          },
          [status('W1', 'WATCHED'), rating('W1', 'GOOD')],
        ),
      )
      await waitFor(() => expect(a.result.current.failed).toHaveLength(1))
      // 別の画面で評価だけ付け直した
      act(() => b.result.current.enqueue('GREAT', async () => undefined, [rating('W1', 'GREAT')]))
      await waitFor(() => expect(b.result.current.pending).toBe(0))
      act(() => a.result.current.retryFailed())
      await waitFor(() => expect(a.result.current.pending).toBe(0))
      // 元の送信（古い評価を含む）はもう走らせず、状態だけを送る
      expect(attempts).toBe(1)
      expect(reconciled).toEqual([JSON.stringify(status('W1', 'WATCHED'))])
      expect(a.result.current.failed).toEqual([])
    })

    // 2026-10-12 のレビュー: 感想の保存は総合評価も書く。種類ごとに見ていると、あとで総合評価だけ変えた分を古い感想で戻していた
    it('a failed review is retried without its old overall rating once the overall was changed on another screen', async () => {
      localStorage.clear()
      saveAnnictToken('t')
      reconciled.length = 0
      const a = renderHook(() => useWriteQueue())
      const b = renderHook(() => useWriteQueue())
      const axes = { ratingOverallState: 'GOOD' as const, ratingStoryState: 'GREAT' as const, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
      const review: WriteIntent = { kind: 'review', workId: 'W1', annictId: 1, content: { axes, body: '本文' } }
      let attempts = 0
      act(() =>
        a.result.current.enqueue(
          '感想',
          async () => {
            attempts++
            throw new Error('HTTP 502')
          },
          [review],
        ),
      )
      await waitFor(() => expect(a.result.current.failed).toHaveLength(1))
      act(() => b.result.current.enqueue('GREAT', async () => undefined, [rating('W1', 'GREAT')]))
      await waitFor(() => expect(b.result.current.pending).toBe(0))
      act(() => a.result.current.retryFailed())
      await waitFor(() => expect(a.result.current.pending).toBe(0))
      // 元の送信（古い総合評価を含む）は走らせず、感想の中身だけを、総合評価は今の値のままにして送る
      expect(attempts).toBe(1)
      expect(reconciled).toEqual([JSON.stringify({ ...review, keepOverall: true })])
    })

    // 2026-10-13 のレビュー: 起動中の番号はタブごと。タブAで失敗 → タブBで同じ作品の評価を付け直して成功 → タブAの「もう一度」が古い評価で上書きしていた。
    // ほかのタブは、共有の端末の控えに直接頼んで送り終えたことにして再現する（起動中の番号には残らない）
    describe('asked again in another tab', () => {
      const otherTab = (intents: WriteIntent[]) => journalDone(journalPut('別のタブ', intents))

      it('retry does not send the old value once every item was asked again there', async () => {
        localStorage.clear()
        saveAnnictToken('t')
        reconciled.length = 0
        const a = renderHook(() => useWriteQueue())
        let attempts = 0
        act(() =>
          a.result.current.enqueue(
            'GOOD',
            async () => {
              attempts++
              throw new Error('HTTP 502')
            },
            [rating('W1', 'GOOD')],
          ),
        )
        await waitFor(() => expect(a.result.current.failed).toHaveLength(1))
        otherTab([rating('W1', 'GREAT')])
        act(() => a.result.current.retryFailed())
        await waitFor(() => expect(a.result.current.pending).toBe(0))
        expect(attempts).toBe(1)
        expect(reconciled).toEqual([])
        expect(a.result.current.failed).toEqual([])
      })

      it('only the items not asked again there are sent, through reconcile', async () => {
        localStorage.clear()
        saveAnnictToken('t')
        reconciled.length = 0
        const a = renderHook(() => useWriteQueue())
        let attempts = 0
        act(() =>
          a.result.current.enqueue(
            '状態と評価',
            async () => {
              attempts++
              throw new Error('HTTP 502')
            },
            [status('W1', 'WATCHED'), rating('W1', 'GOOD')],
          ),
        )
        await waitFor(() => expect(a.result.current.failed).toHaveLength(1))
        otherTab([rating('W1', 'GREAT')])
        act(() => a.result.current.retryFailed())
        await waitFor(() => expect(a.result.current.pending).toBe(0))
        expect(attempts).toBe(1)
        expect(reconciled).toEqual([JSON.stringify(status('W1', 'WATCHED'))])
      })

      it('still retries when the device could not keep the wish (nothing to compare with)', async () => {
        localStorage.clear()
        const a = renderHook(() => useWriteQueue())
        const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('保存できない')
        })
        let attempts = 0
        try {
          act(() =>
            a.result.current.enqueue(
              'GOOD',
              async () => {
                attempts++
                if (attempts === 1) throw new Error('HTTP 502')
              },
              [rating('W1', 'GOOD')],
            ),
          )
          await waitFor(() => expect(a.result.current.failed).toHaveLength(1))
          act(() => a.result.current.retryFailed())
          await waitFor(() => expect(a.result.current.pending).toBe(0))
        } finally {
          full.mockRestore()
        }
        expect(attempts).toBe(2)
        expect(a.result.current.failed).toEqual([])
      })
    })

    it('a failed matching answer does not overwrite the status set later for the same work elsewhere', async () => {
      localStorage.clear()
      saveAnnictToken('t')
      reconciled.length = 0
      const a = renderHook(() => useWriteQueue())
      const match: WriteIntent = { kind: 'match', idMal: 5, title: { native: 'x', romaji: null, english: null }, state: 'WANNA_WATCH' }
      act(() => a.result.current.enqueue('見たい', async () => Promise.reject(new Error('HTTP 502')), [match]))
      await waitFor(() => expect(a.result.current.failed).toHaveLength(1))
      // ブラウズで同じ作品を「見た」にした（状態だけを頼み直した。マッチングの答えには評価が無いので、もう送るものが無い）
      act(() => a.result.current.enqueue('見た', async () => undefined, [{ kind: 'status', workId: 'W1', state: 'WATCHED', idMal: 5 }]))
      expect(a.result.current.failed).toEqual([])
    })
  })
})
