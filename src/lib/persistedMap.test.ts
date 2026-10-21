// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistedMap } from './persistedMap'

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

const str = (v: unknown) => (typeof v === 'string' ? v : null)

describe('persistedMap', () => {
  it('reads what was kept, skipping values of the wrong shape', () => {
    localStorage.setItem('animax.peopleEn.v1', JSON.stringify({ 悠木碧: 'Aoi Yūki', 壊れた: 3 }))
    const m = persistedMap('peopleEn', 10, str)
    expect(m.get('悠木碧')).toBe('Aoi Yūki')
    expect(m.has('壊れた')).toBe(false)
  })

  it('writes once for several changes in a row, keeping only the newest entries', () => {
    vi.useFakeTimers()
    const m = persistedMap('titleEn', 2, str)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    m.set('1', 'A')
    m.set('2', 'B')
    m.set('1', 'A2')
    m.set('3', 'C')
    expect(setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(setItem).toHaveBeenCalledTimes(1)
    // 入れ直した 1 は新しい方に回るので、古い 2 から落ちる
    expect(JSON.parse(localStorage.getItem('animax.titleEn.v1')!)).toEqual({ 1: 'A2', 3: 'C' })
    setItem.mockRestore()
  })

  it('starts empty when what was kept is broken', () => {
    localStorage.setItem('animax.titleEn.v1', '{not json')
    expect(persistedMap('titleEn', 10, str).get('1')).toBeUndefined()
  })
})
