import { describe, expect, it } from 'vitest'
import { parseRetryAfter } from './retry'

describe('parseRetryAfter', () => {
  it('reads seconds from the header', () => {
    expect(parseRetryAfter('3', 5000, 30_000)).toBe(3000)
    expect(parseRetryAfter('0', 5000, 30_000)).toBe(0)
    expect(parseRetryAfter('1.5', 5000, 30_000)).toBe(1500)
  })

  it('uses the default when the header is missing or not a number', () => {
    expect(parseRetryAfter(null, 5000, 30_000)).toBe(5000)
    expect(parseRetryAfter('', 5000, 30_000)).toBe(5000)
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', 5000, 30_000)).toBe(5000)
    expect(parseRetryAfter('-4', 5000, 30_000)).toBe(5000)
  })

  it('caps the wait', () => {
    expect(parseRetryAfter('120', 5000, 30_000)).toBe(30_000)
    expect(parseRetryAfter(null, 60_000, 30_000)).toBe(30_000)
  })
})
