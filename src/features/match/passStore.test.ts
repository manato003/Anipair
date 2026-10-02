// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubError } from '../../lib/github'

const remote = { value: null as unknown, sha: null as string | null }
const writes: { value: unknown; sha: string | null }[] = []
let conflictsLeft = 0

vi.mock('../../lib/github', async (orig) => ({
  ...(await orig<typeof import('../../lib/github')>()),
  readJson: vi.fn(async () => ({ ...remote })),
  writeJson: vi.fn(async (_c: unknown, _p: string, value: unknown, sha: string | null) => {
    if (conflictsLeft > 0) {
      conflictsLeft--
      // 他の端末が先に書いた
      remote.value = { version: 1, passes: { '77': { at: '2026-09-29T09:00:00.000Z', active: true } } }
      remote.sha = 'other'
      throw new GitHubError('conflict', 'conflict')
    }
    writes.push({ value, sha })
    remote.value = value
    remote.sha = `sha${writes.length}`
  }),
}))

const conn = { token: 't', repo: 'me/anipair-data' }

const { readJson, writeJson } = await import('../../lib/github')
const { loadLocalPasses, setPass, syncPasses } = await import('./passStore')

beforeEach(() => {
  localStorage.clear()
  remote.value = null
  remote.sha = null
  writes.length = 0
  conflictsLeft = 0
})

describe('syncPasses', () => {
  it('reads and writes passes.json in the connected repository', async () => {
    const mine = { token: 'tk', repo: 'someone/their-data' }
    setPass(10, true, { now: new Date('2026-09-30T01:00:00Z') })
    await syncPasses(mine)
    expect(readJson).toHaveBeenCalledWith(mine, 'passes.json')
    expect(writeJson).toHaveBeenCalledWith(mine, 'passes.json', expect.anything(), null, expect.any(String))
  })

  it('creates the file on first sync and uploads what this device has', async () => {
    setPass(10, true, { now: new Date('2026-09-30T01:00:00Z') })
    const merged = await syncPasses(conn)
    expect([...merged.keys()]).toEqual([10])
    expect(writes).toHaveLength(1)
    expect(writes[0].sha).toBeNull()
  })

  it('merges the other device and this device, and saves the result on both sides', async () => {
    remote.value = { version: 1, passes: { '20': { at: '2026-09-20T00:00:00.000Z', active: true } } }
    remote.sha = 'r1'
    setPass(10, true, { now: new Date('2026-09-30T01:00:00Z') })
    await syncPasses(conn)
    expect(writes[0].sha).toBe('r1')
    expect([...loadLocalPasses().keys()].sort()).toEqual([10, 20])
  })

  it('does not write when nothing changed', async () => {
    remote.value = { version: 1, passes: { '20': { at: '2026-09-20T00:00:00.000Z', active: true } } }
    remote.sha = 'r1'
    await syncPasses(conn)
    expect(writes).toHaveLength(0)
    expect([...loadLocalPasses().keys()]).toEqual([20])
  })

  it('re-reads and merges again when another device wrote first', async () => {
    remote.sha = 'r0'
    conflictsLeft = 1
    setPass(10, true, { now: new Date('2026-09-30T01:00:00Z') })
    await syncPasses(conn)
    expect(writes).toHaveLength(1)
    expect(writes[0].sha).toBe('other')
    expect([...loadLocalPasses().keys()].sort()).toEqual([10, 77])
  })

  it('gives up after repeated conflicts', async () => {
    remote.sha = 'r0'
    conflictsLeft = 5
    setPass(10, true)
    await expect(syncPasses(conn)).rejects.toThrow(/衝突/)
  })
})
