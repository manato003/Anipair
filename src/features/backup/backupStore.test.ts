// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, MyReview } from '../../lib/annict'
import { GitHubError } from '../../lib/github'
import { setPass } from '../match/passStore'
import { setUnseen } from '../rate/unseenStore'

let library: LibraryEntry[] = []
let reviews = new Map<number, MyReview>()
let libraryGate: Promise<void> | null = null
const remote = { value: null as unknown, sha: null as string | null }
const writes: { value: unknown; sha: string | null; message: string }[] = []
let conflictsLeft = 0
let writeError: Error | null = null

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchLibrary: vi.fn(async () => {
    if (libraryGate) await libraryGate
    return library
  }),
}))
vi.mock('../../lib/myReviews', () => ({ refreshMyReviews: vi.fn(async () => reviews) }))

vi.mock('../../lib/github', async (orig) => ({
  ...(await orig<typeof import('../../lib/github')>()),
  readJson: vi.fn(async () => ({ ...remote })),
  writeJson: vi.fn(async (_c: unknown, _p: string, value: unknown, sha: string | null, message: string) => {
    if (writeError) throw writeError
    if (conflictsLeft > 0) {
      conflictsLeft--
      // 他の端末が先に書いた
      remote.value = { version: 1, app: 'animax', works: [], other: true }
      remote.sha = 'other'
      throw new GitHubError('conflict', 'conflict')
    }
    writes.push({ value, sha, message })
    remote.value = JSON.parse(JSON.stringify(value))
    remote.sha = `sha${writes.length}`
  }),
}))

const { fetchLibrary } = await import('../../lib/annict')
const { refreshMyReviews } = await import('../../lib/myReviews')
const { readJson, writeJson } = await import('../../lib/github')
const { BACKUP_INTERVAL_MS, isBackupDue, loadBackupStatus, parseBackupStatus, runBackup } = await import('./backupStore')

const conn = { token: 'g', repo: 'me/anipair-data' }

function entry(annictId: number, state: LibraryEntry['state']): LibraryEntry {
  return { workId: `W${annictId}`, annictId, title: `作品${annictId}`, malAnimeId: null, state, stateAt: '2026-09-01T00:00:00Z' }
}

function review(id: string): MyReview {
  return {
    id,
    body: '',
    createdAt: '2026-09-02T00:00:00Z',
    ratingOverallState: 'GOOD',
    ratingStoryState: null,
    ratingAnimationState: null,
    ratingMusicState: null,
    ratingCharacterState: null,
  }
}

beforeEach(() => {
  localStorage.clear()
  library = [entry(1, 'WATCHED'), entry(2, 'WANNA_WATCH')]
  reviews = new Map([[1, review('R1')]])
  libraryGate = null
  remote.value = null
  remote.sha = null
  writes.length = 0
  conflictsLeft = 0
  writeError = null
  vi.clearAllMocks()
})

