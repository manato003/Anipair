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
})
