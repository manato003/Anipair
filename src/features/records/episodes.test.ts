import { describe, expect, it } from 'vitest'
import type { Episode } from '../../lib/annict'
import { episodeLabel, episodeProgress, episodesLeft, episodeWindow, nextEpisode, nextLabel } from './episodes'

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

describe('nextLabel', () => {
  it('names the next episode with its title, and without it when there is none or it repeats the label', () => {
    expect(nextLabel({ number: 5, numberText: '第5話', title: '旅立ち' })).toBe('次は 第5話「旅立ち」')
    expect(nextLabel({ number: 5, numberText: null, title: null })).toBe('次は 第5話')
    expect(nextLabel({ number: null, numberText: null, title: '前編' })).toBe('次は 前編')
  })
})

describe('episodesLeft', () => {
  it('counts from the next episode to the last, and the ones before it as done', () => {
    expect(episodesLeft([ep(1, true), ep(2, true), ep(3), ep(4)])).toEqual({ left: 2, done: 2, total: 4 })
    // 途中を飛ばしても、いちばん先まで見た話の次から
    expect(episodesLeft([ep(1, true), ep(2), ep(3, true), ep(4)])).toEqual({ left: 1, done: 3, total: 4 })
    expect(episodesLeft([ep(1, true), ep(2, true)])).toEqual({ left: 0, done: 2, total: 2 })
    expect(episodesLeft([ep(1), ep(2)])).toEqual({ left: 2, done: 0, total: 2 })
  })
})