describe('runBackup', () => {
  it('creates backup.json on the first run, with a message showing the counts', async () => {
    const result = await runBackup('a', conn, { now: new Date('2026-10-01T12:00:00Z') })
    expect(result).toEqual({ written: true, at: '2026-10-01T12:00:00.000Z', counts: { watched: 1, wanna: 1, watching: 0, other: 0, rated: 1 } })
    expect(writes).toHaveLength(1)
    expect(writes[0].sha).toBeNull()
    expect(writes[0].message).toBe('バックアップ（見た 1・見たい 1・評価 1）')
    expect(writes[0].value).toMatchObject({ version: 1, app: 'animax', works: [{ annictId: 1 }, { annictId: 2 }] })
  })

  it('reads and writes backup.json in the connected repository', async () => {
    const mine = { token: 'tk', repo: 'someone/their-data' }
    await runBackup('a', mine)
    expect(readJson).toHaveBeenCalledWith(mine, 'backup.json')
    expect(writeJson).toHaveBeenCalledWith(mine, 'backup.json', expect.anything(), null, expect.any(String))
  })

  it('reads the library and refreshes the shared reviews (incrementally) with the given token, and the local passes and unseen', async () => {
    setPass(10, true, { now: new Date('2026-09-30T01:00:00Z') })
    setUnseen(5, true, new Date('2026-09-30T02:00:00Z'))
    await runBackup('annict-token', conn)
    expect(fetchLibrary).toHaveBeenCalledWith('annict-token', { fresh: true })
    expect(refreshMyReviews).toHaveBeenCalledWith('annict-token')
    expect(writes[0].value).toMatchObject({
      passes: { passes: { '10': { active: true } } },
      unseen: { unseen: { '5': { active: true } } },
    })
  })

  it('does not write when the content is the same as the remote file', async () => {
    await runBackup('a', conn, { now: new Date('2026-10-01T12:00:00Z') })
    const again = await runBackup('a', conn, { now: new Date('2026-10-02T12:00:00Z') })
    expect(again.written).toBe(false)
    expect(again.at).toBe('2026-10-02T12:00:00.000Z')
    expect(writes).toHaveLength(1)
  })

  it('writes again when a state changed, using the remote sha', async () => {
    await runBackup('a', conn)
    library = [entry(1, 'WATCHED'), entry(2, 'WATCHING')]
    const again = await runBackup('a', conn)
    expect(again.written).toBe(true)
    expect(writes).toHaveLength(2)
    expect(writes[1].sha).toBe('sha1')
  })

  it('writes even when the same if forced', async () => {
    await runBackup('a', conn)
    expect((await runBackup('a', conn, { force: true })).written).toBe(true)
    expect(writes).toHaveLength(2)
  })

  it('re-reads and retries once on a conflict', async () => {
    remote.value = { version: 1, app: 'animax', works: [] }
    remote.sha = 'r0'
    conflictsLeft = 1
    const result = await runBackup('a', conn)
    expect(result.written).toBe(true)
    expect(readJson).toHaveBeenCalledTimes(2)
    // 2回目は、衝突で見えた他の端末の sha で書く
    expect(writes).toHaveLength(1)
    expect(writes[0].sha).toBe('other')
  })

  it('does not write on the retry when the other device already wrote the same content', async () => {
    // 1回目の書き込みの直前に、他の端末が同じ中身を書いた
    vi.mocked(writeJson).mockImplementationOnce(async (_c, _p, value) => {
      remote.value = JSON.parse(JSON.stringify(value))
      remote.sha = 'other'
      throw new GitHubError('conflict', 'conflict')
    })
    const result = await runBackup('a', conn)
    expect(result.written).toBe(false)
    expect(writes).toHaveLength(0)
  })

  it('gives up after a second conflict and records the error', async () => {
    conflictsLeft = 2
    await expect(runBackup('a', conn)).rejects.toThrow('conflict')
    expect(writeJson).toHaveBeenCalledTimes(2)
    expect(writes).toHaveLength(0)
    expect(loadBackupStatus().error).toBe('conflict')
  })

  it('records the last success time and whether it wrote', async () => {
    await runBackup('a', conn, { now: new Date('2026-10-01T12:00:00Z') })
    expect(loadBackupStatus()).toEqual({ lastAt: '2026-10-01T12:00:00.000Z', written: true, error: null })
    await runBackup('a', conn, { now: new Date('2026-10-02T12:00:00Z') })
    expect(loadBackupStatus()).toEqual({ lastAt: '2026-10-02T12:00:00.000Z', written: false, error: null })
  })

  it('records the error but keeps the last success, and clears the error on the next success', async () => {
    await runBackup('a', conn, { now: new Date('2026-10-01T12:00:00Z') })
    writeError = new GitHubError('GitHub のトークンが使えません。設定で入れ直してください', 'auth')
    library = [entry(1, 'WATCHING')]
    await expect(runBackup('a', conn, { now: new Date('2026-10-02T12:00:00Z') })).rejects.toThrow('トークンが使えません')
    expect(loadBackupStatus()).toEqual({ lastAt: '2026-10-01T12:00:00.000Z', written: true, error: 'GitHub のトークンが使えません。設定で入れ直してください' })
    writeError = null
    await runBackup('a', conn, { now: new Date('2026-10-03T12:00:00Z') })
    expect(loadBackupStatus()).toEqual({ lastAt: '2026-10-03T12:00:00.000Z', written: true, error: null })
  })

  it('records an Annict read failure too, without writing', async () => {
    vi.mocked(fetchLibrary).mockRejectedValueOnce(new Error('Annict に接続できませんでした'))
    await expect(runBackup('a', conn)).rejects.toThrow('Annict')
    expect(writes).toHaveLength(0)
    expect(loadBackupStatus()).toEqual({ lastAt: null, written: false, error: 'Annict に接続できませんでした' })
  })

  it('runs one at a time: a second call while running gets the same promise', async () => {
    let open!: () => void
    libraryGate = new Promise<void>((r) => (open = r))
    const first = runBackup('a', conn)
    const second = runBackup('a', conn)
    expect(second).toBe(first)
    open()
    await first
    expect(fetchLibrary).toHaveBeenCalledTimes(1)
    expect(writes).toHaveLength(1)
    // 終わったあとは、また動かせる
    libraryGate = null
    expect((await runBackup('a', conn)).written).toBe(false)
    expect(fetchLibrary).toHaveBeenCalledTimes(2)
  })

  it('does not hand a running backup to another account or repository: the new one runs after it, with its own token and repository', async () => {
    let open!: () => void
    libraryGate = new Promise<void>((r) => (open = r))
    const other = { token: 'g2', repo: 'me/other-data' }
    const first = runBackup('a', conn)
    const second = runBackup('b', other)
    expect(second).not.toBe(first)
    // 前のが終わるまでは、新しい相手の読み込みを始めない
    await Promise.resolve()
    expect(fetchLibrary).toHaveBeenCalledTimes(1)
    open()
    await Promise.all([first, second])
    expect(vi.mocked(fetchLibrary).mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
    expect(vi.mocked(readJson).mock.calls.map((c) => c[0])).toEqual([conn, other])
    // 新しい相手で動いている最中の頼みは、そちらと同じ結果
    libraryGate = new Promise<void>((r) => (open = r))
    const third = runBackup('b', other)
    expect(runBackup('b', other)).toBe(third)
    open()
    await third
  })

  it('allows a new run after a failed one', async () => {
    vi.mocked(fetchLibrary).mockRejectedValueOnce(new Error('boom'))
    await expect(runBackup('a', conn)).rejects.toThrow('boom')
    expect((await runBackup('a', conn)).written).toBe(true)
  })
})

describe('backup status', () => {
  it.each([null, 'x', [], {}, { lastAt: 'not a date', written: true, error: '' }])('treats %j as never run', (v) => {
    expect(parseBackupStatus(v)).toEqual({ lastAt: null, written: false, error: null })
  })

  it('keeps valid fields and drops broken ones', () => {
    expect(parseBackupStatus({ lastAt: '2026-10-01T12:00:00.000Z', written: 'yes', error: 5 })).toEqual({
      lastAt: '2026-10-01T12:00:00.000Z',
      written: false,
      error: null,
    })
  })

  it('is due when never run, and from 24 hours after the last success', () => {
    const now = new Date('2026-10-02T12:00:00Z')
    expect(isBackupDue(now)).toBe(true)
    const at = (ms: number) => JSON.stringify({ lastAt: new Date(now.getTime() - ms).toISOString(), written: true, error: null })
    localStorage.setItem('animax.backup', at(BACKUP_INTERVAL_MS - 1))
    expect(isBackupDue(now)).toBe(false)
    localStorage.setItem('animax.backup', at(BACKUP_INTERVAL_MS))
    expect(isBackupDue(now)).toBe(true)
  })

  it('is still due after only failures (no success time)', () => {
    localStorage.setItem('animax.backup', JSON.stringify({ lastAt: null, written: false, error: 'x' }))
    expect(isBackupDue(new Date())).toBe(true)
  })
})
