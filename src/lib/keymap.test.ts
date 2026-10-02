import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYMAP, actionForKey, assignKey, keyLabel, normalizeKey, parseKeymap, rangeLabel } from './keymap'

describe('normalizeKey', () => {
  it.each([
    ['W', 'w'],
    ['w', 'w'],
    ['7', '7'],
    [';', ';'],
    ['ArrowLeft', 'ArrowLeft'],
    ['Backspace', 'Backspace'],
  ])('%s → %s', (key, want) => {
    expect(normalizeKey(key)).toBe(want)
  })

  it.each([' ', 'Enter', 'Escape', 'Tab', 'Shift', 'F5', ''])('refuses %j', (key) => {
    expect(normalizeKey(key)).toBeNull()
  })
})

describe('parseKeymap', () => {
  it('fills missing and invalid entries from the defaults', () => {
    const m = parseKeymap({ wanna: 'q', pass: 'Enter', undo: 'ZZ', rateBad: 'ArrowLeft' })
    expect(m).toEqual({ ...DEFAULT_KEYMAP, wanna: 'q', rateBad: 'ArrowLeft' })
  })

  it('falls back to the defaults when two stored actions share a key', () => {
    expect(parseKeymap({ wanna: 'p', pass: 'p' })).toEqual(DEFAULT_KEYMAP)
  })

  it('gives an action missing from the saved map its default key, or a free one if that is taken', () => {
    // スルーを足す前に保存された割り当て（later が無い）で、既定の S を見たいに使っていた
    const saved = { ...DEFAULT_KEYMAP, wanna: 's' } as Record<string, string>
    delete saved.later
    const m = parseKeymap(saved)
    expect(m.wanna).toBe('s')
    expect(m.later).toBe('q')
    expect(new Set(Object.values(m)).size).toBe(Object.keys(m).length)
  })

  it('gives a map saved before "detail" existed the default I, without touching the other keys', () => {
    const saved = { ...DEFAULT_KEYMAP, wanna: 'q', rateBad: 'ArrowLeft' } as Record<string, string>
    delete saved.detail
    expect(parseKeymap(saved)).toEqual({ ...DEFAULT_KEYMAP, wanna: 'q', rateBad: 'ArrowLeft', detail: 'i' })
  })

  it('gives "detail" a spare key when the saved map already uses I, keeping the other keys', () => {
    const saved = { ...DEFAULT_KEYMAP, wanna: 'i' } as Record<string, string>
    delete saved.detail
    const m = parseKeymap(saved)
    expect(m).toEqual({ ...DEFAULT_KEYMAP, wanna: 'i', detail: 'q' })
    expect(new Set(Object.values(m)).size).toBe(Object.keys(m).length)
  })

  it('gives a map saved before "watching" existed the default E, or a spare key when E is taken', () => {
    const saved = { ...DEFAULT_KEYMAP, wanna: 'q' } as Record<string, string>
    delete saved.watching
    expect(parseKeymap(saved)).toEqual({ ...DEFAULT_KEYMAP, wanna: 'q' })
    const taken = { ...DEFAULT_KEYMAP, wanna: 'e' } as Record<string, string>
    delete taken.watching
    const m = parseKeymap(taken)
    expect(m).toEqual({ ...DEFAULT_KEYMAP, wanna: 'e', watching: 'q' })
    expect(new Set(Object.values(m)).size).toBe(Object.keys(m).length)
  })

  it('handles a map saved before both "detail" and "watching" existed', () => {
    const saved = { ...DEFAULT_KEYMAP, undo: 'e' } as Record<string, string>
    delete saved.detail
    delete saved.watching
    const m = parseKeymap(saved)
    expect(m).toEqual({ ...DEFAULT_KEYMAP, undo: 'e', watching: 'q' })
  })

  it('prefers free defaults before handing out spare keys', () => {
    // 保存に無いパスの既定 P が埋まっているとき、スルーが既定の S を先に取り、パスに空きキーが回る
    const m = parseKeymap({ wanna: 'p' })
    expect(m.wanna).toBe('p')
    expect(m.later).toBe('s')
    expect(m.pass).toBe('q')
  })

  it.each([null, 'x', [], 5])('treats %j as the defaults', (v) => {
    expect(parseKeymap(v)).toEqual(DEFAULT_KEYMAP)
  })
})

describe('assignKey', () => {
  it('assigns a free key without touching others', () => {
    const m = assignKey(DEFAULT_KEYMAP, 'wanna', 'q')
    expect(m.wanna).toBe('q')
    expect({ ...m, wanna: DEFAULT_KEYMAP.wanna }).toEqual(DEFAULT_KEYMAP)
  })

  it('swaps with the action that already had the key', () => {
    const m = assignKey(DEFAULT_KEYMAP, 'pass', '0')
    expect(m.pass).toBe('0')
    expect(m.skip).toBe('p')
    expect(new Set(Object.values(m)).size).toBe(Object.keys(m).length)
  })

  it('keeps every key unique after any sequence of assignments', () => {
    let m = DEFAULT_KEYMAP
    const moves: [keyof typeof m, string][] = [['undo', '1'], ['rateBad', 'w'], ['wanna', 'z'], ['pass', 'ArrowLeft'], ['skip', 'ArrowLeft']]
    for (const [a, k] of moves) {
      m = assignKey(m, a, k)
      expect(new Set(Object.values(m)).size).toBe(Object.keys(m).length)
    }
    expect(m.skip).toBe('ArrowLeft')
  })
})

describe('actionForKey', () => {
  it('finds the action regardless of letter case, and nothing for unbound keys', () => {
    expect(actionForKey(DEFAULT_KEYMAP, 'W')).toBe('wanna')
    expect(actionForKey(DEFAULT_KEYMAP, '3')).toBe('rateGood')
    expect(actionForKey(DEFAULT_KEYMAP, 'x')).toBeNull()
    expect(actionForKey(DEFAULT_KEYMAP, 'Enter')).toBeNull()
  })
})

describe('labels', () => {
  it('shows letters in upper case and arrows as symbols', () => {
    expect(keyLabel('w')).toBe('W')
    expect(keyLabel('ArrowRight')).toBe('→')
  })

  it('shortens consecutive digits to a range and lists anything else', () => {
    expect(rangeLabel(['1', '2', '3', '4'])).toBe('1〜4')
    expect(rangeLabel(['1', '3', '2', '4'])).toBe('1324')
    expect(rangeLabel(['a', 's', 'd', 'f'])).toBe('ASDF')
  })
})
