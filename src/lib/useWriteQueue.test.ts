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

  // 2026-11-13 のレビュー O1・O2: 送る前の取りやめ（enqueue の戻り値）。作品はテストごとに変える（頼んだ番号は起動中ずっと残る）
  describe('withdrawing a write before it is sent', () => {
    const status = (workId: string, state: 'WATCHED' | 'NO_STATE'): WriteIntent => ({ kind: 'status', workId, state })
    const rating = (workId: string, r: 'GOOD' | 'GREAT' | null): WriteIntent => ({ kind: 'rating', workId, annictId: 1, rating: r })
    const journal = () => JSON.parse(localStorage.getItem('animax.writeJournal.v1') ?? '{"entries":[]}').entries.map((e: { key: string }) => e.key)
    const fresh = () => {
      localStorage.clear()
      saveAnnictToken('t')
      reconciled.length = 0
      return renderHook(() => useWriteQueue())
    }
    // 前の送信が終わるまで、あとの頼みは始まらない（送る前の状態を作る）
    const blocker = () => {
      let release!: () => void
      const gate = new Promise<void>((r) => (release = r))
      return { task: () => gate, release }
    }
    const failing = async () => Promise.reject(new Error('HTTP 502'))

    it('takes the wish off the device and asks for nothing else when it had replaced nothing', async () => {
      const hook = fresh()
      const front = blocker()
      const sent: string[] = []
      let cancelled = false
      let withdraw!: () => boolean
      act(() => {
        hook.result.current.enqueue('前の送信', front.task)
        withdraw = hook.result.current.enqueue('記録', async () => void (cancelled || sent.push('記録')), [status('W20', 'WATCHED')])
      })
      expect(journal()).toEqual(['status:W20'])
      cancelled = true
      let ok = false
      act(() => void (ok = withdraw()))
      expect(ok).toBe(true)
      expect(journal()).toEqual([])
      front.release()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(sent).toEqual([])
      expect(reconciled).toEqual([])
      expect(hook.result.current.failed).toEqual([])
    })

    // O1: 答える → 取り消す（送信中）→ もう一度答える → 送る前に取り消す → 先の取り消しが失敗。
    // もう一度答えたときに先の取り消しは「頼み直された」扱いになるので、取りやめるだけだと、失敗が一覧にも控えにも残らなかった
    it('asks again for the write it had replaced, so that write is not lost when it fails', async () => {
      const hook = fresh()
      let fail!: () => void
      const gate = new Promise<void>((_, reject) => (fail = () => reject(new Error('HTTP 502'))))
      let withdraw!: () => boolean
      act(() => {
        hook.result.current.enqueue('取り消し', () => gate, [status('W21', 'NO_STATE')])
        withdraw = hook.result.current.enqueue('記録', async () => undefined, [status('W21', 'WATCHED')])
      })
      act(() => void withdraw())
      // 控えには、頼み直した取り消しの行き先がある（ここで閉じても、次に開いたときに送り直せる）
      const kept = JSON.parse(localStorage.getItem('animax.writeJournal.v1')!).entries
      expect(kept.map((e: { label: string; intent: WriteIntent }) => [e.label, e.intent])).toEqual([['取り消し', status('W21', 'NO_STATE')]])
      fail()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(reconciled).toEqual([JSON.stringify(status('W21', 'NO_STATE'))])
      expect(hook.result.current.failed).toEqual([])
      expect(journal()).toEqual([])
    })

    it('asks again only for the items it had replaced; the rest of that write stays as it was', async () => {
      const hook = fresh()
      let fail!: () => void
      const gate = new Promise<void>((_, reject) => (fail = () => reject(new Error('HTTP 502'))))
      let withdraw!: () => boolean
      act(() => {
        hook.result.current.enqueue('取り消し', () => gate, [status('W22', 'NO_STATE'), rating('W22', null)])
        // 状態だけの答え（評価は上書きしない）
        withdraw = hook.result.current.enqueue('記録', async () => undefined, [status('W22', 'WATCHED')])
      })
      act(() => void withdraw())
      fail()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(reconciled).toEqual([JSON.stringify(status('W22', 'NO_STATE'))])
      // 先の取り消しは、評価の分がまだ生きているので、失敗として残る
      expect(hook.result.current.failed.map((f) => f.label)).toEqual(['取り消し'])
    })

    it('does not ask again for a replaced write that has arrived in the meantime', async () => {
      const hook = fresh()
      const reading = blocker()
      const log: string[] = []
      let withdraw!: () => boolean
      act(() => {
        hook.result.current.enqueue('取り消し', async () => void log.push('取り消し'), [status('W23', 'NO_STATE')])
        // 書く前の読み込みで待っている答え
        withdraw = hook.result.current.enqueue('記録', reading.task, [status('W23', 'WATCHED')])
      })
      await waitFor(() => expect(log).toEqual(['取り消し']))
      act(() => void withdraw())
      reading.release()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(reconciled).toEqual([])
      expect(journal()).toEqual([])
    })

    it('asks again for a failed write that the withdrawn one had taken off the list', async () => {
      const hook = fresh()
      act(() => void hook.result.current.enqueue('取り消し', failing, [status('W24', 'NO_STATE')]))
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      const front = blocker()
      let withdraw!: () => boolean
      act(() => {
        hook.result.current.enqueue('前の送信', front.task)
        withdraw = hook.result.current.enqueue('記録', async () => undefined, [status('W24', 'WATCHED')])
      })
      expect(hook.result.current.failed).toEqual([])
      act(() => void withdraw())
      front.release()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(reconciled).toEqual([JSON.stringify(status('W24', 'NO_STATE'))])
    })

    // 送っていない答えは何も書いていないので、取りやめても、あとから頼んだ書き込みには触らない
    it('leaves a later write of the same item alone, and does not ask again for what that later write has taken over', async () => {
      const hook = fresh()
      let fail!: () => void
      const gate = new Promise<void>((_, reject) => (fail = () => reject(new Error('HTTP 502'))))
      const sent: string[] = []
      let withdraw!: () => boolean
      act(() => {
        hook.result.current.enqueue('取り消し', () => gate, [status('W25', 'NO_STATE'), rating('W25', null)])
        withdraw = hook.result.current.enqueue('記録', async () => undefined, [status('W25', 'WATCHED'), rating('W25', 'GOOD')])
        // ほかの画面で、評価だけ付け直した
        hook.result.current.enqueue('ほかの画面', async () => void sent.push('GREAT'), [rating('W25', 'GREAT')])
      })
      let ok = false
      act(() => void (ok = withdraw()))
      expect(ok).toBe(true)
      fail()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      // 頼み直すのは、取り消しの状態の分だけ。評価は、あとから頼んだ「ほかの画面」の値のまま
      expect(reconciled).toEqual([JSON.stringify(status('W25', 'NO_STATE'))])
      expect(sent).toEqual(['GREAT'])
      expect(hook.result.current.failed).toEqual([])
      expect(journal()).toEqual([])
    })

    // 送る前の答えAを、別の答えBが上書きし、Bを取りやめた。Aの行き先は列の側が頼み直した（Aの task の外で書かれる）ので、
    // Aはもう取りやめられない（頼んだ側が、取り消しの書き込みを頼む）
    it('refuses once the write was asked again on its behalf (the asker sends an undo instead)', async () => {
      const hook = fresh()
      const front = blocker()
      let first!: () => boolean
      let second!: () => boolean
      act(() => {
        hook.result.current.enqueue('前の送信', front.task)
        first = hook.result.current.enqueue('評価の山の答え', async () => undefined, [{ kind: 'status', workId: 'W30', state: 'WATCHED', idMal: 30 }])
        second = hook.result.current.enqueue('マッチングの答え', async () => undefined, [{ kind: 'match', idMal: 30, title: { native: 'x', romaji: null, english: null }, state: 'WANNA_WATCH' }])
      })
      let ok = false
      act(() => void (ok = second()))
      expect(ok).toBe(true)
      expect(first()).toBe(false)
      front.release()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(reconciled).toEqual([JSON.stringify({ kind: 'status', workId: 'W30', state: 'WATCHED', idMal: 30 })])
    })

    // O2: 取りやめた頼みの失敗は、一覧に出さない・残さない
    it('a withdrawn write is not listed as failed, whether it fails afterwards or had failed before', async () => {
      const hook = fresh()
      const front = blocker()
      let withdraw!: () => boolean
      // 取りやめたあとで失敗する（書く前の読み込みの失敗など）
      act(() => {
        hook.result.current.enqueue('前の送信', front.task)
        withdraw = hook.result.current.enqueue('記録', failing, [status('W26', 'WATCHED')])
      })
      act(() => void withdraw())
      front.release()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(hook.result.current.failed).toEqual([])
      // 送り始める前に失敗して、一覧にある頼みを取りやめる
      act(() => void (withdraw = hook.result.current.enqueue('記録', failing, [status('W27', 'WATCHED')])))
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      let ok = false
      act(() => void (ok = withdraw()))
      expect(ok).toBe(true)
      expect(hook.result.current.failed).toEqual([])
      expect(journal()).toEqual([])
    })

    it('can still be withdrawn after "retry" put the same task back in the queue', async () => {
      const hook = fresh()
      let cancelled = false
      let attempts = 0
      let withdraw!: () => boolean
      act(
        () =>
          void (withdraw = hook.result.current.enqueue(
            '記録',
            async () => {
              attempts++
              if (!cancelled) throw new Error('HTTP 502')
            },
            [status('W28', 'WATCHED')],
          )),
      )
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      const front = blocker()
      act(() => {
        hook.result.current.enqueue('前の送信', front.task)
        hook.result.current.retryFailed()
      })
      expect(journal()).toEqual(['status:W28'])
      cancelled = true
      let ok = false
      act(() => void (ok = withdraw()))
      expect(ok).toBe(true)
      expect(journal()).toEqual([])
      front.release()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(attempts).toBe(2)
      expect(hook.result.current.failed).toEqual([])
    })

    it('refuses once "retry" has sent the wish itself through reconcile (the task no longer knows what was written)', async () => {
      const hook = fresh()
      let withdraw!: () => boolean
      act(() => void (withdraw = hook.result.current.enqueue('状態と評価', failing, [status('W29', 'WATCHED'), rating('W29', 'GOOD')])))
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      // 別のタブで評価だけ付け直した（このタブの番号には残らない）
      journalDone(journalPut('別のタブ', [rating('W29', 'GREAT')]))
      act(() => hook.result.current.retryFailed())
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(reconciled).toEqual([JSON.stringify(status('W29', 'WATCHED'))])
      expect(withdraw()).toBe(false)
    })
  })

  // 2026-11-13 のレビュー O4: 送り始める書き込みに、頼んだときに上書きした書き込みのうち、まだ届いていないものの行き先を渡す
  // （「書く前の値」を Annict から読むと、届いていない取り消しの前の値を読むため）。作品はテストごとに変える
  describe('telling a write which undelivered writes it replaced', () => {
    const status = (workId: string, state: 'WATCHED' | 'NO_STATE'): WriteIntent => ({ kind: 'status', workId, state })
    const rating = (workId: string, r: 'GOOD' | 'GREAT' | null): WriteIntent => ({ kind: 'rating', workId, annictId: 1, rating: r })
    const failing = async () => Promise.reject(new Error('HTTP 502'))
    const fresh = () => {
      localStorage.clear()
      return renderHook(() => useWriteQueue())
    }
    // 渡された行き先を覚える書き込み
    const recorder = () => {
      const got: WriteIntent[][] = []
      return { got, task: async (unsent: readonly WriteIntent[]) => void got.push([...unsent]) }
    }

    it('passes the wish of a failed write that it took off the list', async () => {
      const hook = fresh()
      act(() => void hook.result.current.enqueue('取り消し', failing, [status('W40', 'NO_STATE'), rating('W40', null)]))
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      const answer = recorder()
      act(() => void hook.result.current.enqueue('記録', answer.task, [status('W40', 'WATCHED'), rating('W40', 'GOOD')]))
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(answer.got).toEqual([[status('W40', 'NO_STATE'), rating('W40', null)]])
    })

    it('passes the wish of a write that was still on its way when asked and then failed, but not of one that arrived', async () => {
      const hook = fresh()
      let fail!: () => void
      const gate = new Promise<void>((_, reject) => (fail = () => reject(new Error('HTTP 502'))))
      const lost = recorder()
      const arrived = recorder()
      act(() => {
        hook.result.current.enqueue('取り消し', () => gate, [status('W41', 'NO_STATE')])
        hook.result.current.enqueue('記録', lost.task, [status('W41', 'WATCHED')])
        hook.result.current.enqueue('取り消し', async () => undefined, [status('W42', 'NO_STATE')])
        hook.result.current.enqueue('記録', arrived.task, [status('W42', 'WATCHED')])
      })
      fail()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(lost.got).toEqual([[status('W41', 'NO_STATE')]])
      expect(arrived.got).toEqual([[]])
      expect(hook.result.current.failed).toEqual([])
    })

    it('passes only the items it replaced', async () => {
      const hook = fresh()
      act(() => void hook.result.current.enqueue('取り消し', failing, [status('W43', 'NO_STATE'), rating('W43', null)]))
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      const answer = recorder()
      // 状態だけの答え（評価は上書きしない）
      act(() => void hook.result.current.enqueue('記録', answer.task, [status('W43', 'WATCHED')]))
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(answer.got).toEqual([[status('W43', 'NO_STATE')]])
      // 先の取り消しは、評価の分がまだ生きているので、失敗として残る
      expect(hook.result.current.failed.map((f) => f.label)).toEqual(['取り消し'])
    })

    it('does not pass the wish of a write the user chose not to send', async () => {
      const other = fresh()
      const hook = renderHook(() => useWriteQueue())
      act(() => void other.result.current.enqueue('ほかの画面', failing, [status('W44', 'WATCHED')]))
      await waitFor(() => expect(other.result.current.failed).toHaveLength(1))
      let release!: () => void
      const front = new Promise<void>((r) => (release = r))
      const answer = recorder()
      act(() => {
        hook.result.current.enqueue('前の送信', () => front)
        hook.result.current.enqueue('記録', answer.task, [status('W44', 'NO_STATE')])
      })
      // ほかの画面の失敗は、その画面の一覧に残っている。送らないことにした
      act(() => other.result.current.dismissFailed())
      release()
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(answer.got).toEqual([[]])
    })

    it('passes it again when the write itself is retried', async () => {
      const hook = fresh()
      act(() => void hook.result.current.enqueue('取り消し', failing, [status('W45', 'NO_STATE')]))
      await waitFor(() => expect(hook.result.current.failed).toHaveLength(1))
      const got: WriteIntent[][] = []
      act(
        () =>
          void hook.result.current.enqueue(
            '記録',
            async (unsent) => {
              got.push([...unsent])
              if (got.length === 1) throw new Error('HTTP 502')
            },
            [status('W45', 'WATCHED')],
          ),
      )
      await waitFor(() => expect(hook.result.current.failed.map((f) => f.label)).toEqual(['記録']))
      act(() => hook.result.current.retryFailed())
      await waitFor(() => expect(hook.result.current.pending).toBe(0))
      expect(got).toEqual([[status('W45', 'NO_STATE')], [status('W45', 'NO_STATE')]])
    })
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
