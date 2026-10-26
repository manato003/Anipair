import { describe, expect, it, vi } from 'vitest'
import type { RecordRow } from '../records/recordList'
import { parseTable, viewOf, type TierTable } from './tierList'
import { createShare, deleteShare, fetchShared, isStale, sharedIdOf, sharedPayload, updateShare } from './tierShare'

const row = (annictId: number, mal: string | null): RecordRow =>
  ({ entry: { annictId, malAnimeId: mal, state: 'WATCHED', stateAt: '2026-10-01T00:00:00Z', seasonYear: 2026, seasonName: 'AUTUMN' }, review: null }) as unknown as RecordRow

const TABLE: TierTable = {
  id: 'abc',
  title: '秋アニメ',
  scope: { kind: 'all' },
  includeDropped: false,
  tiers: [
    { name: 'S', items: [1, 2] },
    { name: 'A', items: [3, 99] },
  ],
  updatedAt: '2026-10-25T00:00:00.000Z',
}

const SHARE = { id: 'Ab3dEf7hIj', key: 'k'.repeat(43), at: '2026-10-25T00:00:00.000Z' }

describe('sharedPayload', () => {
  it('sends MyAnimeList ids of the visible placed anime and counts the ones without an id', () => {
    const rows = [row(1, '100'), row(2, null), row(3, '300')]
    const { payload, skipped } = sharedPayload(TABLE, viewOf(TABLE, rows))
    // 99 は範囲の外（記録に無い）なので送らない
    expect(payload).toEqual({ title: '秋アニメ', tiers: [{ name: 'S', items: [100] }, { name: 'A', items: [300] }] })
    expect(skipped).toBe(1)
  })

  it('sends a MyAnimeList id shared by two Annict works only once, in the higher tier', () => {
    const rows = [row(1, '100'), row(2, '200'), row(3, '100')]
    const { payload } = sharedPayload(TABLE, viewOf(TABLE, rows))
    expect(payload.tiers.map((x) => x.items)).toEqual([[100, 200], []])
  })
})

describe('isStale', () => {
  it('is true only when the table changed after the link was sent', () => {
    expect(isStale(TABLE)).toBe(false)
    expect(isStale({ ...TABLE, share: SHARE })).toBe(false)
    expect(isStale({ ...TABLE, share: SHARE, updatedAt: '2026-10-25T00:00:01.000Z' })).toBe(true)
  })
})

describe('sharedIdOf', () => {
  it('reads the id only from /t/<10 letters>', () => {
    expect(sharedIdOf('/t/Ab3dEf7hIj')).toBe('Ab3dEf7hIj')
    expect(sharedIdOf('/t/Ab3dEf7hIj/')).toBe('Ab3dEf7hIj')
    expect(sharedIdOf('/t/short')).toBeNull()
    expect(sharedIdOf('/')).toBeNull()
  })
})

describe('parseTable keeps the share link', () => {
  it('keeps a valid link and drops a broken one', () => {
    expect(parseTable({ ...TABLE, share: SHARE })?.share).toEqual(SHARE)
    expect(parseTable({ ...TABLE, share: { ...SHARE, id: '../x' } })?.share).toBeUndefined()
  })
})

describe('share API', () => {
  const payload = { title: 'x', tiers: [{ name: 'S', items: [1] }, { name: 'A', items: [] }] }

  it('creates a link and remembers the key', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ id: SHARE.id, key: SHARE.key }), { status: 201 }))
    const r = await createShare(payload, new Date(SHARE.at), fetchFn as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, value: SHARE })
    expect(fetchFn).toHaveBeenCalledWith('/api/tier', expect.objectContaining({ method: 'POST' }))
  })

  it('sends the key when updating, and reports a link that is gone', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 404 }))
    const r = await updateShare(SHARE, payload, new Date(), fetchFn as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.missing).toBe(true)
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/tier?id=${SHARE.id}`)
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SHARE.key}`)
  })

  it('treats deleting a missing link as done', async () => {
    const r = await deleteShare(SHARE, (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch)
    expect(r.ok).toBe(true)
  })

  it('reads a shared table and drops broken items', async () => {
    const body = { title: 't', tiers: [{ name: 'S', items: [1, -1, 'x'] }, null] }
    const r = await fetchShared(SHARE.id, (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, value: { title: 't', tiers: [{ name: 'S', items: [1] }] } })
  })

  it('says the table was not found on 404', async () => {
    const r = await fetchShared(SHARE.id, (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.missing).toBe(true)
  })
})
