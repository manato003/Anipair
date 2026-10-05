import { describe, expect, it } from 'vitest'
import type { Episode } from '../../lib/annict'
import { episodeLabel, episodeProgress, episodeWindow, nextEpisode } from './episodes'

const ep = (n: number, tracked = false, extra: Partial<Episode> = {}): Episode => ({
  id: `E${n}`,
  annictId: n,
  number: n,
  numberText: `#${n}`,
  title: `題${n}`,
  viewerDidTrack: tracked,
  viewerRecordsCount: tracked ? 1 : 0,
  ...extra,
})

describe('episodeLabel', () => {
  it('prefers the Annict label, then the number, then the title', () => {
    expect(episodeLabel(ep(6))).toBe('#6')
    expect(episodeLabel(ep(6, false, { numberText: null }))).toBe('第6話')
    expect(episodeLabel(ep(6, false, { numberText: ' ', number: null }))).toBe('題6')
    expect(episodeLabel(ep(6, false, { numberText: null, number: null, title: null }))).toBe('話')
  })
})

describe('nextEpisode and episodeProgress', () => {
  it('is the first episode when nothing is recorded yet', () => {
    const list = [ep(1), ep(2), ep(3)]
    expect(nextEpisode(list)?.id).toBe('E1')
    expect(episodeProgress(list)).toEqual({ tracked: 0, total: 3 })
  })

  it('is the one after the furthest recorded episode, even when some were skipped', () => {
    const list = [ep(1, true), ep(2), ep(3, true), ep(4), ep(5)]
    expect(nextEpisode(list)?.id).toBe('E4')
    expect(episodeProgress(list)).toEqual({ tracked: 2, total: 5 })
  })

  it('is null when the last episode is recorded', () => {
    expect(nextEpisode([ep(1, true), ep(2, true)])).toBeNull()
    expect(nextEpisode([])).toBeNull()
  })
})

describe('episodeWindow', () => {
  const long = Array.from({ length: 100 }, (_, i) => ep(i + 1, i < 60))

  it('starts a few episodes before the next one', () => {
    expect(episodeWindow(long, 40)).toEqual({ start: 55, end: 95 })
  })

  it('stays inside the list at both ends', () => {
    expect(episodeWindow(long.slice(0, 10), 40)).toEqual({ start: 0, end: 10 })
    const done = long.map((e) => ({ ...e, viewerDidTrack: true }))
    expect(episodeWindow(done, 40)).toEqual({ start: 60, end: 100 })
  })
})
