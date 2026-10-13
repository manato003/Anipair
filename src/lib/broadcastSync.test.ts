// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// GitHub の broadcast.json（ネットワークに出さない）
let remote: unknown = null
const written: unknown[] = []
vi.mock('./github', async (orig) => ({
  ...(await orig<typeof import('./github')>()),
  readJson: vi.fn(async () => ({ value: remote, sha: remote ? 'sha' : null })),
  writeJson: vi.fn(async (_c: unknown, _p: string, value: unknown) => void written.push(value)),
}))

const { resetBroadcastPrefs, setBroadcastPrefs, syncBroadcastPrefs } = await import('./broadcast')
const conn = { token: 'g', repo: 'me/data' } as never

beforeEach(() => {
  localStorage.clear()
  resetBroadcastPrefs()
  remote = null
  written.length = 0
})

// 見るサービスは、選んだ時刻の新しい方を採る（PC で選んだものがスマホにも出る）
describe('syncBroadcastPrefs', () => {
  it('takes the other device’s newer choice', async () => {
    setBroadcastPrefs({ services: ['netflix'], region: null, satellites: [] }, new Date('2026-10-01T00:00:00Z'))
    remote = { version: 1, services: ['danime'], region: '関東', satellites: [], at: '2026-10-10T00:00:00.000Z' }
    const merged = await syncBroadcastPrefs(conn)
    expect(merged).toMatchObject({ services: ['danime'], region: '関東' })
    expect(written).toEqual([])
  })

  it('writes this device’s newer choice', async () => {
    remote = { version: 1, services: ['danime'], region: null, satellites: [], at: '2026-10-01T00:00:00.000Z' }
    setBroadcastPrefs({ services: ['abema'], region: null, satellites: ['bs'] }, new Date('2026-10-10T00:00:00Z'))
    await syncBroadcastPrefs(conn)
    expect(written).toEqual([{ version: 1, services: ['abema'], region: null, satellites: ['bs'], at: '2026-10-10T00:00:00.000Z' }])
  })
})
