// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GithubConnection } from '../../lib/github'

vi.mock('./backupStore', async (orig) => ({
  ...(await orig<typeof import('./backupStore')>()),
  runBackup: vi.fn(async () => ({ written: true, at: '', counts: { watched: 0, wanna: 0, watching: 0, other: 0, rated: 0 } })),
}))

const { runBackup } = await import('./backupStore')
const { AUTO_BACKUP_DELAY_MS, useAutoBackup } = await import('./useAutoBackup')

const conn = { token: 'g', repo: 'me/anipair-data' }
const NOW = new Date('2026-10-02T12:00:00Z')

function setLast(msAgo: number | null) {
  if (msAgo === null) localStorage.removeItem('animax.backup')
  else localStorage.setItem('animax.backup', JSON.stringify({ lastAt: new Date(NOW.getTime() - msAgo).toISOString(), written: true, error: null }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const HOUR = 60 * 60 * 1000

describe('useAutoBackup', () => {
  it('starts a backup about 15 s after start when both tokens exist and none was taken yet', () => {
    renderHook(() => useAutoBackup('a', conn))
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS - 1)
    expect(runBackup).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(runBackup).toHaveBeenCalledTimes(1)
    expect(runBackup).toHaveBeenCalledWith('a', conn)
  })

  it('starts when the last success is 24 hours old, not before', () => {
    setLast(24 * HOUR - AUTO_BACKUP_DELAY_MS)
    // 15秒待つと、ちょうど24時間になる
    renderHook(() => useAutoBackup('a', conn))
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS)
    expect(runBackup).toHaveBeenCalledTimes(1)
    cleanup()
    vi.clearAllMocks()
    setLast(23 * HOUR)
    renderHook(() => useAutoBackup('a', conn))
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS * 2)
    expect(runBackup).not.toHaveBeenCalled()
  })

  it.each([
    ['no Annict token', null, conn],
    ['no GitHub connection', 'a', null],
  ])('does nothing with %s', (_name, annict, github) => {
    renderHook(() => useAutoBackup(annict, github))
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS * 4)
    expect(runBackup).not.toHaveBeenCalled()
  })

  it('does nothing when it stopped being due while waiting (a manual backup in between)', () => {
    renderHook(() => useAutoBackup('a', conn))
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS - 1000)
    setLast(0)
    vi.advanceTimersByTime(1000)
    expect(runBackup).not.toHaveBeenCalled()
  })

  it('cancels the wait when it unmounts', () => {
    const { unmount } = renderHook(() => useAutoBackup('a', conn))
    unmount()
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS * 2)
    expect(runBackup).not.toHaveBeenCalled()
  })

  it('restarts the wait with the new tokens when they change, and never uses the old ones', () => {
    const g1 = { token: 'g1', repo: 'me/anipair-data' }
    const { rerender } = renderHook((p: { a: string | null; g: GithubConnection | null }) => useAutoBackup(p.a, p.g), { initialProps: { a: 'a1', g: g1 } })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS - 1000)
    rerender({ a: 'a2', g: g1 })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS - 1000)
    expect(runBackup).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(runBackup).toHaveBeenCalledTimes(1)
    expect(runBackup).toHaveBeenCalledWith('a2', g1)
  })

  it('restarts the wait with the new repository when it changes, and never uses the old one', () => {
    const old = { token: 'g', repo: 'me/old-data' }
    const next = { token: 'g', repo: 'me/new-data' }
    const { rerender } = renderHook((p: { g: GithubConnection | null }) => useAutoBackup('a', p.g), { initialProps: { g: old } })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS - 1000)
    rerender({ g: next })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS)
    expect(runBackup).toHaveBeenCalledTimes(1)
    expect(runBackup).toHaveBeenCalledWith('a', next)
  })

  it('does not start when the GitHub connection is removed during the wait', () => {
    const { rerender } = renderHook((p: { a: string | null; g: GithubConnection | null }) => useAutoBackup(p.a, p.g), { initialProps: { a: 'a', g: conn as GithubConnection | null } })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS - 1000)
    rerender({ a: 'a', g: null })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS * 2)
    expect(runBackup).not.toHaveBeenCalled()
  })

  it('does not run twice in one session, even after a failure and a token change', async () => {
    vi.mocked(runBackup).mockRejectedValueOnce(new Error('失敗'))
    const { rerender } = renderHook((p: { a: string }) => useAutoBackup(p.a, conn), { initialProps: { a: 'a1' } })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS)
    expect(runBackup).toHaveBeenCalledTimes(1)
    // 失敗しても、未処理の拒否にならない
    await vi.advanceTimersByTimeAsync(0)
    rerender({ a: 'a2' })
    vi.advanceTimersByTime(AUTO_BACKUP_DELAY_MS * 4)
    expect(runBackup).toHaveBeenCalledTimes(1)
  })
})
