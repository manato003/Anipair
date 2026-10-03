import { describe, expect, it, vi } from 'vitest'
import { emitAnnictAuthFailed, onAnnictAuthFailed } from './authEvents'

describe('authEvents', () => {
  it('tells every listener which token failed, until it unsubscribes', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onAnnictAuthFailed(a)
    const offB = onAnnictAuthFailed(b)
    emitAnnictAuthFailed('tok')
    expect(a).toHaveBeenCalledWith('tok')
    expect(b).toHaveBeenCalledWith('tok')
    offA()
    emitAnnictAuthFailed('tok2')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
    offB()
    emitAnnictAuthFailed('tok3')
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('does not let one failing listener stop the others', () => {
    const after = vi.fn()
    const off1 = onAnnictAuthFailed(() => {
      throw new Error('listener bug')
    })
    const off2 = onAnnictAuthFailed(after)
    expect(() => emitAnnictAuthFailed('t')).not.toThrow()
    expect(after).toHaveBeenCalledOnce()
    off1()
    off2()
  })
})
