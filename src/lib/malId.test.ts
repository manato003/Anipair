import { describe, expect, it } from 'vitest'
import { idMalOf, malIdOf } from './malId'

describe('malIdOf / idMalOf', () => {
  it('reads a positive whole number, and nothing otherwise', () => {
    expect(malIdOf({ malAnimeId: '52991' })).toBe(52991)
    for (const v of [null, undefined, '', '0', '-3', '1.5', 'abc']) expect(malIdOf({ malAnimeId: v })).toBeNull()
    expect(idMalOf('52991')).toBe(52991)
    expect(idMalOf(null)).toBeUndefined()
  })
})
