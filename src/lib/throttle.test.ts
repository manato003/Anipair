import { describe, expect, it } from 'vitest'
import { createThrottle } from './throttle'

// 偽の時計。sleep は時計を進めるだけ
function fakeClock() {
  let t = 1000
  const starts: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
    advance: (ms: number) => {
      t += ms
    },
    starts,
  }
}

describe('createThrottle', () => {
  it('keeps at least the minimum interval between task starts', async () => {
    const c = fakeClock()
    const schedule = createThrottle(300, c.now, c.sleep)
    await Promise.all([1, 2, 3, 4].map(() => schedule(async () => void c.starts.push(c.now()))))
    const gaps = c.starts.slice(1).map((t, i) => t - c.starts[i])
    expect(gaps).toEqual([300, 300, 300])
  })

  it('does not wait when enough time has already passed', async () => {
    const c = fakeClock()
    const schedule = createThrottle(300, c.now, c.sleep)
    await schedule(async () => void c.starts.push(c.now()))
    c.advance(500)
    await schedule(async () => void c.starts.push(c.now()))
    expect(c.starts[1] - c.starts[0]).toBe(500)
  })

  it('runs tasks in order and keeps going after a failure', async () => {
    const c = fakeClock()
    const schedule = createThrottle(100, c.now, c.sleep)
    const order: string[] = []
    const a = schedule(async () => void order.push('a'))
    const b = schedule(async () => {
      order.push('b')
      throw new Error('boom')
    })
    const d = schedule(async () => {
      order.push('c')
      return 7
    })
    await a
    await expect(b).rejects.toThrow('boom')
    await expect(d).resolves.toBe(7)
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('runs a foreground task before background tasks that are queued, in the same tick or while one is running', async () => {
    const c = fakeClock()
    const schedule = createThrottle(100, c.now, c.sleep)
    const order: string[] = []
    const run = (name: string, opts?: { background?: boolean }) => schedule(async () => void order.push(name), opts)
    // 同じ時点で頼んだら、裏が先でも画面の仕事が先に動く
    await Promise.all([run('bg1', { background: true }), run('bg2', { background: true }), run('fg1')])
    expect(order).toEqual(['fg1', 'bg1', 'bg2'])

    // 裏の仕事が動いているあいだに頼んだ画面の仕事は、待っている裏の仕事より先に動く
    order.length = 0
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const first = schedule(async () => {
      order.push('bg-a start')
      await gate
    }, { background: true })
    const second = run('bg-b', { background: true })
    await Promise.resolve()
    await Promise.resolve()
    const urgent = run('fg-urgent')
    release()
    await Promise.all([first, second, urgent])
    expect(order).toEqual(['bg-a start', 'fg-urgent', 'bg-b'])
  })

  it('lets a foreground task that arrives while waiting for the interval overtake the background task', async () => {
    let t = 1000
    let wake!: () => void
    const schedule = createThrottle(
      300,
      () => t,
      () => new Promise<void>((r) => (wake = () => { t += 300; r() })),
    )
    const order: string[] = []
    await schedule(async () => void order.push('first'))
    // 間隔の待ちに入るまで進める
    const bg = schedule(async () => void order.push('bg'), { background: true })
    await new Promise((r) => setTimeout(r, 0))
    const fg = schedule(async () => void order.push('fg'))
    wake()
    await fg
    // 次の仕事の前の待ち
    await new Promise((r) => setTimeout(r, 0))
    wake()
    await bg
    expect(order).toEqual(['first', 'fg', 'bg'])
  })

  it('keeps the interval between starts for both priorities, and a failing background task does not stop the queue', async () => {
    const c = fakeClock()
    const schedule = createThrottle(300, c.now, c.sleep)
    const bad = schedule(async () => {
      c.starts.push(c.now())
      throw new Error('boom')
    }, { background: true })
    const bg = schedule(async () => void c.starts.push(c.now()), { background: true })
    const fg = schedule(async () => void c.starts.push(c.now()))
    await expect(bad).rejects.toThrow('boom')
    await Promise.all([bg, fg])
    expect(c.starts.slice(1).map((t, i) => t - c.starts[i])).toEqual([300, 300])
  })

  it('with maxConcurrent, a slow task does not hold back the next ones, and starts stay apart', async () => {
    const c = fakeClock()
    const schedule = createThrottle(300, c.now, c.sleep, 3)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const order: string[] = []
    const slow = schedule(async () => {
      c.starts.push(c.now())
      order.push('slow start')
      await gate
      order.push('slow end')
    })
    const quick = [1, 2].map((n) =>
      schedule(async () => {
        c.starts.push(c.now())
        order.push(`quick${n}`)
      }),
    )
    await Promise.all(quick)
    // 遅い1件が終わる前に、後ろの2件が終わっている。開始の間隔は 300 のまま
    expect(order).toEqual(['slow start', 'quick1', 'quick2'])
    expect(c.starts.slice(1).map((t, i) => t - c.starts[i])).toEqual([300, 300])
    release()
    await slow
  })

  it('with maxConcurrent, keeps at most that many running at once', async () => {
    const c = fakeClock()
    const schedule = createThrottle(10, c.now, c.sleep, 2)
    const gates: (() => void)[] = []
    let running = 0
    let peak = 0
    const jobs = [1, 2, 3, 4].map(() =>
      schedule(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise<void>((r) => gates.push(r))
        running--
      }),
    )
    for (let i = 0; i < 4; i++) {
      while (gates.length === 0) await new Promise((r) => setTimeout(r, 0))
      gates.shift()!()
    }
    await Promise.all(jobs)
    expect(peak).toBe(2)
  })

  it('runs an exclusive task alone: after everything before it finishes, and nothing starts until it ends', async () => {
    const c = fakeClock()
    const schedule = createThrottle(10, c.now, c.sleep, 3)
    const order: string[] = []
    let releaseRead!: () => void
    const readGate = new Promise<void>((r) => (releaseRead = r))
    let releaseWrite!: () => void
    const writeGate = new Promise<void>((r) => (releaseWrite = r))
    const read1 = schedule(async () => {
      order.push('read1 start')
      await readGate
      order.push('read1 end')
    })
    const write = schedule(
      async () => {
        order.push('write start')
        await writeGate
        order.push('write end')
      },
      { exclusive: true },
    )
    const read2 = schedule(async () => void order.push('read2'))
    // 書き込みは、前の読み込みが終わるまで始まらない
    await new Promise((r) => setTimeout(r, 0))
    expect(order).toEqual(['read1 start'])
    releaseRead()
    await read1
    await new Promise((r) => setTimeout(r, 0))
    // 書き込みの間は、あとの読み込みも始まらない
    expect(order).toEqual(['read1 start', 'read1 end', 'write start'])
    releaseWrite()
    await Promise.all([write, read2])
    expect(order).toEqual(['read1 start', 'read1 end', 'write start', 'write end', 'read2'])
  })

  it('keeps the existing call form working (no options means foreground)', async () => {
    const c = fakeClock()
    const schedule = createThrottle(100, c.now, c.sleep)
    await expect(schedule(async () => 'ok')).resolves.toBe('ok')
  })
})
