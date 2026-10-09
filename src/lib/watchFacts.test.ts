import { describe, expect, it } from 'vitest'
import { bingeMinutes, episodeFacts, formatMinutes } from './watchFacts'

describe('formatMinutes', () => {
  it('writes hours and minutes, approximately', () => {
    expect(formatMinutes(672)).toBe('約11時間12分')
    expect(formatMinutes(24)).toBe('約24分')
    expect(formatMinutes(120)).toBe('約2時間')
  })
})

describe('episodeFacts', () => {
  it('a finished TV series: the episode count and the time to watch it all', () => {
    expect(episodeFacts({ format: 'TV', status: 'FINISHED', episodes: 28, duration: 24 })).toEqual(['全28話', '一気見 約11時間12分'])
  })

  it('an airing series: how far it has aired, and no binge time (not all episodes are out)', () => {
    expect(episodeFacts({ format: 'TV', status: 'RELEASING', episodes: 12, episodesAired: 5, duration: 24 })).toEqual(['放送中（第5話まで）', '全12話'])
    expect(bingeMinutes({ format: 'TV', status: 'RELEASING', episodes: 12, duration: 24 })).toBeNull()
  })

  it('a movie: only its running time', () => {
    expect(episodeFacts({ format: 'MOVIE', status: 'FINISHED', episodes: 1, duration: 115 })).toEqual(['上映 約1時間55分'])
  })

  it('uses the Annict episode count when Shikimori has none, and shows nothing it does not know', () => {
    expect(episodeFacts({ format: 'TV', status: 'FINISHED', episodes: 0, duration: 24 }, 12)).toEqual(['全12話', '一気見 約4時間48分'])
    expect(episodeFacts({ format: 'TV', status: 'FINISHED' })).toEqual([])
    expect(episodeFacts({ format: 'OVA', status: 'FINISHED', episodes: 1, duration: 30 })).toEqual(['全1話', '約30分'])
  })
})
