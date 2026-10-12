import { afterEach, describe, expect, it, vi } from 'vitest'

const fetchMyRecordsPage = vi.fn()
vi.mock('./annict', () => ({ fetchMyRecordsPage: (...a: unknown[]) => fetchMyRecordsPage(...a) }))
const { findPastRecord, forgetPastRecords } = await import('./pastRecords')

const rec = (episodeId: string, rating: string | null, createdAt: string) => ({ episodeId, rating, createdAt })

afterEach(() => {
  forgetPastRecords()
  fetchMyRecordsPage.mockReset()
})

describe('findPastRecord', () => {
  it('returns the newest record of the episode, reading pages only until it is found, and reuses what it read', async () => {
    fetchMyRecordsPage
      .mockResolvedValueOnce({ records: [rec('E9', 'GOOD', '2026-10-01'), rec('E1', 'GREAT', '2026-09-30')], next: 'c1' })
      .mockResolvedValueOnce({ records: [rec('E2', 'BAD', '2026-09-01'), rec('E1', 'AVERAGE', '2026-08-01')], next: null })
    expect(await findPastRecord('t', 'E1')).toEqual({ rating: 'GREAT', createdAt: '2026-09-30' })
    expect(fetchMyRecordsPage).toHaveBeenCalledTimes(1)
    expect(await findPastRecord('t', 'E2')).toEqual({ rating: 'BAD', createdAt: '2026-09-01' })
    expect(fetchMyRecordsPage).toHaveBeenLastCalledWith('t', 'c1')
    // 読み終えたら、無い話は読み直さずに null
    expect(await findPastRecord('t', 'E5')).toBeNull()
    expect(fetchMyRecordsPage).toHaveBeenCalledTimes(2)
  })

  it('stops after a few pages, so old records are left to Annict', async () => {
    fetchMyRecordsPage.mockImplementation(async () => ({ records: [rec('EX', 'GOOD', '2026-01-01')], next: 'more' }))
    expect(await findPastRecord('t', 'E1')).toBeNull()
    expect(fetchMyRecordsPage).toHaveBeenCalledTimes(6)
  })

  it('reads again after forgetting (a record was made or undone), and per token', async () => {
    fetchMyRecordsPage.mockResolvedValue({ records: [rec('E1', 'GOOD', '2026-10-01')], next: null })
    await findPastRecord('t', 'E1')
    forgetPastRecords()
    await findPastRecord('t', 'E1')
    await findPastRecord('other', 'E1')
    expect(fetchMyRecordsPage).toHaveBeenCalledTimes(3)
  })
})
