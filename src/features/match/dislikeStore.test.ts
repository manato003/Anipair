// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const remote = { value: null as unknown, sha: null as string | null }
const writes: { value: unknown; sha: string | null }[] = []

vi.mock('../../lib/github', async (orig) => ({
  ...(await orig<typeof import('../../lib/github')>()),
  readJson: vi.fn(async () => ({ ...remote })),
  writeJson: vi.fn(async (_c: unknown, _p: string, value: unknown, sha: string | null) => {
    writes.push({ value, sha })
    remote.value = value
    remote.sha = `sha${writes.length}`
  }),
}))

const conn = { token: 't', repo: 'me/anipair-data' }
const { readJson } = await import('../../lib/github')
const { loadLocalDislikes, setDislike, syncDislikes } = await import('./dislikeStore')

beforeEach(() => {
  localStorage.clear()
  remote.value = null
  remote.sha = null
  writes.length = 0
})

describe('setDislike', () => {
  it('keeps the name when turning an item off without one', () => {
    setDislike('person:5', true, { name: '悠木碧', now: new Date('2026-10-29T01:00:00Z') })
    setDislike('person:5', false, { now: new Date('2026-10-29T02:00:00Z') })
    expect(loadLocalDislikes().get('person:5')).toEqual({ at: '2026-10-29T02:00:00.000Z', active: false, name: '悠木碧' })
  })
})

describe('syncDislikes', () => {
  it('does not create dislikes.json when neither side has anything', async () => {
    await syncDislikes(conn)
    expect(readJson).toHaveBeenCalledWith(conn, 'dislikes.json')
    expect(writes).toHaveLength(0)
  })

  it('creates the file once something is picked, and takes picks from other devices', async () => {
    remote.value = { version: 1, items: { 'topic:harem': { at: '2026-10-29T00:00:00.000Z', active: true } } }
    remote.sha = 'other'
    setDislike('topic:ecchi', true, { now: new Date('2026-10-29T01:00:00Z') })
    const merged = await syncDislikes(conn)
    expect([...merged.keys()].sort()).toEqual(['topic:ecchi', 'topic:harem'])
    expect(writes).toHaveLength(1)
    expect(writes[0].sha).toBe('other')
    expect(loadLocalDislikes().has('topic:harem')).toBe(true)
  })
})
