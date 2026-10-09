import { describe, expect, it } from 'vitest'
import { formatRemaining } from './useRemaining'

describe('formatRemaining', () => {
  it('rounds to 10 seconds under a minute and to minutes above, and says soon at the very end', () => {
    expect(formatRemaining(4)).toBe('もうすぐ終わります')
    expect(formatRemaining(11)).toBe('残り約20秒')
    expect(formatRemaining(59)).toBe('残り約60秒')
    expect(formatRemaining(60)).toBe('残り約1分')
    expect(formatRemaining(150)).toBe('残り約3分')
  })
})
