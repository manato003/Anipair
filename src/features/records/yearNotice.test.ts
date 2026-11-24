import { describe, expect, it } from 'vitest'
import { yearNoticeFor } from './yearNotice'

describe('yearNoticeFor: the year-end review notice', () => {
  const dec = new Date(2026, 11, 3)

  it('tells the year in December when the year has watched anime and the notice is not done', () => {
    expect(yearNoticeFor(dec, [2026, 2025], null)).toBe(2026)
    // 前の年に済ませていても、今年は出す
    expect(yearNoticeFor(dec, [2026], 2025)).toBe(2026)
  })

  it('stays quiet outside December, without anime watched this year, or once done this year', () => {
    expect(yearNoticeFor(new Date(2026, 10, 30), [2026], null)).toBeNull()
    expect(yearNoticeFor(new Date(2027, 0, 1), [2026], null)).toBeNull()
    expect(yearNoticeFor(dec, [2025], null)).toBeNull()
    expect(yearNoticeFor(dec, [], null)).toBeNull()
    expect(yearNoticeFor(dec, [2026], 2026)).toBeNull()
  })
})
