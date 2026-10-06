// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { AnnictWork, LibraryEntry } from './annict'
import { loadStoredLibrary, loadStoredSeasonWorks, parseStoredLibrary, patchStoredStatus, saveStoredLibrary, saveStoredSeasonWorks, storedAtLabel } from './offlineCache'
import { saveAnnictToken } from './storage'

const entry = (n: number, state: LibraryEntry['state'] = 'WANNA_WATCH'): LibraryEntry => ({
  workId: `W${n}`,
  annictId: n,
  title: `作品${n}`,
  malAnimeId: null,
  state,
  stateAt: '2026-10-01T00:00:00.000Z',
  seasonYear: 2026,
  seasonName: 'AUTUMN',
  media: 'TV',
  watchersCount: 10,
  imageUrl: null,
  nextEpisode: null,
})
const work = (n: number): AnnictWork => ({ id: `W${n}`, annictId: n, title: `作品${n}`, media: 'TV', malAnimeId: null, watchersCount: 10, viewerStatusState: 'NO_STATE', imageUrl: null })

beforeEach(() => {
  localStorage.clear()
})

describe('offlineCache', () => {
  it('keeps the library with the time it was read, and drops broken entries', () => {
    saveStoredLibrary([entry(1), entry(2, 'WATCHED')], new Date('2026-10-06T03:30:00.000Z'))
    const lib = loadStoredLibrary()!
    expect(lib.at).toBe('2026-10-06T03:30:00.000Z')
    expect(lib.value.map((e) => [e.workId, e.state])).toEqual([
      ['W1', 'WANNA_WATCH'],
      ['W2', 'WATCHED'],
    ])
    expect(parseStoredLibrary({ v: 1, at: '2026-10-06T00:00:00Z', entries: [entry(1), { workId: 'x' }, { ...entry(3), state: 'BAD' }] })!.value.map((e) => e.workId)).toEqual(['W1'])
    expect(parseStoredLibrary({ v: 2 })).toBeNull()
  })

  it('follows a successful status change in both the library and the season works, so answered works do not come back', () => {
    saveStoredLibrary([entry(1), entry(2)])
    saveStoredSeasonWorks('2026-autumn', [work(1), work(2)])
    patchStoredStatus('W1', 'WATCHED', new Date('2026-10-06T00:00:00.000Z'))
    patchStoredStatus('W2', 'NO_STATE')
    expect(loadStoredLibrary()!.value.map((e) => [e.workId, e.state, e.stateAt])).toEqual([['W1', 'WATCHED', '2026-10-06T00:00:00.000Z']])
    expect(loadStoredSeasonWorks('2026-autumn')!.value.map((w) => [w.id, w.viewerStatusState])).toEqual([
      ['W1', 'WATCHED'],
      ['W2', 'NO_STATE'],
    ])
  })

  it('keeps the 12 seasons read last', () => {
    for (let i = 0; i < 13; i++) saveStoredSeasonWorks(`20${10 + i}-spring`, [work(i)], new Date(Date.UTC(2026, 0, 1 + i)))
    expect(loadStoredSeasonWorks('2010-spring')).toBeNull()
    expect(loadStoredSeasonWorks('2022-spring')).not.toBeNull()
  })

  it('is forgotten when the account changes', () => {
    saveAnnictToken('one')
    saveStoredLibrary([entry(1)])
    saveStoredSeasonWorks('2026-autumn', [work(1)])
    saveAnnictToken('two')
    expect(loadStoredLibrary()).toBeNull()
    expect(loadStoredSeasonWorks('2026-autumn')).toBeNull()
  })

  it('names the time of the last read', () => {
    expect(storedAtLabel(new Date(2026, 9, 6, 12, 5).toISOString())).toBe('10/6 12:05')
  })
})
