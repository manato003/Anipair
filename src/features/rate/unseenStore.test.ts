// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubError } from '../../lib/github'

const remote = { value: null as unknown, sha: null as string | null }
const writes: { path: string; value: unknown; sha: string | null; message: string }[] = []
const reads: string[] = []
let conflictsLeft = 0

vi.mock('../../lib/github', async (orig) => ({
  ...(await orig<typeof import('../../lib/github')>()),
  readJson: vi.fn(async (_c: unknown, path: string) => {
    reads.push(path)
    return { ...remote }
  }),
  writeJson: vi.fn(async (_c: unknown, path: string, value: unknown, sha: string | null, message: string) => {
    if (conflictsLeft > 0) {
      conflictsLeft--
      remote.value = { version: 1, unseen: { '77': { at: '2026-09-29T09:00:00.000Z', active: true } } }
      remote.sha = 'other'
      throw new GitHubError('conflict', 'conflict')
    }
    writes.push({ path, value, sha, message })
    remote.value = value
    remote.sha = `sha${writes.length}`
  }),
}))

const conn = { token: 't', repo: 'me/anipair-data' }

const { readJson, writeJson } = await import('../../lib/github')
const { loadLocalUnseen, setUnseen, syncUnseen } = await import('./unseenStore')

beforeEach(() => {
  localStorage.clear()
  remote.value = null
  remote.sha = null
  writes.length = 0
  reads.length = 0
  conflictsLeft = 0
})

describe('local records', () => {
  it('moves the old array once: written under the new key with the epoch date, then the old key is removed', () => {
    localStorage.setItem('animax.backfill.skipped', JSON.stringify([4, 9, 'x', 0]))
    const first = loadLocalUnseen()
    expect([...first.keys()]).toEqual([4, 9])
    expect(first.get(4)).toEqual({ at: '1970-01-01T00:00:00.000Z', active: true })
    expect(localStorage.getItem('animax.backfill.skipped')).toBeNull()
    expect(JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen['9']).toEqual({ at: '1970-01-01T00:00:00.000Z', active: true })
    // 2回目以降は新しい控えを読むだけ
    expect([...loadLocalUnseen().keys()]).toEqual([4, 9])
  })

  it('keeps an existing new record over the same work in the old array', () => {
    localStorage.setItem('animax.backfill.unseen', JSON.stringify({ version: 1, unseen: { '4': { at: '2026-09-30T00:00:00.000Z', active: false } } }))
    localStorage.setItem('animax.backfill.skipped', JSON.stringify([4, 5]))
    const merged = loadLocalUnseen()
    expect(merged.get(4)).toEqual({ at: '2026-09-30T00:00:00.000Z', active: false })
    expect(merged.get(5)?.active).toBe(true)
  })

  it('an undo after the move wins over the moved entry', () => {
    localStorage.setItem('animax.backfill.skipped', JSON.stringify([4]))
    setUnseen(4, false)
    expect(loadLocalUnseen().get(4)?.active).toBe(false)
  })
})

describe('syncUnseen', () => {
  it('reads and writes in the connected repository', async () => {
    const mine = { token: 'tk', repo: 'someone/their-data' }
    setUnseen(10, true, new Date('2026-09-30T01:00:00Z'))
    await syncUnseen(mine)
    expect(readJson).toHaveBeenCalledWith(mine, 'unseen.json')
    expect(writeJson).toHaveBeenCalledWith(mine, 'unseen.json', expect.anything(), null, expect.any(String))
  })

  it('uses its own file (unseen.json), not passes.json', async () => {
    setUnseen(10, true, new Date('2026-09-30T01:00:00Z'))
    await syncUnseen(conn)
    expect(reads).toEqual(['unseen.json'])
    expect(writes).toHaveLength(1)
    expect(writes[0].path).toBe('unseen.json')
    expect(writes[0].sha).toBeNull()
    expect(writes[0].value).toEqual({ version: 1, unseen: { '10': { at: '2026-09-30T01:00:00.000Z', active: true } } })
    expect(writes[0].message).toContain('見てない')
  })

  it('merges the other device with this one and saves the result on both sides', async () => {
    remote.value = { version: 1, unseen: { '20': { at: '2026-09-20T00:00:00.000Z', active: true } } }
    remote.sha = 'r1'
    setUnseen(10, true, new Date('2026-09-30T01:00:00Z'))
    await syncUnseen(conn)
    expect(writes[0].sha).toBe('r1')
    expect([...loadLocalUnseen().keys()].sort()).toEqual([10, 20])
  })

  it('does not write when nothing changed', async () => {
    remote.value = { version: 1, unseen: { '20': { at: '2026-09-20T00:00:00.000Z', active: true } } }
    remote.sha = 'r1'
    await syncUnseen(conn)
    expect(writes).toHaveLength(0)
  })

  it('an undo on one device beats the older mark on another', async () => {
    remote.value = { version: 1, unseen: { '20': { at: '2026-09-20T00:00:00.000Z', active: true } } }
    remote.sha = 'r1'
    setUnseen(20, false, new Date('2026-09-25T00:00:00Z'))
    const merged = await syncUnseen(conn)
    expect(merged.get(20)?.active).toBe(false)
    expect((writes[0].value as { unseen: Record<string, { active: boolean }> }).unseen['20'].active).toBe(false)
  })

  it('retries on a conflict and then gives up after repeated ones', async () => {
    remote.sha = 'r0'
    conflictsLeft = 1
    setUnseen(10, true, new Date('2026-09-30T01:00:00Z'))
    await syncUnseen(conn)
    expect(writes[0].sha).toBe('other')
    expect([...loadLocalUnseen().keys()].sort()).toEqual([10, 77])
    conflictsLeft = 5
    setUnseen(11, true)
    await expect(syncUnseen(conn)).rejects.toThrow(/衝突/)
  })
})
